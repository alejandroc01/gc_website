const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const express = require("express");
const multer = require("multer");

const {
    createOralHistory,
    deleteOralHistory,
    listOralHistories,
} = require("../utils/oralHistoryStore");
const {
    buildOralHistoryStoredFilePath,
    isAllowedOralHistoryUpload,
    oralHistoryUploadSessionsDirectory,
    oralHistoryUploadsDirectory,
    resolveStoredFileAbsolutePath,
    resolveExtensionFromOralHistoryUpload,
} = require("../utils/uploadConfig");

const router = express.Router();
const maxOralHistoryUploadBytes = Math.floor(1.5 * 1024 * 1024 * 1024);
const oralHistoryUploadChunkSizeBytes = 256 * 1024;
const maxOralHistoryUploadChunkBytes = 512 * 1024;

const upload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, callback) => {
            callback(null, oralHistoryUploadsDirectory);
        },
        filename: (req, file, callback) => {
            const oralHistoryId = `oral-history-${crypto.randomUUID()}`;
            const extension = resolveExtensionFromOralHistoryUpload(file);

            req.generatedOralHistoryId = oralHistoryId;
            callback(null, `${oralHistoryId}${extension}`);
        },
    }),
    fileFilter: (_req, file, callback) => {
        if (!isAllowedOralHistoryUpload(file)) {
            const error = new Error("Only MP4, MOV, M4V, and WEBM video uploads are allowed.");
            error.statusCode = 400;
            return callback(error);
        }

        return callback(null, true);
    },
    limits: {
        files: 1,
        fileSize: maxOralHistoryUploadBytes,
    },
});

const chunkUpload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (_req, file, callback) => {
        if (!isAllowedOralHistoryUpload(file)) {
            const error = new Error("Only MP4, MOV, M4V, and WEBM video uploads are allowed.");
            error.statusCode = 400;
            return callback(error);
        }

        return callback(null, true);
    },
    limits: {
        files: 1,
        fileSize: maxOralHistoryUploadChunkBytes,
    },
});

router.get("/", async (_req, res, next) => {
    try {
        const oralHistories = await listOralHistories();
        return res.json(oralHistories);
    } catch (error) {
        return next(error);
    }
});

router.post("/upload-sessions", async (req, res, next) => {
    try {
        const key = sanitizeOralHistoryKey(req.body?.key);
        const title = sanitizeRequiredText(req.body?.title, "Oral history title");
        const description = sanitizeOptionalText(req.body?.description);
        const interviewee = sanitizeRequiredText(req.body?.interviewee, "Interviewee name");
        const episodeNumber = sanitizeEpisodeNumber(req.body?.episodeNumber);
        const originalFilename = sanitizeOriginalFilename(req.body?.originalFilename);
        const mimeType = sanitizeOptionalMimeType(req.body?.mimeType);
        const totalSize = sanitizeOralHistoryUploadSize(req.body?.totalSize);
        const totalChunks = sanitizeOralHistoryUploadChunkCount(req.body?.totalChunks, totalSize);
        const existingOralHistories = await listOralHistories();

        assertAllowedOralHistoryUploadFile({
            originalname: originalFilename,
            mimetype: mimeType,
        });

        assertOralHistoryIsUnique(existingOralHistories, key, episodeNumber, interviewee);

        const uploadSession = createOralHistoryUploadSessionRecord({
            key,
            title,
            description,
            interviewee,
            episodeNumber,
            originalFilename,
            mimeType,
            totalSize,
            totalChunks,
        });

        await writeOralHistoryUploadSession(uploadSession);

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
            return res.status(400).json({ error: "Attach a video chunk to continue uploading." });
        }

        const uploadSession = await readOralHistoryUploadSession(req.params.uploadId);

        if (!uploadSession) {
            return res.status(404).json({ error: "Upload session not found." });
        }

        const chunkIndex = sanitizeOralHistoryUploadChunkIndex(req.body?.chunkIndex, uploadSession.totalChunks);
        const expectedMaxChunkSize = calculateExpectedChunkByteLength(uploadSession, chunkIndex);

        if (req.file.buffer.length > expectedMaxChunkSize) {
            const error = new Error("Uploaded chunk is larger than expected for this oral history video.");
            error.statusCode = 400;
            throw error;
        }

        const nextChunkPath = buildOralHistoryUploadChunkPath(uploadSession.uploadId, chunkIndex);
        await fs.writeFile(nextChunkPath, req.file.buffer);

        uploadSession.receivedChunkIndices = Array.from(
            new Set([...(uploadSession.receivedChunkIndices || []), chunkIndex]),
        ).sort((leftValue, rightValue) => leftValue - rightValue);
        uploadSession.chunkSizes = {
            ...(uploadSession.chunkSizes || {}),
            [chunkIndex]: req.file.buffer.length,
        };
        uploadSession.updatedAt = new Date().toISOString();
        await writeOralHistoryUploadSession(uploadSession);

        const uploadSummary = summarizeOralHistoryUploadSession(uploadSession);

        return res.status(201).json({
            ...uploadSummary,
            chunkIndex,
        });
    } catch (error) {
        return next(error);
    }
});

router.post("/upload-sessions/:uploadId/complete", async (req, res, next) => {
    let assembledVideoPath = null;
    let oralHistoryCreated = false;

    try {
        const uploadSession = await readOralHistoryUploadSession(req.params.uploadId);

        if (!uploadSession) {
            return res.status(404).json({ error: "Upload session not found." });
        }

        const uploadSummary = summarizeOralHistoryUploadSession(uploadSession);

        if (!uploadSummary.isComplete) {
            const error = new Error("Upload is still in progress. Finish uploading all chunks first.");
            error.statusCode = 400;
            throw error;
        }

        const existingOralHistories = await listOralHistories();
        assertOralHistoryIsUnique(
            existingOralHistories,
            uploadSession.key,
            uploadSession.episodeNumber,
            uploadSession.interviewee,
        );

        assembledVideoPath = buildOralHistoryUploadAssembledPath(uploadSession.uploadId, uploadSession.extension);
        await fs.writeFile(assembledVideoPath, "");

        for (let chunkIndex = 0; chunkIndex < uploadSession.totalChunks; chunkIndex += 1) {
            const chunkPath = buildOralHistoryUploadChunkPath(uploadSession.uploadId, chunkIndex);
            const chunkBuffer = await fs.readFile(chunkPath);
            await fs.appendFile(assembledVideoPath, chunkBuffer);
        }

        const assembledFileStats = await fs.stat(assembledVideoPath);

        if (assembledFileStats.size !== uploadSession.totalSize) {
            const error = new Error("The uploaded chunks did not reassemble into the expected file size.");
            error.statusCode = 400;
            throw error;
        }

        const namedFilename = buildOralHistoryFilename(
            uploadSession.episodeNumber,
            uploadSession.key,
            uploadSession.extension,
        );
        const finalAbsolutePath = path.join(oralHistoryUploadsDirectory, namedFilename);
        await moveFileSafely(assembledVideoPath, finalAbsolutePath);
        assembledVideoPath = finalAbsolutePath;

        const createdOralHistory = await createOralHistory({
            oralHistoryId: uploadSession.oralHistoryId,
            key: uploadSession.key,
            title: uploadSession.title,
            description: uploadSession.description,
            interviewee: uploadSession.interviewee,
            episodeNumber: uploadSession.episodeNumber,
            originalFilename: uploadSession.originalFilename,
            fileSize: uploadSession.totalSize,
            mimeType: uploadSession.mimeType,
            storedFilePath: buildOralHistoryStoredFilePath(namedFilename),
        });
        oralHistoryCreated = true;

        try {
            await deleteOralHistoryUploadSession(uploadSession.uploadId);
        } catch (cleanupError) {
            console.error("Failed to remove completed oral history upload session:", cleanupError);
        }

        return res.status(201).json(createdOralHistory);
    } catch (error) {
        if (!oralHistoryCreated) {
            if (assembledVideoPath) {
                await fs.rm(assembledVideoPath, { force: true });
            }

            try {
                await deleteOralHistoryUploadSession(req.params.uploadId);
            } catch (cleanupError) {
                if (cleanupError.statusCode !== 400) {
                    console.error("Failed to remove failed oral history upload session:", cleanupError);
                }
            }
        }

        return next(error);
    }
});

router.delete("/upload-sessions/:uploadId", async (req, res, next) => {
    try {
        await deleteOralHistoryUploadSession(req.params.uploadId);

        return res.json({
            success: true,
            uploadId: String(req.params.uploadId || ""),
        });
    } catch (error) {
        return next(error);
    }
});

router.post("/", upload.single("video"), async (req, res, next) => {
    let currentUploadedPath = req.file?.path || null;

    const cleanupUploadedFile = async () => {
        if (!currentUploadedPath) {
            return;
        }

        try {
            await fs.unlink(currentUploadedPath);
        } catch (cleanupError) {
            if (cleanupError.code !== "ENOENT") {
                console.error("Failed to clean up rejected oral history upload:", cleanupError);
            }
        }
    };

    try {
        if (!req.file) {
            return res.status(400).json({ error: "Please upload an oral history video." });
        }

        const key = sanitizeOralHistoryKey(req.body?.key);
        const title = sanitizeRequiredText(req.body?.title, "Oral history title");
        const description = sanitizeOptionalText(req.body?.description);
        const interviewee = sanitizeRequiredText(req.body?.interviewee, "Interviewee name");
        const episodeNumber = sanitizeEpisodeNumber(req.body?.episodeNumber);
        const oralHistoryId = req.generatedOralHistoryId;

        if (!oralHistoryId) {
            throw new Error("Oral history identifier was not generated for the uploaded file.");
        }

        const extension = path.extname(req.file.filename);
        const namedFilename = buildOralHistoryFilename(episodeNumber, key, extension);
        const finalAbsolutePath = path.join(oralHistoryUploadsDirectory, namedFilename);

        if (req.file.path !== finalAbsolutePath) {
            await moveFileSafely(req.file.path, finalAbsolutePath);
            currentUploadedPath = finalAbsolutePath;
        }

        const storedFilePath = buildOralHistoryStoredFilePath(namedFilename);
        const createdOralHistory = await createOralHistory({
            oralHistoryId,
            key,
            title,
            description,
            interviewee,
            episodeNumber,
            originalFilename: req.file.originalname,
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            storedFilePath,
        });

        return res.status(201).json(createdOralHistory);
    } catch (error) {
        await cleanupUploadedFile();
        return next(error);
    }
});

router.delete("/:oralHistoryId", async (req, res, next) => {
    try {
        const deletedOralHistory = await deleteOralHistory(req.params.oralHistoryId);

        if (!deletedOralHistory) {
            return res.status(404).json({ error: "Oral history not found." });
        }

        const absoluteStoredPath = resolveStoredFileAbsolutePath(deletedOralHistory.storedFilePath);

        try {
            await fs.unlink(absoluteStoredPath);
        } catch (error) {
            if (error.code !== "ENOENT") {
                throw error;
            }
        }

        return res.json({
            success: true,
            oralHistoryId: deletedOralHistory.oralHistoryId,
        });
    } catch (error) {
        return next(error);
    }
});

function sanitizeOralHistoryKey(rawKey) {
    const normalizedKey = String(rawKey || "").trim().toLowerCase();

    if (!normalizedKey) {
        const error = new Error("Enter an oral history key.");
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
    return String(value || "").trim().slice(0, 240);
}

function sanitizeOriginalFilename(rawFilename) {
    const normalizedFilename = path.basename(String(rawFilename || "").trim());

    if (normalizedFilename) {
        return normalizedFilename;
    }

    const error = new Error("Oral history upload is missing the original filename.");
    error.statusCode = 400;
    throw error;
}

function sanitizeOptionalMimeType(rawMimeType) {
    return String(rawMimeType || "").trim().toLowerCase();
}

function sanitizeEpisodeNumber(value) {
    const normalizedValue = Number(value);

    if (!Number.isInteger(normalizedValue) || normalizedValue <= 0 || normalizedValue > 999) {
        const error = new Error("Episode number must be a positive integer.");
        error.statusCode = 400;
        throw error;
    }

    return normalizedValue;
}

function sanitizeOralHistoryUploadSize(rawSize) {
    const parsedSize = Number(rawSize);

    if (!Number.isInteger(parsedSize) || parsedSize <= 0) {
        const error = new Error("Oral history upload size is invalid.");
        error.statusCode = 400;
        throw error;
    }

    if (parsedSize > maxOralHistoryUploadBytes) {
        const error = new Error("Oral history videos must be 1.5 GB or smaller.");
        error.statusCode = 413;
        throw error;
    }

    return parsedSize;
}

function sanitizeOralHistoryUploadChunkCount(rawChunkCount, totalSize) {
    const parsedChunkCount = Number(rawChunkCount);
    const expectedChunkCount = Math.max(1, Math.ceil(totalSize / oralHistoryUploadChunkSizeBytes));

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

function sanitizeOralHistoryUploadChunkIndex(rawChunkIndex, totalChunks) {
    const parsedChunkIndex = Number(rawChunkIndex);

    if (!Number.isInteger(parsedChunkIndex) || parsedChunkIndex < 0 || parsedChunkIndex >= totalChunks) {
        const error = new Error("Upload chunk index is invalid.");
        error.statusCode = 400;
        throw error;
    }

    return parsedChunkIndex;
}

function sanitizeOralHistoryUploadSessionId(rawUploadId) {
    const normalizedUploadId = String(rawUploadId || "").trim();

    if (/^[a-z0-9-]{8,80}$/i.test(normalizedUploadId)) {
        return normalizedUploadId;
    }

    const error = new Error("Upload session identifier is invalid.");
    error.statusCode = 400;
    throw error;
}

function sanitizeOralHistoryUploadExtension(rawExtension) {
    const normalizedExtension = String(rawExtension || "").trim().toLowerCase();

    if ([".mp4", ".mov", ".m4v", ".webm"].includes(normalizedExtension)) {
        return normalizedExtension;
    }

    const error = new Error("Oral history upload extension is invalid.");
    error.statusCode = 400;
    throw error;
}

function buildOralHistoryFilename(episodeNumber, key, extension) {
    const normalizedExtension = extension || ".mp4";
    return `episode-${String(episodeNumber).padStart(2, "0")}-${key}${normalizedExtension}`;
}

function createOralHistoryUploadSessionRecord({
    key,
    title,
    description,
    interviewee,
    episodeNumber,
    originalFilename,
    mimeType,
    totalSize,
    totalChunks,
}) {
    const uploadId = crypto.randomUUID();
    const extension = sanitizeOralHistoryUploadExtension(
        resolveExtensionFromOralHistoryUpload({
            originalname: originalFilename,
            mimetype: mimeType,
        }),
    );
    const now = new Date().toISOString();

    return {
        uploadId,
        oralHistoryId: `oral-history-${crypto.randomUUID()}`,
        key,
        title,
        description,
        interviewee,
        episodeNumber,
        originalFilename,
        mimeType,
        extension,
        totalSize,
        totalChunks,
        chunkSize: oralHistoryUploadChunkSizeBytes,
        receivedChunkIndices: [],
        chunkSizes: {},
        createdAt: now,
        updatedAt: now,
    };
}

async function readOralHistoryUploadSession(uploadId) {
    try {
        const manifestContents = await fs.readFile(buildOralHistoryUploadManifestPath(uploadId), "utf8");
        return normalizeOralHistoryUploadSession(JSON.parse(manifestContents));
    } catch (error) {
        if (error.code === "ENOENT") {
            return null;
        }

        throw error;
    }
}

async function writeOralHistoryUploadSession(uploadSession) {
    const normalizedSession = normalizeOralHistoryUploadSession(uploadSession);
    const uploadSessionDirectory = buildOralHistoryUploadSessionDirectory(normalizedSession.uploadId);

    await fs.mkdir(uploadSessionDirectory, { recursive: true });
    await fs.writeFile(
        buildOralHistoryUploadManifestPath(normalizedSession.uploadId),
        JSON.stringify(normalizedSession, null, 2),
    );
}

async function deleteOralHistoryUploadSession(uploadId) {
    const uploadSessionDirectory = buildOralHistoryUploadSessionDirectory(uploadId);
    await fs.rm(uploadSessionDirectory, { recursive: true, force: true });
}

function normalizeOralHistoryUploadSession(uploadSession) {
    return {
        uploadId: sanitizeOralHistoryUploadSessionId(uploadSession?.uploadId),
        oralHistoryId: String(uploadSession?.oralHistoryId || `oral-history-${crypto.randomUUID()}`),
        key: sanitizeOralHistoryKey(uploadSession?.key),
        title: sanitizeRequiredText(uploadSession?.title, "Oral history title"),
        description: sanitizeOptionalText(uploadSession?.description),
        interviewee: sanitizeRequiredText(uploadSession?.interviewee, "Interviewee name"),
        episodeNumber: sanitizeEpisodeNumber(uploadSession?.episodeNumber),
        originalFilename: sanitizeOriginalFilename(uploadSession?.originalFilename),
        mimeType: sanitizeOptionalMimeType(uploadSession?.mimeType),
        extension: sanitizeOralHistoryUploadExtension(uploadSession?.extension),
        totalSize: sanitizeOralHistoryUploadSize(uploadSession?.totalSize),
        totalChunks: sanitizeOralHistoryUploadChunkCount(
            uploadSession?.totalChunks,
            sanitizeOralHistoryUploadSize(uploadSession?.totalSize),
        ),
        chunkSize: oralHistoryUploadChunkSizeBytes,
        receivedChunkIndices: normalizeOralHistoryUploadChunkIndices(uploadSession?.receivedChunkIndices),
        chunkSizes: normalizeOralHistoryUploadChunkSizes(uploadSession?.chunkSizes),
        createdAt: uploadSession?.createdAt || new Date().toISOString(),
        updatedAt: uploadSession?.updatedAt || new Date().toISOString(),
    };
}

function summarizeOralHistoryUploadSession(uploadSession) {
    const receivedChunkIndices = normalizeOralHistoryUploadChunkIndices(uploadSession.receivedChunkIndices);
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

function normalizeOralHistoryUploadChunkIndices(chunkIndices) {
    return Array.from(
        new Set(
            (Array.isArray(chunkIndices) ? chunkIndices : [])
                .map((chunkIndex) => Number(chunkIndex))
                .filter((chunkIndex) => Number.isInteger(chunkIndex) && chunkIndex >= 0),
        ),
    ).sort((leftValue, rightValue) => leftValue - rightValue);
}

function normalizeOralHistoryUploadChunkSizes(chunkSizes) {
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

function buildOralHistoryUploadSessionDirectory(uploadId) {
    return path.join(
        oralHistoryUploadSessionsDirectory,
        sanitizeOralHistoryUploadSessionId(uploadId),
    );
}

function buildOralHistoryUploadManifestPath(uploadId) {
    return path.join(buildOralHistoryUploadSessionDirectory(uploadId), "manifest.json");
}

function buildOralHistoryUploadChunkPath(uploadId, chunkIndex) {
    return path.join(
        buildOralHistoryUploadSessionDirectory(uploadId),
        `chunk-${String(sanitizeOralHistoryUploadChunkIndex(chunkIndex, Number.MAX_SAFE_INTEGER)).padStart(6, "0")}.part`,
    );
}

function buildOralHistoryUploadAssembledPath(uploadId, extension) {
    return path.join(
        buildOralHistoryUploadSessionDirectory(uploadId),
        `assembled${sanitizeOralHistoryUploadExtension(extension)}`,
    );
}

function calculateExpectedChunkByteLength(uploadSession, chunkIndex) {
    const chunkStart = chunkIndex * uploadSession.chunkSize;
    return Math.min(uploadSession.chunkSize, uploadSession.totalSize - chunkStart);
}

function assertAllowedOralHistoryUploadFile(file) {
    if (isAllowedOralHistoryUpload(file)) {
        return;
    }

    const error = new Error("Only MP4, MOV, M4V, and WEBM video uploads are allowed.");
    error.statusCode = 400;
    throw error;
}

function assertOralHistoryIsUnique(existingOralHistories, key, episodeNumber, interviewee) {
    const normalizedKey = String(key || "").trim().toLowerCase();
    const normalizedInterviewee = String(interviewee || "").trim().toLowerCase();

    if (existingOralHistories.some((entry) => String(entry.key || "").trim().toLowerCase() === normalizedKey)) {
        const error = new Error(`An oral history with key "${normalizedKey}" already exists.`);
        error.statusCode = 409;
        throw error;
    }

    if (
        existingOralHistories.some(
            (entry) =>
                Number(entry.episodeNumber) === Number(episodeNumber)
                && String(entry.interviewee || "").trim().toLowerCase() === normalizedInterviewee,
        )
    ) {
        const error = new Error(`Episode ${episodeNumber} already exists for ${interviewee}.`);
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
                console.warn("Copied oral history file across devices but could not remove the temp source:", unlinkError);
            }
        }
    }
}

module.exports = router;
