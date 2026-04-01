const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const express = require("express");
const multer = require("multer");

const {
    createOralHistory,
    listOralHistories,
} = require("../utils/oralHistoryStore");
const {
    buildOralHistoryStoredFilePath,
    isAllowedOralHistoryUpload,
    oralHistoryUploadsDirectory,
    resolveExtensionFromOralHistoryUpload,
} = require("../utils/uploadConfig");

const router = express.Router();
const maxOralHistoryUploadBytes = 500 * 1024 * 1024;

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

router.get("/", async (_req, res, next) => {
    try {
        const oralHistories = await listOralHistories();
        return res.json(oralHistories);
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
        const description = sanitizeRequiredText(req.body?.description, "Oral history description");
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

function sanitizeEpisodeNumber(value) {
    const normalizedValue = Number(value);

    if (!Number.isInteger(normalizedValue) || normalizedValue <= 0 || normalizedValue > 999) {
        const error = new Error("Episode number must be a positive integer.");
        error.statusCode = 400;
        throw error;
    }

    return normalizedValue;
}

function buildOralHistoryFilename(episodeNumber, key, extension) {
    const normalizedExtension = extension || ".mp4";
    return `episode-${String(episodeNumber).padStart(2, "0")}-${key}${normalizedExtension}`;
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
                console.warn("Copied oral history file across devices but could not remove the temp source:", unlinkError);
            }
        }
    }
}

module.exports = router;
