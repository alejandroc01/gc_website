const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const express = require("express");
const multer = require("multer");

const {
    createHistory,
    deleteHistory,
    listHistories,
} = require("../utils/historyStore");
const {
    buildHistoryStoredFilePath,
    historyUploadSessionsDirectory,
    historyUploadsDirectory,
    isAllowedHistoryUpload,
    resolveExtensionFromHistoryUpload,
    resolveStoredFileAbsolutePath,
} = require("../utils/uploadConfig");

const router = express.Router();
const maxHistoryUploadBytes = 250 * 1024 * 1024;
const historyUploadChunkSizeBytes = 1024 * 1024;
const maxHistoryUploadChunkBytes = 2 * 1024 * 1024;

const upload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, callback) => {
            callback(null, historyUploadsDirectory);
        },
        filename: (req, file, callback) => {
            const historyId = `history-${crypto.randomUUID()}`;
            const extension = resolveExtensionFromHistoryUpload(file);

            req.generatedHistoryId = historyId;
            callback(null, `${historyId}${extension}`);
        },
    }),
    fileFilter: (_req, file, callback) => {
        if (!isAllowedHistoryUpload(file)) {
            const error = new Error("Only PDF written history uploads are allowed.");
            error.statusCode = 400;
            return callback(error);
        }

        return callback(null, true);
    },
    limits: {
        files: 1,
        fileSize: maxHistoryUploadBytes,
    },
});

const chunkUpload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (_req, file, callback) => {
        if (!isAllowedHistoryUpload(file)) {
            const error = new Error("Only PDF written history uploads are allowed.");
            error.statusCode = 400;
            return callback(error);
        }

        return callback(null, true);
    },
    limits: {
        files: 1,
        fileSize: maxHistoryUploadChunkBytes,
    },
});

router.get("/", async (_req, res, next) => {
    try {
        const histories = await listHistories();
        return res.json(histories);
    } catch (error) {
        return next(error);
    }
});

router.post("/upload-sessions", async (req, res, next) => {
    try {
        const key = sanitizeHistoryKey(req.body?.key);
        const title = sanitizeRequiredText(req.body?.title, "Written history title");
        const description = sanitizeOptionalText(req.body?.description);
        const originalFilename = sanitizeOriginalFilename(req.body?.originalFilename);
        const mimeType = sanitizeOptionalMimeType(req.body?.mimeType);
        const totalSize = sanitizeHistoryUploadSize(req.body?.totalSize);
        const totalChunks = sanitizeHistoryUploadChunkCount(req.body?.totalChunks, totalSize);
        const existingHistories = await listHistories();

        assertAllowedHistoryUploadFile({
            originalname: originalFilename,
            mimetype: mimeType,
        });
        assertHistoryIsUnique(existingHistories, key);

        const uploadSession = createHistoryUploadSessionRecord({
            key,
            title,
            description,
            originalFilename,
            mimeType,
            totalSize,
            totalChunks,
        });

        await writeHistoryUploadSession(uploadSession);

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
            return res.status(400).json({ error: "Attach a PDF chunk to continue uploading." });
        }

        const uploadSession = await readHistoryUploadSession(req.params.uploadId);

        if (!uploadSession) {
            return res.status(404).json({ error: "Upload session not found." });
        }

        const chunkIndex = sanitizeHistoryUploadChunkIndex(req.body?.chunkIndex, uploadSession.totalChunks);
        const expectedMaxChunkSize = calculateExpectedChunkByteLength(uploadSession, chunkIndex);

        if (req.file.buffer.length > expectedMaxChunkSize) {
            const error = new Error("Uploaded chunk is larger than expected for this written history PDF.");
            error.statusCode = 400;
            throw error;
        }

        const nextChunkPath = buildHistoryUploadChunkPath(uploadSession.uploadId, chunkIndex);
        await fs.writeFile(nextChunkPath, req.file.buffer);

        uploadSession.receivedChunkIndices = Array.from(
            new Set([...(uploadSession.receivedChunkIndices || []), chunkIndex]),
        ).sort((leftValue, rightValue) => leftValue - rightValue);
        uploadSession.chunkSizes = {
            ...(uploadSession.chunkSizes || {}),
            [chunkIndex]: req.file.buffer.length,
        };
        uploadSession.updatedAt = new Date().toISOString();
        await writeHistoryUploadSession(uploadSession);

        const uploadSummary = summarizeHistoryUploadSession(uploadSession);

        return res.status(201).json({
            ...uploadSummary,
            chunkIndex,
        });
    } catch (error) {
        return next(error);
    }
});

router.post("/upload-sessions/:uploadId/complete", async (req, res, next) => {
    let assembledPdfPath = null;
    let historyCreated = false;

    try {
        const uploadSession = await readHistoryUploadSession(req.params.uploadId);

        if (!uploadSession) {
            return res.status(404).json({ error: "Upload session not found." });
        }

        const uploadSummary = summarizeHistoryUploadSession(uploadSession);

        if (!uploadSummary.isComplete) {
            const error = new Error("Upload is still in progress. Finish uploading all chunks first.");
            error.statusCode = 400;
            throw error;
        }

        const existingHistories = await listHistories();
        assertHistoryIsUnique(existingHistories, uploadSession.key);

        assembledPdfPath = buildHistoryUploadAssembledPath(uploadSession.uploadId, uploadSession.extension);
        await fs.writeFile(assembledPdfPath, "");

        for (let chunkIndex = 0; chunkIndex < uploadSession.totalChunks; chunkIndex += 1) {
            const chunkPath = buildHistoryUploadChunkPath(uploadSession.uploadId, chunkIndex);
            const chunkBuffer = await fs.readFile(chunkPath);
            await fs.appendFile(assembledPdfPath, chunkBuffer);
        }

        const assembledFileStats = await fs.stat(assembledPdfPath);

        if (assembledFileStats.size !== uploadSession.totalSize) {
            const error = new Error("The uploaded chunks did not reassemble into the expected file size.");
            error.statusCode = 400;
            throw error;
        }

        const namedFilename = buildHistoryFilename(uploadSession.key, uploadSession.extension);
        const finalAbsolutePath = path.join(historyUploadsDirectory, namedFilename);
        await moveFileSafely(assembledPdfPath, finalAbsolutePath);
        assembledPdfPath = finalAbsolutePath;

        const createdHistory = await createHistory({
            historyId: uploadSession.historyId,
            key: uploadSession.key,
            title: uploadSession.title,
            description: uploadSession.description,
            originalFilename: uploadSession.originalFilename,
            fileSize: uploadSession.totalSize,
            mimeType: uploadSession.mimeType,
            storedFilePath: buildHistoryStoredFilePath(namedFilename),
        });
        historyCreated = true;

        try {
            await deleteHistoryUploadSession(uploadSession.uploadId);
        } catch (cleanupError) {
            console.error("Failed to remove completed history upload session:", cleanupError);
        }

        return res.status(201).json(createdHistory);
    } catch (error) {
        if (!historyCreated) {
            if (assembledPdfPath) {
                await fs.rm(assembledPdfPath, { force: true });
            }

            try {
                await deleteHistoryUploadSession(req.params.uploadId);
            } catch (cleanupError) {
                if (cleanupError.statusCode !== 400) {
                    console.error("Failed to remove failed history upload session:", cleanupError);
                }
            }
        }

        return next(error);
    }
});

router.delete("/upload-sessions/:uploadId", async (req, res, next) => {
    try {
        await deleteHistoryUploadSession(req.params.uploadId);

        return res.json({
            success: true,
            uploadId: String(req.params.uploadId || ""),
        });
    } catch (error) {
        return next(error);
    }
});

router.post("/", upload.single("historyPdf"), async (req, res, next) => {
    let currentUploadedPath = req.file?.path || null;

    const cleanupUploadedFile = async () => {
        if (!currentUploadedPath) {
            return;
        }

        try {
            await fs.unlink(currentUploadedPath);
        } catch (cleanupError) {
            if (cleanupError.code !== "ENOENT") {
                console.error("Failed to clean up rejected written history upload:", cleanupError);
            }
        }
    };

    try {
        if (!req.file) {
            return res.status(400).json({ error: "Please upload a written history PDF." });
        }

        const key = sanitizeHistoryKey(req.body?.key);
        const title = sanitizeRequiredText(req.body?.title, "Written history title");
        const description = sanitizeOptionalText(req.body?.description);
        const historyId = req.generatedHistoryId;
        const existingHistories = await listHistories();

        if (!historyId) {
            throw new Error("History identifier was not generated for the uploaded file.");
        }

        assertHistoryIsUnique(existingHistories, key);

        const extension = path.extname(req.file.filename);
        const namedFilename = buildHistoryFilename(key, extension);
        const finalAbsolutePath = path.join(historyUploadsDirectory, namedFilename);

        if (req.file.path !== finalAbsolutePath) {
            await moveFileSafely(req.file.path, finalAbsolutePath);
            currentUploadedPath = finalAbsolutePath;
        }

        const storedFilePath = buildHistoryStoredFilePath(namedFilename);
        const createdHistory = await createHistory({
            historyId,
            key,
            title,
            description,
            originalFilename: req.file.originalname,
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            storedFilePath,
        });

        return res.status(201).json(createdHistory);
    } catch (error) {
        await cleanupUploadedFile();
        return next(error);
    }
});

router.delete("/:historyId", async (req, res, next) => {
    try {
        const deletedHistory = await deleteHistory(req.params.historyId);

        if (!deletedHistory) {
            return res.status(404).json({ error: "Written history not found." });
        }

        const absoluteStoredPath = resolveStoredFileAbsolutePath(deletedHistory.storedFilePath);

        try {
            await fs.unlink(absoluteStoredPath);
        } catch (error) {
            if (error.code !== "ENOENT") {
                throw error;
            }
        }

        return res.json({
            success: true,
            historyId: deletedHistory.historyId,
        });
    } catch (error) {
        return next(error);
    }
});

function sanitizeHistoryKey(rawKey) {
    const normalizedKey = String(rawKey || "").trim().toLowerCase();

    if (!normalizedKey) {
        const error = new Error("Enter a written history key.");
        error.statusCode = 400;
        throw error;
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedKey)) {
        const error = new Error("Use a lowercase slug for the key, with letters, numbers, and hyphens only.");
        error.statusCode = 400;
        throw error;
    }

    return normalizedKey;
}

function sanitizeRequiredText(value, label) {
    const normalizedValue = String(value || "").trim();

    if (!normalizedValue) {
        const error = new Error(`${label} is required.`);
        error.statusCode = 400;
        throw error;
    }

    return normalizedValue.slice(0, 240);
}

function sanitizeOptionalText(value) {
    return String(value || "").trim().slice(0, 1000);
}

function sanitizeOriginalFilename(rawFilename) {
    const normalizedFilename = path.basename(String(rawFilename || "").trim());

    if (normalizedFilename) {
        return normalizedFilename;
    }

    const error = new Error("Written history upload is missing the original filename.");
    error.statusCode = 400;
    throw error;
}

function sanitizeOptionalMimeType(rawMimeType) {
    return String(rawMimeType || "").trim().toLowerCase();
}

function sanitizeHistoryUploadSize(rawSize) {
    const parsedSize = Number(rawSize);

    if (!Number.isInteger(parsedSize) || parsedSize <= 0) {
        const error = new Error("Written history upload size is invalid.");
        error.statusCode = 400;
        throw error;
    }

    if (parsedSize > maxHistoryUploadBytes) {
        const error = new Error("Written history PDFs must be 250 MB or smaller.");
        error.statusCode = 413;
        throw error;
    }

    return parsedSize;
}

function sanitizeHistoryUploadChunkCount(rawChunkCount, totalSize) {
    const parsedChunkCount = Number(rawChunkCount);
    const expectedChunkCount = Math.max(1, Math.ceil(totalSize / historyUploadChunkSizeBytes));

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

function sanitizeHistoryUploadChunkIndex(rawChunkIndex, totalChunks) {
    const parsedChunkIndex = Number(rawChunkIndex);

    if (!Number.isInteger(parsedChunkIndex) || parsedChunkIndex < 0 || parsedChunkIndex >= totalChunks) {
        const error = new Error("Upload chunk index is invalid.");
        error.statusCode = 400;
        throw error;
    }

    return parsedChunkIndex;
}

function sanitizeHistoryUploadSessionId(rawUploadId) {
    const normalizedUploadId = String(rawUploadId || "").trim();

    if (/^[a-z0-9-]{8,80}$/i.test(normalizedUploadId)) {
        return normalizedUploadId;
    }

    const error = new Error("Upload session identifier is invalid.");
    error.statusCode = 400;
    throw error;
}

function sanitizeHistoryUploadExtension(rawExtension) {
    const normalizedExtension = String(rawExtension || "").trim().toLowerCase();

    if ([".pdf"].includes(normalizedExtension)) {
        return normalizedExtension;
    }

    const error = new Error("Written history upload extension is invalid.");
    error.statusCode = 400;
    throw error;
}

function buildHistoryFilename(key, extension) {
    const normalizedExtension = extension || ".pdf";
    return `${key}${normalizedExtension}`;
}

function createHistoryUploadSessionRecord({
    key,
    title,
    description,
    originalFilename,
    mimeType,
    totalSize,
    totalChunks,
}) {
    const uploadId = crypto.randomUUID();
    const extension = sanitizeHistoryUploadExtension(
        resolveExtensionFromHistoryUpload({
            originalname: originalFilename,
            mimetype: mimeType,
        }),
    );
    const now = new Date().toISOString();

    return {
        uploadId,
        historyId: `history-${crypto.randomUUID()}`,
        key,
        title,
        description,
        originalFilename,
        mimeType,
        extension,
        totalSize,
        totalChunks,
        chunkSize: historyUploadChunkSizeBytes,
        receivedChunkIndices: [],
        chunkSizes: {},
        createdAt: now,
        updatedAt: now,
    };
}

async function readHistoryUploadSession(uploadId) {
    try {
        const manifestContents = await fs.readFile(buildHistoryUploadManifestPath(uploadId), "utf8");
        return normalizeHistoryUploadSession(JSON.parse(manifestContents));
    } catch (error) {
        if (error.code === "ENOENT") {
            return null;
        }

        throw error;
    }
}

async function writeHistoryUploadSession(uploadSession) {
    const normalizedSession = normalizeHistoryUploadSession(uploadSession);
    const uploadSessionDirectory = buildHistoryUploadSessionDirectory(normalizedSession.uploadId);

    await fs.mkdir(uploadSessionDirectory, { recursive: true });
    await fs.writeFile(
        buildHistoryUploadManifestPath(normalizedSession.uploadId),
        JSON.stringify(normalizedSession, null, 2),
    );
}

async function deleteHistoryUploadSession(uploadId) {
    const uploadSessionDirectory = buildHistoryUploadSessionDirectory(uploadId);
    await fs.rm(uploadSessionDirectory, { recursive: true, force: true });
}

function normalizeHistoryUploadSession(uploadSession) {
    return {
        uploadId: sanitizeHistoryUploadSessionId(uploadSession?.uploadId),
        historyId: String(uploadSession?.historyId || `history-${crypto.randomUUID()}`),
        key: sanitizeHistoryKey(uploadSession?.key),
        title: sanitizeRequiredText(uploadSession?.title, "Written history title"),
        description: sanitizeOptionalText(uploadSession?.description),
        originalFilename: sanitizeOriginalFilename(uploadSession?.originalFilename),
        mimeType: sanitizeOptionalMimeType(uploadSession?.mimeType),
        extension: sanitizeHistoryUploadExtension(uploadSession?.extension),
        totalSize: sanitizeHistoryUploadSize(uploadSession?.totalSize),
        totalChunks: sanitizeHistoryUploadChunkCount(
            uploadSession?.totalChunks,
            sanitizeHistoryUploadSize(uploadSession?.totalSize),
        ),
        chunkSize: historyUploadChunkSizeBytes,
        receivedChunkIndices: normalizeHistoryUploadChunkIndices(uploadSession?.receivedChunkIndices),
        chunkSizes: normalizeHistoryUploadChunkSizes(uploadSession?.chunkSizes),
        createdAt: uploadSession?.createdAt || new Date().toISOString(),
        updatedAt: uploadSession?.updatedAt || new Date().toISOString(),
    };
}

function summarizeHistoryUploadSession(uploadSession) {
    const receivedChunkIndices = normalizeHistoryUploadChunkIndices(uploadSession.receivedChunkIndices);
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

function normalizeHistoryUploadChunkIndices(chunkIndices) {
    return Array.from(
        new Set(
            (Array.isArray(chunkIndices) ? chunkIndices : [])
                .map((chunkIndex) => Number(chunkIndex))
                .filter((chunkIndex) => Number.isInteger(chunkIndex) && chunkIndex >= 0),
        ),
    ).sort((leftValue, rightValue) => leftValue - rightValue);
}

function normalizeHistoryUploadChunkSizes(chunkSizes) {
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

function buildHistoryUploadSessionDirectory(uploadId) {
    return path.join(
        historyUploadSessionsDirectory,
        sanitizeHistoryUploadSessionId(uploadId),
    );
}

function buildHistoryUploadManifestPath(uploadId) {
    return path.join(buildHistoryUploadSessionDirectory(uploadId), "manifest.json");
}

function buildHistoryUploadChunkPath(uploadId, chunkIndex) {
    return path.join(
        buildHistoryUploadSessionDirectory(uploadId),
        `chunk-${String(sanitizeHistoryUploadChunkIndex(chunkIndex, Number.MAX_SAFE_INTEGER)).padStart(6, "0")}.part`,
    );
}

function buildHistoryUploadAssembledPath(uploadId, extension) {
    return path.join(
        buildHistoryUploadSessionDirectory(uploadId),
        `assembled${sanitizeHistoryUploadExtension(extension)}`,
    );
}

function calculateExpectedChunkByteLength(uploadSession, chunkIndex) {
    const chunkStart = chunkIndex * uploadSession.chunkSize;
    return Math.min(uploadSession.chunkSize, uploadSession.totalSize - chunkStart);
}

function assertAllowedHistoryUploadFile(file) {
    if (isAllowedHistoryUpload(file)) {
        return;
    }

    const error = new Error("Only PDF written history uploads are allowed.");
    error.statusCode = 400;
    throw error;
}

function assertHistoryIsUnique(existingHistories, key) {
    const normalizedKey = String(key || "").trim().toLowerCase();

    if (existingHistories.some((entry) => String(entry.key || "").trim().toLowerCase() === normalizedKey)) {
        const error = new Error(`A written history with key "${normalizedKey}" already exists.`);
        error.statusCode = 409;
        throw error;
    }
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
                console.warn("Copied written history file across devices but could not remove the temp source:", unlinkError);
            }
        }
    }
}

module.exports = router;
