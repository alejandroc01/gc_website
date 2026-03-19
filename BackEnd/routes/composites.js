const crypto = require("crypto");
const fs = require("fs/promises");
const { createReadStream, createWriteStream } = require("fs");
const path = require("path");
const { pipeline } = require("stream/promises");
const express = require("express");
const multer = require("multer");

const { getImageMetadata } = require("../utils/imageMetadata");
const {
    createComposite,
    deleteComposite,
    getCompositeById,
    listComposites,
    replaceAnnotations,
} = require("../utils/compositeStore");
const {
    detectCompositeAnnotations,
} = require("../utils/compositeAutoDetect");
const {
    deleteCompositeOcrState,
    ensureCompositeOcrQueued,
} = require("../utils/compositeOcrQueue");
const { listProfiles } = require("../utils/profileStore");
const {
    allowedMimeTypes,
    extensionByMimeType,
    resolveExtensionFromUpload,
    temporaryCompositeUploadsDirectory,
    uploadsDirectory,
} = require("../utils/uploadConfig");

const router = express.Router();
const compositeUploadChunkSize = 512 * 1024;

const upload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, callback) => {
            callback(null, uploadsDirectory);
        },
        filename: (req, file, callback) => {
            const compositeId = crypto.randomUUID();
            const extension = resolveExtensionFromUpload(file);

            req.generatedCompositeId = compositeId;
            callback(null, `${compositeId}${extension}`);
        },
    }),
    fileFilter: (_req, file, callback) => {
        if (!allowedMimeTypes.has(file.mimetype)) {
            const error = new Error("Only JPG, JPEG, PNG, and WEBP image uploads are allowed.");
            error.statusCode = 400;
            return callback(error);
        }

        return callback(null, true);
    },
    limits: {
        files: 1,
        fileSize: 25 * 1024 * 1024,
    },
});

const chunkUpload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (_req, file, callback) => {
        if (!allowedMimeTypes.has(file.mimetype)) {
            const error = new Error("Only JPG, JPEG, PNG, and WEBP image uploads are allowed.");
            error.statusCode = 400;
            return callback(error);
        }

        return callback(null, true);
    },
    limits: {
        files: 1,
        fileSize: compositeUploadChunkSize,
    },
});

router.get("/", async (_req, res, next) => {
    try {
        const composites = await listComposites();
        res.json(composites);
    } catch (error) {
        next(error);
    }
});

router.post("/upload-sessions", async (req, res, next) => {
    try {
        const compositeYear = sanitizeCompositeYear(req.body?.compositeYear);
        const originalFilename = sanitizeOriginalFilename(req.body?.originalFilename);
        const mimeType = sanitizeMimeType(req.body?.mimeType);
        await ensureCompositeYearAvailable(compositeYear);

        const uploadId = crypto.randomUUID();
        const uploadSession = {
            uploadId,
            compositeYear,
            originalFilename,
            mimeType,
            totalChunks: null,
            receivedChunkIndexes: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        await writeUploadSession(uploadId, uploadSession);

        return res.status(201).json({
            uploadId,
            compositeYear,
            chunkSize: compositeUploadChunkSize,
        });
    } catch (error) {
        return next(error);
    }
});

router.post("/upload-sessions/:uploadId/chunks", chunkUpload.single("imageChunk"), async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "Please upload an image chunk." });
        }

        const uploadId = sanitizeUploadId(req.params.uploadId);
        const uploadSession = await readUploadSession(uploadId);

        if (!uploadSession) {
            return res.status(404).json({ error: "Composite upload session not found." });
        }

        const chunkIndex = sanitizeChunkIndex(req.body?.chunkIndex);
        const totalChunks = sanitizeTotalChunks(req.body?.totalChunks);
        const nextReceivedChunkIndexes = new Set(uploadSession.receivedChunkIndexes || []);

        if (
            Number.isInteger(uploadSession.totalChunks)
            && uploadSession.totalChunks > 0
            && uploadSession.totalChunks !== totalChunks
        ) {
            return res.status(400).json({ error: "Chunk count does not match the active upload session." });
        }

        if (chunkIndex >= totalChunks) {
            return res.status(400).json({ error: "Chunk index is out of range for this upload." });
        }

        await fs.writeFile(getUploadChunkPath(uploadId, chunkIndex), req.file.buffer);
        nextReceivedChunkIndexes.add(chunkIndex);

        await writeUploadSession(uploadId, {
            ...uploadSession,
            totalChunks,
            receivedChunkIndexes: Array.from(nextReceivedChunkIndexes).sort((leftIndex, rightIndex) => leftIndex - rightIndex),
            updatedAt: new Date().toISOString(),
        });

        return res.status(201).json({
            uploadId,
            receivedChunkCount: nextReceivedChunkIndexes.size,
            totalChunks,
        });
    } catch (error) {
        return next(error);
    }
});

router.post("/upload-sessions/:uploadId/complete", async (req, res, next) => {
    let assembledUploadPath = null;

    try {
        const uploadId = sanitizeUploadId(req.params.uploadId);
        const uploadSession = await readUploadSession(uploadId);

        if (!uploadSession) {
            return res.status(404).json({ error: "Composite upload session not found." });
        }

        await ensureCompositeYearAvailable(uploadSession.compositeYear);

        if (!Number.isInteger(uploadSession.totalChunks) || uploadSession.totalChunks <= 0) {
            return res.status(400).json({ error: "Composite upload is incomplete." });
        }

        for (let chunkIndex = 0; chunkIndex < uploadSession.totalChunks; chunkIndex += 1) {
            if (!(await hasUploadChunk(uploadId, chunkIndex))) {
                return res.status(400).json({ error: "Composite upload is missing one or more chunks." });
            }
        }

        const extension = resolveChunkedUploadExtension(uploadSession);
        assembledUploadPath = path.join(
            temporaryCompositeUploadsDirectory,
            `${uploadId}-assembled${extension}`,
        );

        await assembleUploadedChunks(uploadId, uploadSession.totalChunks, assembledUploadPath);

        const createdComposite = await saveUploadedComposite({
            compositeYear: uploadSession.compositeYear,
            originalFilename: uploadSession.originalFilename,
            sourceFilePath: assembledUploadPath,
            extension,
        });

        await cleanupUploadSession(uploadId, uploadSession.totalChunks, assembledUploadPath);
        return res.status(201).json(createdComposite);
    } catch (error) {
        if (assembledUploadPath) {
            await fs.rm(assembledUploadPath, { force: true });
        }

        return next(error);
    }
});

router.get("/:compositeId", async (req, res, next) => {
    try {
        const composite = await getCompositeById(req.params.compositeId);

        if (!composite) {
            return res.status(404).json({ error: "Composite not found." });
        }

        return res.json(composite);
    } catch (error) {
        return next(error);
    }
});

router.post("/", upload.single("image"), async (req, res, next) => {
    let currentUploadedPath = req.file?.path || null;

    const cleanupUploadedFile = async () => {
        if (!currentUploadedPath) {
            return;
        }

        try {
            await fs.unlink(currentUploadedPath);
        } catch (cleanupError) {
            if (cleanupError.code !== "ENOENT") {
                console.error("Failed to clean up rejected composite upload:", cleanupError);
            }
        }
    };

    try {
        if (!req.file) {
            return res.status(400).json({ error: "Please upload a composite image." });
        }

        const compositeYear = sanitizeCompositeYear(req.body?.compositeYear);
        await ensureCompositeYearAvailable(compositeYear);
        const createdComposite = await saveUploadedComposite({
            compositeYear,
            originalFilename: req.file.originalname,
            sourceFilePath: req.file.path,
            extension: path.extname(req.file.filename),
            compositeId: req.generatedCompositeId,
        });
        currentUploadedPath = null;

        return res.status(201).json(createdComposite);
    } catch (error) {
        await cleanupUploadedFile();
        return next(error);
    }
});

router.delete("/:compositeId", async (req, res, next) => {
    try {
        const deletedComposite = await deleteComposite(req.params.compositeId);

        if (!deletedComposite) {
            return res.status(404).json({ error: "Composite not found." });
        }

        const absoluteStoredPath = path.join(__dirname, "..", deletedComposite.storedFilePath);

        try {
            await fs.unlink(absoluteStoredPath);
        } catch (error) {
            if (error.code !== "ENOENT") {
                throw error;
            }
        }

        await deleteCompositeOcrState(deletedComposite.compositeId);

        return res.json({
            success: true,
            compositeId: deletedComposite.compositeId,
        });
    } catch (error) {
        return next(error);
    }
});

router.get("/:compositeId/text-boxes", async (req, res, next) => {
    try {
        const composite = await getCompositeById(req.params.compositeId);

        if (!composite) {
            return res.status(404).json({ error: "Composite not found." });
        }

        const ocrState = await ensureCompositeOcrQueued(composite.compositeId);

        return res.status(ocrState.status === "ready" ? 200 : 202).json({
            compositeId: composite.compositeId,
            ocrStatus: ocrState.status,
            textBoxes: ocrState.textBoxes || [],
            generatedAt: ocrState.generatedAt || null,
            error: ocrState.error || null,
        });
    } catch (error) {
        return next(error);
    }
});

router.post("/:compositeId/auto-detect", async (req, res, next) => {
    try {
        const composite = await getCompositeById(req.params.compositeId);

        if (!composite) {
            return res.status(404).json({ error: "Composite not found." });
        }

        const profiles = await listProfiles();
        const existingAnnotations = Array.isArray(req.body?.existingAnnotations)
            ? req.body.existingAnnotations
            : composite.annotations || [];
        const referenceAnnotation = req.body?.referenceAnnotation || null;
        const ocrState = await ensureCompositeOcrQueued(composite.compositeId);

        if (ocrState.status !== "ready") {
            return res.status(202).json({
                compositeId: composite.compositeId,
                ocrStatus: ocrState.status,
                textBoxes: ocrState.textBoxes || [],
                generatedAt: ocrState.generatedAt || null,
                error: ocrState.error || null,
                message: ocrState.status === "error"
                    ? "OCR processing failed. Refresh the page to queue another OCR pass."
                    : "OCR is still processing in the background. Auto-fill will unlock when the name boxes are ready.",
            });
        }

        const detectionResult = await detectCompositeAnnotations({
            composite,
            profiles,
            existingAnnotations,
            referenceAnnotation,
            textBoxes: ocrState.textBoxes || [],
            generatedAt: ocrState.generatedAt || null,
        });

        return res.json({
            compositeId: composite.compositeId,
            ocrStatus: ocrState.status,
            ...detectionResult,
        });
    } catch (error) {
        return next(error);
    }
});

router.put("/:compositeId/annotations", async (req, res, next) => {
    try {
        const annotations = Array.isArray(req.body?.annotations) ? req.body.annotations : null;

        if (!annotations) {
            return res.status(400).json({ error: "Request body must include an annotations array." });
        }

        const profiles = await listProfiles();
        const updatedComposite = await replaceAnnotations(
            req.params.compositeId,
            annotations,
            new Set(profiles.map((profile) => profile.id)),
        );

        if (!updatedComposite) {
            return res.status(404).json({ error: "Composite not found." });
        }

        return res.json(updatedComposite);
    } catch (error) {
        return next(error);
    }
});

async function saveUploadedComposite({
    compositeYear,
    originalFilename,
    sourceFilePath,
    extension,
    compositeId = crypto.randomUUID(),
}) {
    const { width, height } = await getImageMetadata(sourceFilePath);

    if (!compositeId) {
        throw new Error("Composite identifier was not generated for the uploaded file.");
    }

    const namedFilename = buildCompositeFilename(compositeYear, extension);
    const finalAbsolutePath = path.join(uploadsDirectory, namedFilename);

    if (sourceFilePath !== finalAbsolutePath) {
        await fs.rename(sourceFilePath, finalAbsolutePath);
    }

    const storedFilePath = path.posix.join("uploads", "composites", namedFilename);
    const createdComposite = await createComposite({
        compositeId,
        compositeYear,
        displayName: buildCompositeDisplayName(compositeYear),
        originalFilename,
        storedFilePath,
        imageWidth: width,
        imageHeight: height,
        uploadTimestamp: new Date().toISOString(),
    });

    void ensureCompositeOcrQueued(compositeId);
    return createdComposite;
}

async function ensureCompositeYearAvailable(compositeYear) {
    const existingComposites = await listComposites();

    if (existingComposites.some((composite) => composite.compositeYear === compositeYear)) {
        const error = new Error(`A composite for ${compositeYear} already exists.`);
        error.statusCode = 409;
        throw error;
    }
}

function sanitizeOriginalFilename(value) {
    const normalizedValue = String(value || "").trim();

    if (!normalizedValue) {
        const error = new Error("Include the original composite filename when creating an upload session.");
        error.statusCode = 400;
        throw error;
    }

    return path.basename(normalizedValue).slice(0, 180);
}

function sanitizeMimeType(value) {
    const normalizedValue = String(value || "").trim().toLowerCase();

    if (!allowedMimeTypes.has(normalizedValue)) {
        const error = new Error("Only JPG, JPEG, PNG, and WEBP image uploads are allowed.");
        error.statusCode = 400;
        throw error;
    }

    return normalizedValue;
}

function sanitizeUploadId(value) {
    const normalizedValue = String(value || "").trim();

    if (!/^[a-f0-9-]{8,}$/i.test(normalizedValue)) {
        const error = new Error("Composite upload session identifier is invalid.");
        error.statusCode = 400;
        throw error;
    }

    return normalizedValue;
}

function sanitizeChunkIndex(value) {
    const numericValue = Number(value);

    if (!Number.isInteger(numericValue) || numericValue < 0) {
        const error = new Error("Chunk index must be a non-negative integer.");
        error.statusCode = 400;
        throw error;
    }

    return numericValue;
}

function sanitizeTotalChunks(value) {
    const numericValue = Number(value);

    if (!Number.isInteger(numericValue) || numericValue <= 0 || numericValue > 200) {
        const error = new Error("Total chunk count is invalid for this upload.");
        error.statusCode = 400;
        throw error;
    }

    return numericValue;
}

async function readUploadSession(uploadId) {
    try {
        const rawManifest = await fs.readFile(getUploadSessionManifestPath(uploadId), "utf8");
        return JSON.parse(rawManifest);
    } catch (error) {
        if (error.code === "ENOENT") {
            return null;
        }

        throw error;
    }
}

async function writeUploadSession(uploadId, uploadSession) {
    await fs.writeFile(
        getUploadSessionManifestPath(uploadId),
        JSON.stringify(uploadSession, null, 2),
    );
}

function getUploadSessionManifestPath(uploadId) {
    return path.join(temporaryCompositeUploadsDirectory, `${uploadId}.json`);
}

function getUploadChunkPath(uploadId, chunkIndex) {
    return path.join(temporaryCompositeUploadsDirectory, `${uploadId}.part.${chunkIndex}`);
}

async function hasUploadChunk(uploadId, chunkIndex) {
    try {
        await fs.access(getUploadChunkPath(uploadId, chunkIndex));
        return true;
    } catch (error) {
        if (error.code === "ENOENT") {
            return false;
        }

        throw error;
    }
}

function resolveChunkedUploadExtension(uploadSession) {
    const normalizedOriginalExtension = path.extname(uploadSession.originalFilename || "").toLowerCase();

    if ([".jpg", ".jpeg", ".png", ".webp"].includes(normalizedOriginalExtension)) {
        return normalizedOriginalExtension === ".jpeg" ? ".jpg" : normalizedOriginalExtension;
    }

    return extensionByMimeType[uploadSession.mimeType] || ".jpg";
}

async function assembleUploadedChunks(uploadId, totalChunks, outputPath) {
    await fs.rm(outputPath, { force: true });

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
        await pipeline(
            createReadStream(getUploadChunkPath(uploadId, chunkIndex)),
            createWriteStream(outputPath, {
                flags: chunkIndex === 0 ? "w" : "a",
            }),
        );
    }
}

async function cleanupUploadSession(uploadId, totalChunks, assembledUploadPath) {
    const cleanupTasks = [
        fs.rm(getUploadSessionManifestPath(uploadId), { force: true }),
    ];

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
        cleanupTasks.push(fs.rm(getUploadChunkPath(uploadId, chunkIndex), { force: true }));
    }

    if (assembledUploadPath) {
        cleanupTasks.push(fs.rm(assembledUploadPath, { force: true }));
    }

    await Promise.all(cleanupTasks);
}

function sanitizeCompositeYear(rawYear) {
    const normalizedYear = String(rawYear || "").trim();

    if (!/^\d{4}$/.test(normalizedYear)) {
        const error = new Error("Enter a valid four-digit composite year.");
        error.statusCode = 400;
        throw error;
    }

    const yearNumber = Number(normalizedYear);

    if (yearNumber < 1900 || yearNumber > 2100) {
        const error = new Error("Composite year must be between 1900 and 2100.");
        error.statusCode = 400;
        throw error;
    }

    return normalizedYear;
}

function buildCompositeDisplayName(compositeYear) {
    return `${compositeYear}_composite`;
}

function buildCompositeFilename(compositeYear, extension) {
    const normalizedExtension = extension || ".jpg";
    return `${compositeYear}_composite${normalizedExtension}`;
}

module.exports = router;
