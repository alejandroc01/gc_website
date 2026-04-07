const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const express = require("express");
const multer = require("multer");

const {
    addScrapbookPage,
    deleteScrapbook,
    getScrapbookById,
    listScrapbooks,
} = require("../utils/scrapbookStore");
const {
    buildScrapbookStoredFilePath,
    isAllowedScrapbookUpload,
    resolveExtensionFromScrapbookUpload,
    resolveStoredFileAbsolutePath,
    scrapbookUploadSessionsDirectory,
    scrapbookUploadsDirectory,
} = require("../utils/uploadConfig");

const router = express.Router();
const maxScrapbookUploadBytes = 25 * 1024 * 1024;
const scrapbookUploadChunkSizeBytes = 256 * 1024;
const maxScrapbookUploadChunkBytes = 512 * 1024;

const chunkUpload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (_req, file, callback) => {
        if (!isAllowedScrapbookUpload(file)) {
            const error = new Error("Only JPG and JPEG scrapbook page uploads are allowed.");
            error.statusCode = 400;
            return callback(error);
        }

        return callback(null, true);
    },
    limits: {
        files: 1,
        fileSize: maxScrapbookUploadChunkBytes,
    },
});

router.get("/", async (_req, res, next) => {
    try {
        const scrapbooks = await listScrapbooks();
        return res.json(scrapbooks);
    } catch (error) {
        return next(error);
    }
});

router.get("/:scrapbookId", async (req, res, next) => {
    try {
        const scrapbook = await getScrapbookById(req.params.scrapbookId);

        if (!scrapbook) {
            return res.status(404).json({ error: "Scrapbook not found." });
        }

        return res.json(scrapbook);
    } catch (error) {
        return next(error);
    }
});

router.post("/upload-sessions", async (req, res, next) => {
    try {
        const scrapbookYear = sanitizeScrapbookYear(req.body?.scrapbookYear);
        const originalFilename = sanitizeOriginalFilename(req.body?.originalFilename);
        const mimeType = sanitizeOptionalMimeType(req.body?.mimeType);
        const totalSize = sanitizeScrapbookUploadSize(req.body?.totalSize);
        const totalChunks = sanitizeScrapbookUploadChunkCount(req.body?.totalChunks, totalSize);

        assertAllowedScrapbookUploadFile({
            originalname: originalFilename,
            mimetype: mimeType,
        });

        const uploadSession = createScrapbookUploadSessionRecord({
            scrapbookYear,
            originalFilename,
            mimeType,
            totalSize,
            totalChunks,
        });

        await writeScrapbookUploadSession(uploadSession);

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

        const uploadSession = await readScrapbookUploadSession(req.params.uploadId);

        if (!uploadSession) {
            return res.status(404).json({ error: "Upload session not found." });
        }

        const chunkIndex = sanitizeScrapbookUploadChunkIndex(req.body?.chunkIndex, uploadSession.totalChunks);
        const expectedMaxChunkSize = calculateExpectedChunkByteLength(uploadSession, chunkIndex);

        if (req.file.buffer.length > expectedMaxChunkSize) {
            const error = new Error("Uploaded chunk is larger than expected for this scrapbook page.");
            error.statusCode = 400;
            throw error;
        }

        const nextChunkPath = buildScrapbookUploadChunkPath(uploadSession.uploadId, chunkIndex);
        await fs.writeFile(nextChunkPath, req.file.buffer);

        uploadSession.receivedChunkIndices = Array.from(
            new Set([...(uploadSession.receivedChunkIndices || []), chunkIndex]),
        ).sort((leftValue, rightValue) => leftValue - rightValue);
        uploadSession.chunkSizes = {
            ...(uploadSession.chunkSizes || {}),
            [chunkIndex]: req.file.buffer.length,
        };
        uploadSession.updatedAt = new Date().toISOString();
        await writeScrapbookUploadSession(uploadSession);

        const uploadSummary = summarizeScrapbookUploadSession(uploadSession);

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
    let finalImagePath = null;
    let scrapbookPageAdded = false;

    try {
        const uploadSession = await readScrapbookUploadSession(req.params.uploadId);

        if (!uploadSession) {
            return res.status(404).json({ error: "Upload session not found." });
        }

        const uploadSummary = summarizeScrapbookUploadSession(uploadSession);

        if (!uploadSummary.isComplete) {
            const error = new Error("Upload is still in progress. Finish uploading all chunks first.");
            error.statusCode = 400;
            throw error;
        }

        assembledImagePath = buildScrapbookUploadAssembledPath(uploadSession.uploadId, uploadSession.extension);
        await fs.writeFile(assembledImagePath, "");

        for (let chunkIndex = 0; chunkIndex < uploadSession.totalChunks; chunkIndex += 1) {
            const chunkPath = buildScrapbookUploadChunkPath(uploadSession.uploadId, chunkIndex);
            const chunkBuffer = await fs.readFile(chunkPath);
            await fs.appendFile(assembledImagePath, chunkBuffer);
        }

        const assembledFileStats = await fs.stat(assembledImagePath);

        if (assembledFileStats.size !== uploadSession.totalSize) {
            const error = new Error("The uploaded chunks did not reassemble into the expected file size.");
            error.statusCode = 400;
            throw error;
        }

        const finalPageDirectory = path.join(
            scrapbookUploadsDirectory,
            buildScrapbookDirectoryName(uploadSession.scrapbookYear),
            "pages",
        );
        await fs.mkdir(finalPageDirectory, { recursive: true });

        const finalFilename = buildScrapbookPageFilename(
            uploadSession.scrapbookYear,
            uploadSession.originalFilename,
            uploadSession.extension,
        );
        finalImagePath = path.join(finalPageDirectory, finalFilename);
        await moveFileSafely(assembledImagePath, finalImagePath);
        assembledImagePath = finalImagePath;

        const createdOrUpdatedScrapbook = await addScrapbookPage({
            scrapbookYear: uploadSession.scrapbookYear,
            originalFilename: uploadSession.originalFilename,
            storedFilePath: buildScrapbookStoredFilePath(
                buildScrapbookDirectoryName(uploadSession.scrapbookYear),
                "pages",
                finalFilename,
            ),
            uploadTimestamp: new Date().toISOString(),
        });
        scrapbookPageAdded = true;

        try {
            await deleteScrapbookUploadSession(uploadSession.uploadId);
        } catch (cleanupError) {
            console.error("Failed to remove completed scrapbook upload session:", cleanupError);
        }

        return res.status(201).json(createdOrUpdatedScrapbook);
    } catch (error) {
        if (!scrapbookPageAdded) {
            if (assembledImagePath) {
                await fs.rm(assembledImagePath, { force: true });
            }

            try {
                await deleteScrapbookUploadSession(req.params.uploadId);
            } catch (cleanupError) {
                if (cleanupError.statusCode !== 400) {
                    console.error("Failed to remove failed scrapbook upload session:", cleanupError);
                }
            }
        }

        return next(error);
    }
});

router.delete("/upload-sessions/:uploadId", async (req, res, next) => {
    try {
        await deleteScrapbookUploadSession(req.params.uploadId);

        return res.json({
            success: true,
            uploadId: String(req.params.uploadId || ""),
        });
    } catch (error) {
        return next(error);
    }
});

router.delete("/:scrapbookId", async (req, res, next) => {
    try {
        const deletedScrapbook = await deleteScrapbook(req.params.scrapbookId);

        if (!deletedScrapbook) {
            return res.status(404).json({ error: "Scrapbook not found." });
        }

        const sampleStoredPath = deletedScrapbook.pdfStoredFilePath
            || deletedScrapbook.pageImagePaths?.[0]
            || "";

        if (sampleStoredPath) {
            const absoluteStoredPath = resolveStoredFileAbsolutePath(sampleStoredPath);
            const scrapbookDirectory = deletedScrapbook.pdfStoredFilePath
                ? path.dirname(absoluteStoredPath)
                : path.dirname(path.dirname(absoluteStoredPath));
            await fs.rm(scrapbookDirectory, { recursive: true, force: true });
        }

        return res.json({
            success: true,
            scrapbookId: deletedScrapbook.scrapbookId,
        });
    } catch (error) {
        return next(error);
    }
});

function sanitizeScrapbookYear(rawYear) {
    const normalizedYear = String(rawYear || "").trim();

    // Safety check: only allow numeric four-digit years in the accepted archive range.
    if (!/^\d{4}$/.test(normalizedYear)) {
        const error = new Error("Enter a valid scrapbook year.");
        error.statusCode = 400;
        throw error;
    }

    const parsedYear = Number(normalizedYear);

    if (parsedYear < 1962 || parsedYear > 9999) {
        const error = new Error("Enter a valid scrapbook year.");
        error.statusCode = 400;
        throw error;
    }

    return normalizedYear;
}

function buildScrapbookDirectoryName(scrapbookYear) {
    return `${scrapbookYear}_scrapbook`;
}

function buildScrapbookPageFilename(scrapbookYear, originalFilename, extension) {
    const normalizedExtension = sanitizeScrapbookUploadExtension(extension);
    const basename = path.basename(String(originalFilename || ""), path.extname(String(originalFilename || "")));
    const sanitizedBasename = basename
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        || `page-${Date.now()}`;

    return `${scrapbookYear}-${sanitizedBasename}${normalizedExtension}`;
}

function createScrapbookUploadSessionRecord({
    scrapbookYear,
    originalFilename,
    mimeType,
    totalSize,
    totalChunks,
}) {
    const uploadId = crypto.randomUUID();
    const extension = sanitizeScrapbookUploadExtension(
        resolveExtensionFromScrapbookUpload({
            originalname: originalFilename,
            mimetype: mimeType,
        }),
    );
    const now = new Date().toISOString();

    return {
        uploadId,
        scrapbookYear,
        originalFilename,
        mimeType,
        extension,
        totalSize,
        totalChunks,
        chunkSize: scrapbookUploadChunkSizeBytes,
        receivedChunkIndices: [],
        chunkSizes: {},
        createdAt: now,
        updatedAt: now,
    };
}

async function readScrapbookUploadSession(uploadId) {
    try {
        const manifestContents = await fs.readFile(buildScrapbookUploadManifestPath(uploadId), "utf8");
        return normalizeScrapbookUploadSession(JSON.parse(manifestContents));
    } catch (error) {
        if (error.code === "ENOENT") {
            return null;
        }

        throw error;
    }
}

async function writeScrapbookUploadSession(uploadSession) {
    const normalizedSession = normalizeScrapbookUploadSession(uploadSession);
    const uploadSessionDirectory = buildScrapbookUploadSessionDirectory(normalizedSession.uploadId);
    await fs.mkdir(uploadSessionDirectory, { recursive: true });
    await fs.writeFile(
        buildScrapbookUploadManifestPath(normalizedSession.uploadId),
        JSON.stringify(normalizedSession, null, 2),
    );
}

async function deleteScrapbookUploadSession(uploadId) {
    const uploadSessionDirectory = buildScrapbookUploadSessionDirectory(uploadId);
    await fs.rm(uploadSessionDirectory, { recursive: true, force: true });
}

function summarizeScrapbookUploadSession(uploadSession) {
    const receivedChunkIndices = normalizeScrapbookUploadChunkIndices(uploadSession.receivedChunkIndices);
    const uploadedBytes = receivedChunkIndices.reduce(
        (total, chunkIndex) => total + Number(uploadSession.chunkSizes?.[chunkIndex] || 0),
        0,
    );

    return {
        uploadId: uploadSession.uploadId,
        uploadedBytes,
        totalBytes: uploadSession.totalSize,
        receivedChunkCount: receivedChunkIndices.length,
        totalChunks: uploadSession.totalChunks,
        isComplete: receivedChunkIndices.length === uploadSession.totalChunks,
    };
}

function normalizeScrapbookUploadSession(uploadSession) {
    return {
        uploadId: sanitizeScrapbookUploadSessionId(uploadSession?.uploadId),
        scrapbookYear: sanitizeScrapbookYear(uploadSession?.scrapbookYear),
        originalFilename: sanitizeOriginalFilename(uploadSession?.originalFilename),
        mimeType: sanitizeOptionalMimeType(uploadSession?.mimeType),
        extension: sanitizeScrapbookUploadExtension(uploadSession?.extension),
        totalSize: sanitizeScrapbookUploadSize(uploadSession?.totalSize),
        totalChunks: sanitizeScrapbookUploadChunkCount(
            uploadSession?.totalChunks,
            sanitizeScrapbookUploadSize(uploadSession?.totalSize),
        ),
        chunkSize: scrapbookUploadChunkSizeBytes,
        receivedChunkIndices: normalizeScrapbookUploadChunkIndices(uploadSession?.receivedChunkIndices),
        chunkSizes: normalizeScrapbookUploadChunkSizes(uploadSession?.chunkSizes),
        createdAt: sanitizeTimestamp(uploadSession?.createdAt),
        updatedAt: sanitizeTimestamp(uploadSession?.updatedAt),
    };
}

function buildScrapbookUploadSessionDirectory(uploadId) {
    return path.join(
        scrapbookUploadSessionsDirectory,
        sanitizeScrapbookUploadSessionId(uploadId),
    );
}

function buildScrapbookUploadManifestPath(uploadId) {
    return path.join(buildScrapbookUploadSessionDirectory(uploadId), "manifest.json");
}

function buildScrapbookUploadChunkPath(uploadId, chunkIndex) {
    return path.join(
        buildScrapbookUploadSessionDirectory(uploadId),
        `chunk-${sanitizeScrapbookUploadChunkIndex(chunkIndex, Number.MAX_SAFE_INTEGER)}.part`,
    );
}

function buildScrapbookUploadAssembledPath(uploadId, extension) {
    return path.join(
        buildScrapbookUploadSessionDirectory(uploadId),
        `assembled${sanitizeScrapbookUploadExtension(extension)}`,
    );
}

function sanitizeScrapbookUploadSize(rawSize) {
    const parsedSize = Number(rawSize);

    if (!Number.isFinite(parsedSize) || parsedSize <= 0 || !Number.isInteger(parsedSize)) {
        const error = new Error("Scrapbook upload size is invalid.");
        error.statusCode = 400;
        throw error;
    }

    if (parsedSize > maxScrapbookUploadBytes) {
        const error = new Error("Scrapbook page images must be 25 MB or smaller.");
        error.statusCode = 413;
        throw error;
    }

    return parsedSize;
}

function sanitizeScrapbookUploadChunkCount(rawChunkCount, totalSize) {
    const expectedChunkCount = Math.max(1, Math.ceil(totalSize / scrapbookUploadChunkSizeBytes));
    const parsedChunkCount = Number(rawChunkCount);

    if (!Number.isFinite(parsedChunkCount) || !Number.isInteger(parsedChunkCount) || parsedChunkCount <= 0) {
        const error = new Error("Scrapbook upload chunk count is invalid.");
        error.statusCode = 400;
        throw error;
    }

    if (parsedChunkCount !== expectedChunkCount) {
        const error = new Error("Scrapbook upload chunk count does not match the file size.");
        error.statusCode = 400;
        throw error;
    }

    return parsedChunkCount;
}

function sanitizeScrapbookUploadChunkIndex(rawChunkIndex, totalChunks) {
    const parsedChunkIndex = Number(rawChunkIndex);

    if (!Number.isFinite(parsedChunkIndex) || !Number.isInteger(parsedChunkIndex)) {
        const error = new Error("Scrapbook upload chunk index is invalid.");
        error.statusCode = 400;
        throw error;
    }

    if (parsedChunkIndex < 0 || parsedChunkIndex >= totalChunks) {
        const error = new Error("Scrapbook upload chunk index is out of range.");
        error.statusCode = 400;
        throw error;
    }

    return parsedChunkIndex;
}

function sanitizeScrapbookUploadSessionId(rawUploadId) {
    const normalizedUploadId = String(rawUploadId || "").trim();

    if (!/^[a-z0-9-]{10,}$/i.test(normalizedUploadId)) {
        const error = new Error("Scrapbook upload session ID is invalid.");
        error.statusCode = 400;
        throw error;
    }

    return normalizedUploadId;
}

function sanitizeOriginalFilename(rawFilename) {
    const normalizedFilename = String(rawFilename || "").trim();

    if (!normalizedFilename) {
        const error = new Error("Scrapbook upload is missing the original filename.");
        error.statusCode = 400;
        throw error;
    }

    return path.basename(normalizedFilename);
}

function sanitizeOptionalMimeType(rawMimeType) {
    return String(rawMimeType || "").trim().toLowerCase();
}

function sanitizeScrapbookUploadExtension(rawExtension) {
    const normalizedExtension = String(rawExtension || "").trim().toLowerCase();

    if (normalizedExtension === ".jpeg") {
        return ".jpg";
    }

    if ([".jpg", ".png", ".webp"].includes(normalizedExtension)) {
        return normalizedExtension;
    }

    const error = new Error("Scrapbook upload extension is invalid.");
    error.statusCode = 400;
    throw error;
}

function normalizeScrapbookUploadChunkIndices(chunkIndices) {
    if (!Array.isArray(chunkIndices)) {
        return [];
    }

    return Array.from(
        new Set(
            chunkIndices
                .map((chunkIndex) => Number(chunkIndex))
                .filter((chunkIndex) => Number.isInteger(chunkIndex) && chunkIndex >= 0),
        ),
    ).sort((leftValue, rightValue) => leftValue - rightValue);
}

function normalizeScrapbookUploadChunkSizes(chunkSizes) {
    if (!chunkSizes || typeof chunkSizes !== "object") {
        return {};
    }

    return Object.fromEntries(
        Object.entries(chunkSizes)
            .map(([chunkIndex, chunkSize]) => [Number(chunkIndex), Number(chunkSize)])
            .filter(
                ([chunkIndex, chunkSize]) =>
                    Number.isInteger(chunkIndex) && chunkIndex >= 0 && Number.isInteger(chunkSize) && chunkSize >= 0,
            ),
    );
}

function sanitizeTimestamp(rawTimestamp) {
    const normalizedTimestamp = String(rawTimestamp || "").trim();
    return normalizedTimestamp || new Date().toISOString();
}

function calculateExpectedChunkByteLength(uploadSession, chunkIndex) {
    const chunkStart = chunkIndex * uploadSession.chunkSize;
    return Math.min(uploadSession.chunkSize, uploadSession.totalSize - chunkStart);
}

function assertAllowedScrapbookUploadFile(file) {
    if (isAllowedScrapbookUpload(file)) {
        return;
    }

    const error = new Error("Only JPG and JPEG scrapbook page uploads are allowed.");
    error.statusCode = 400;
    throw error;
}

async function moveFileSafely(sourcePath, destinationPath) {
    await fs.mkdir(path.dirname(destinationPath), { recursive: true });

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
                console.warn("Copied scrapbook page across devices but could not remove the temp source:", unlinkError);
            }
        }
    }
}

module.exports = router;
