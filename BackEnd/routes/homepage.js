const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const express = require("express");
const multer = require("multer");

const { getImageMetadata } = require("../utils/imageMetadata");
const {
    getHomepageContent,
    getHomepageRecord,
    replaceHomepageContent,
    updateHomepageMetadata,
} = require("../utils/homepageStore");
const {
    buildHomepageStoredFilePath,
    homepageUploadSessionsDirectory,
    homepageUploadsDirectory,
    isAllowedCompositeUpload,
    resolveExtensionFromUpload,
    resolveStoredFileAbsolutePath,
} = require("../utils/uploadConfig");

const router = express.Router();
const maxHomepageImageUploadBytes = 25 * 1024 * 1024;
const homepageUploadChunkSizeBytes = 256 * 1024;
const maxHomepageUploadChunkBytes = 512 * 1024;

const chunkUpload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (_req, file, callback) => {
        if (!isAllowedCompositeUpload(file)) {
            const error = new Error("Only JPG, JPEG, PNG, and WEBP image uploads are allowed.");
            error.statusCode = 400;
            return callback(error);
        }

        return callback(null, true);
    },
    limits: {
        files: 1,
        fileSize: maxHomepageUploadChunkBytes,
    },
});

router.get("/", async (_req, res, next) => {
    try {
        const homepageContent = await getHomepageContent();
        return res.json(homepageContent);
    } catch (error) {
        return next(error);
    }
});

router.put("/", async (req, res, next) => {
    try {
        const title = sanitizeHomepageTitle(req.body?.title);
        const description = sanitizeHomepageDescription(req.body?.description);
        const updatedHomepageContent = await updateHomepageMetadata({ title, description });

        return res.json(updatedHomepageContent);
    } catch (error) {
        return next(error);
    }
});

router.post("/upload-sessions", async (req, res, next) => {
    try {
        const title = sanitizeHomepageTitle(req.body?.title);
        const description = sanitizeHomepageDescription(req.body?.description);
        const originalFilename = sanitizeOriginalFilename(req.body?.originalFilename);
        const mimeType = sanitizeOptionalMimeType(req.body?.mimeType);
        const totalSize = sanitizeHomepageUploadSize(req.body?.totalSize);
        const totalChunks = sanitizeHomepageUploadChunkCount(req.body?.totalChunks, totalSize);

        assertAllowedHomepageUploadFile({
            originalname: originalFilename,
            mimetype: mimeType,
        });

        const uploadSession = createHomepageUploadSessionRecord({
            title,
            description,
            originalFilename,
            mimeType,
            totalSize,
            totalChunks,
        });

        await writeHomepageUploadSession(uploadSession);

        return res.status(201).json({
            uploadId: uploadSession.uploadId,
            chunkSize: uploadSession.chunkSize,
            totalChunks: uploadSession.totalChunks,
            totalSize: uploadSession.totalSize,
        });
    } catch (error) {
        return next(error);
    }
});

router.post("/upload-sessions/:uploadId/chunks", chunkUpload.single("chunk"), async (req, res, next) => {
    try {
        if (!req.file?.buffer) {
            return res.status(400).json({ error: "Attach an image chunk to continue uploading." });
        }

        const uploadSession = await readHomepageUploadSession(req.params.uploadId);

        if (!uploadSession) {
            return res.status(404).json({ error: "Upload session not found." });
        }

        const chunkIndex = sanitizeHomepageUploadChunkIndex(req.body?.chunkIndex, uploadSession.totalChunks);
        const expectedMaxChunkSize = calculateExpectedChunkByteLength(uploadSession, chunkIndex);

        if (req.file.buffer.length > expectedMaxChunkSize) {
            const error = new Error("Uploaded chunk is larger than expected for this homepage image.");
            error.statusCode = 400;
            throw error;
        }

        const nextChunkPath = buildHomepageUploadChunkPath(uploadSession.uploadId, chunkIndex);
        await fs.writeFile(nextChunkPath, req.file.buffer);

        uploadSession.receivedChunkIndices = Array.from(
            new Set([...(uploadSession.receivedChunkIndices || []), chunkIndex]),
        ).sort((leftValue, rightValue) => leftValue - rightValue);
        uploadSession.chunkSizes = {
            ...(uploadSession.chunkSizes || {}),
            [chunkIndex]: req.file.buffer.length,
        };
        uploadSession.updatedAt = new Date().toISOString();
        await writeHomepageUploadSession(uploadSession);

        const uploadSummary = summarizeHomepageUploadSession(uploadSession);

        return res.status(201).json({
            ...uploadSummary,
            chunkIndex,
        });
    } catch (error) {
        return next(error);
    }
});

router.post("/upload-sessions/:uploadId/complete", async (req, res, next) => {
    let assembledImagePath = null;
    let previousImageAbsolutePath = null;
    let homepageUpdateCompleted = false;

    const cleanupAssembledImage = async () => {
        if (!assembledImagePath) {
            return;
        }

        try {
            await fs.unlink(assembledImagePath);
        } catch (cleanupError) {
            if (cleanupError.code !== "ENOENT") {
                console.error("Failed to clean up incomplete homepage upload:", cleanupError);
            }
        }
    };

    try {
        const uploadSession = await readHomepageUploadSession(req.params.uploadId);

        if (!uploadSession) {
            return res.status(404).json({ error: "Upload session not found." });
        }

        const uploadSummary = summarizeHomepageUploadSession(uploadSession);

        if (!uploadSummary.isComplete) {
            const error = new Error("Upload is still in progress. Finish uploading all chunks first.");
            error.statusCode = 400;
            throw error;
        }

        assembledImagePath = buildHomepageUploadAssembledPath(
            uploadSession.uploadId,
            uploadSession.extension,
        );
        await fs.writeFile(assembledImagePath, "");

        for (let chunkIndex = 0; chunkIndex < uploadSession.totalChunks; chunkIndex += 1) {
            const chunkPath = buildHomepageUploadChunkPath(uploadSession.uploadId, chunkIndex);
            const chunkBuffer = await fs.readFile(chunkPath);
            await fs.appendFile(assembledImagePath, chunkBuffer);
        }

        const assembledFileStats = await fs.stat(assembledImagePath);

        if (assembledFileStats.size !== uploadSession.totalSize) {
            const error = new Error("The uploaded chunks did not reassemble into the expected file size.");
            error.statusCode = 400;
            throw error;
        }

        const { width, height } = await getImageMetadata(assembledImagePath);
        const homepageRecord = await getHomepageRecord();

        if (homepageRecord.storedFilePath) {
            previousImageAbsolutePath = resolveStoredFileAbsolutePath(homepageRecord.storedFilePath);
        }

        const namedFilename = buildHomepageImageFilename(uploadSession.extension);
        const finalAbsolutePath = path.join(homepageUploadsDirectory, namedFilename);
        await moveFileSafely(assembledImagePath, finalAbsolutePath);
        assembledImagePath = finalAbsolutePath;

        const storedFilePath = buildHomepageStoredFilePath(namedFilename);
        const updatedHomepageContent = await replaceHomepageContent({
            title: uploadSession.title,
            description: uploadSession.description,
            imageOriginalFilename: uploadSession.originalFilename,
            storedFilePath,
            imageWidth: width,
            imageHeight: height,
        });
        homepageUpdateCompleted = true;

        try {
            await deleteHomepageUploadSession(uploadSession.uploadId);
        } catch (cleanupError) {
            console.error("Failed to remove completed homepage upload session:", cleanupError);
        }

        if (
            previousImageAbsolutePath
            && path.resolve(previousImageAbsolutePath) !== path.resolve(finalAbsolutePath)
        ) {
            try {
                await fs.unlink(previousImageAbsolutePath);
            } catch (cleanupError) {
                if (cleanupError.code !== "ENOENT") {
                    console.error("Failed to delete replaced homepage image:", cleanupError);
                }
            }
        }

        return res.status(201).json(updatedHomepageContent);
    } catch (error) {
        if (!homepageUpdateCompleted) {
            await cleanupAssembledImage();

            try {
                await deleteHomepageUploadSession(req.params.uploadId);
            } catch (cleanupError) {
                if (cleanupError.statusCode !== 400) {
                    console.error("Failed to remove failed homepage upload session:", cleanupError);
                }
            }
        }

        return next(error);
    }
});

router.delete("/upload-sessions/:uploadId", async (req, res, next) => {
    try {
        await deleteHomepageUploadSession(req.params.uploadId);

        return res.json({
            success: true,
            uploadId: String(req.params.uploadId || ""),
        });
    } catch (error) {
        return next(error);
    }
});

function sanitizeHomepageTitle(rawTitle) {
    const normalizedTitle = String(rawTitle || "").trim();

    if (!normalizedTitle) {
        const error = new Error("Enter a homepage header before saving.");
        error.statusCode = 400;
        throw error;
    }

    if (normalizedTitle.length > 160) {
        const error = new Error("Homepage header must be 160 characters or fewer.");
        error.statusCode = 400;
        throw error;
    }

    return normalizedTitle;
}

function sanitizeHomepageDescription(rawDescription) {
    const normalizedDescription = String(rawDescription || "").trim();

    if (!normalizedDescription) {
        const error = new Error("Enter a homepage description before saving.");
        error.statusCode = 400;
        throw error;
    }

    if (normalizedDescription.length > 4000) {
        const error = new Error("Homepage description must be 4000 characters or fewer.");
        error.statusCode = 400;
        throw error;
    }

    return normalizedDescription;
}

function buildHomepageImageFilename(extension) {
    const normalizedExtension = sanitizeHomepageUploadExtension(extension);
    return `homepage-hero-${Date.now()}-${crypto.randomUUID()}${normalizedExtension}`;
}

function createHomepageUploadSessionRecord({
    title,
    description,
    originalFilename,
    mimeType,
    totalSize,
    totalChunks,
}) {
    const uploadId = crypto.randomUUID();
    const extension = resolveExtensionFromUpload({
        originalname: originalFilename,
        mimetype: mimeType,
    });
    const now = new Date().toISOString();

    return {
        uploadId,
        title,
        description,
        originalFilename,
        mimeType,
        extension,
        totalSize,
        totalChunks,
        chunkSize: homepageUploadChunkSizeBytes,
        receivedChunkIndices: [],
        chunkSizes: {},
        createdAt: now,
        updatedAt: now,
    };
}

async function readHomepageUploadSession(uploadId) {
    try {
        const manifestContents = await fs.readFile(buildHomepageUploadManifestPath(uploadId), "utf8");
        return normalizeHomepageUploadSession(JSON.parse(manifestContents));
    } catch (error) {
        if (error.code === "ENOENT") {
            return null;
        }

        throw error;
    }
}

async function writeHomepageUploadSession(uploadSession) {
    const normalizedSession = normalizeHomepageUploadSession(uploadSession);
    const uploadSessionDirectory = buildHomepageUploadSessionDirectory(normalizedSession.uploadId);

    await fs.mkdir(uploadSessionDirectory, { recursive: true });
    await fs.writeFile(
        buildHomepageUploadManifestPath(normalizedSession.uploadId),
        JSON.stringify(normalizedSession, null, 2),
    );
}

async function deleteHomepageUploadSession(uploadId) {
    const uploadSessionDirectory = buildHomepageUploadSessionDirectory(uploadId);
    await fs.rm(uploadSessionDirectory, { recursive: true, force: true });
}

function summarizeHomepageUploadSession(uploadSession) {
    const receivedChunkIndices = normalizeHomepageUploadChunkIndices(uploadSession.receivedChunkIndices);
    const uploadedBytes = Object.values(uploadSession.chunkSizes || {}).reduce(
        (totalBytes, chunkSize) => totalBytes + Number(chunkSize || 0),
        0,
    );

    return {
        uploadId: uploadSession.uploadId,
        totalChunks: uploadSession.totalChunks,
        totalSize: uploadSession.totalSize,
        receivedChunks: receivedChunkIndices.length,
        uploadedBytes,
        isComplete: receivedChunkIndices.length === uploadSession.totalChunks,
    };
}

function normalizeHomepageUploadSession(uploadSession) {
    return {
        uploadId: sanitizeHomepageUploadSessionId(uploadSession?.uploadId),
        title: sanitizeHomepageTitle(uploadSession?.title),
        description: sanitizeHomepageDescription(uploadSession?.description),
        originalFilename: sanitizeOriginalFilename(uploadSession?.originalFilename),
        mimeType: sanitizeOptionalMimeType(uploadSession?.mimeType),
        extension: sanitizeHomepageUploadExtension(uploadSession?.extension),
        totalSize: sanitizeHomepageUploadSize(uploadSession?.totalSize),
        totalChunks: sanitizeHomepageUploadChunkCount(
            uploadSession?.totalChunks,
            sanitizeHomepageUploadSize(uploadSession?.totalSize),
        ),
        chunkSize: homepageUploadChunkSizeBytes,
        receivedChunkIndices: normalizeHomepageUploadChunkIndices(uploadSession?.receivedChunkIndices),
        chunkSizes: normalizeHomepageUploadChunkSizes(uploadSession?.chunkSizes),
        createdAt: uploadSession?.createdAt || new Date().toISOString(),
        updatedAt: uploadSession?.updatedAt || new Date().toISOString(),
    };
}

function buildHomepageUploadSessionDirectory(uploadId) {
    return path.join(
        homepageUploadSessionsDirectory,
        sanitizeHomepageUploadSessionId(uploadId),
    );
}

function buildHomepageUploadManifestPath(uploadId) {
    return path.join(buildHomepageUploadSessionDirectory(uploadId), "manifest.json");
}

function buildHomepageUploadChunkPath(uploadId, chunkIndex) {
    return path.join(
        buildHomepageUploadSessionDirectory(uploadId),
        `chunk-${String(chunkIndex).padStart(6, "0")}.part`,
    );
}

function buildHomepageUploadAssembledPath(uploadId, extension) {
    return path.join(
        buildHomepageUploadSessionDirectory(uploadId),
        `assembled${sanitizeHomepageUploadExtension(extension)}`,
    );
}

function sanitizeHomepageUploadSize(rawSize) {
    const parsedSize = Number(rawSize);

    if (!Number.isInteger(parsedSize) || parsedSize <= 0) {
        const error = new Error("Upload size must be a positive integer.");
        error.statusCode = 400;
        throw error;
    }

    if (parsedSize > maxHomepageImageUploadBytes) {
        const error = new Error("Homepage images must be 25 MB or smaller.");
        error.statusCode = 400;
        throw error;
    }

    return parsedSize;
}

function sanitizeHomepageUploadChunkCount(rawChunkCount, totalSize) {
    const parsedChunkCount = Number(rawChunkCount);
    const expectedChunkCount = Math.max(1, Math.ceil(totalSize / homepageUploadChunkSizeBytes));

    if (!Number.isInteger(parsedChunkCount) || parsedChunkCount <= 0) {
        const error = new Error("Upload chunk count must be a positive integer.");
        error.statusCode = 400;
        throw error;
    }

    if (parsedChunkCount !== expectedChunkCount) {
        const error = new Error("Upload chunk count does not match the expected file size.");
        error.statusCode = 400;
        throw error;
    }

    return parsedChunkCount;
}

function sanitizeHomepageUploadChunkIndex(rawChunkIndex, totalChunks) {
    const parsedChunkIndex = Number(rawChunkIndex);

    if (!Number.isInteger(parsedChunkIndex) || parsedChunkIndex < 0 || parsedChunkIndex >= totalChunks) {
        const error = new Error("Upload chunk index is invalid.");
        error.statusCode = 400;
        throw error;
    }

    return parsedChunkIndex;
}

function sanitizeHomepageUploadSessionId(rawUploadId) {
    const normalizedUploadId = String(rawUploadId || "").trim();

    if (/^[a-z0-9-]{8,80}$/i.test(normalizedUploadId)) {
        return normalizedUploadId;
    }

    const error = new Error("Upload session identifier is invalid.");
    error.statusCode = 400;
    throw error;
}

function sanitizeOriginalFilename(rawFilename) {
    const normalizedFilename = path.basename(String(rawFilename || "").trim());

    if (normalizedFilename) {
        return normalizedFilename;
    }

    const error = new Error("Homepage image upload is missing the original filename.");
    error.statusCode = 400;
    throw error;
}

function sanitizeOptionalMimeType(rawMimeType) {
    return String(rawMimeType || "").trim().toLowerCase();
}

function sanitizeHomepageUploadExtension(rawExtension) {
    const normalizedExtension = String(rawExtension || "").trim().toLowerCase();

    if ([".jpg", ".jpeg", ".png", ".webp"].includes(normalizedExtension)) {
        return normalizedExtension === ".jpeg" ? ".jpg" : normalizedExtension;
    }

    const error = new Error("Homepage image upload extension is invalid.");
    error.statusCode = 400;
    throw error;
}

function normalizeHomepageUploadChunkIndices(chunkIndices) {
    return Array.from(
        new Set(
            (Array.isArray(chunkIndices) ? chunkIndices : [])
                .map((chunkIndex) => Number(chunkIndex))
                .filter((chunkIndex) => Number.isInteger(chunkIndex) && chunkIndex >= 0),
        ),
    ).sort((leftValue, rightValue) => leftValue - rightValue);
}

function normalizeHomepageUploadChunkSizes(chunkSizes) {
    const nextChunkSizes = {};

    for (const [chunkIndex, chunkSize] of Object.entries(chunkSizes || {})) {
        const numericChunkIndex = Number(chunkIndex);
        const numericChunkSize = Number(chunkSize);

        if (
            Number.isInteger(numericChunkIndex)
            && numericChunkIndex >= 0
            && Number.isInteger(numericChunkSize)
            && numericChunkSize >= 0
        ) {
            nextChunkSizes[numericChunkIndex] = numericChunkSize;
        }
    }

    return nextChunkSizes;
}

function calculateExpectedChunkByteLength(uploadSession, chunkIndex) {
    const remainingBytes = uploadSession.totalSize - (chunkIndex * uploadSession.chunkSize);
    return Math.max(0, Math.min(uploadSession.chunkSize, remainingBytes));
}

function assertAllowedHomepageUploadFile(file) {
    if (isAllowedCompositeUpload(file)) {
        return;
    }

    const error = new Error("Only JPG, JPEG, PNG, and WEBP image uploads are allowed.");
    error.statusCode = 400;
    throw error;
}

async function moveFileSafely(sourcePath, destinationPath) {
    try {
        await fs.rename(sourcePath, destinationPath);
    } catch (error) {
        if (error.code !== "EXDEV") {
            throw error;
        }

        await fs.copyFile(sourcePath, destinationPath);

        try {
            await fs.unlink(sourcePath);
        } catch (unlinkError) {
            if (unlinkError.code !== "ENOENT") {
                console.warn("Copied homepage image across devices but could not remove the temp source:", unlinkError);
            }
        }
    }
}

module.exports = router;
