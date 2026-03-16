const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
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
const { listProfiles } = require("../utils/profileStore");
const {
    allowedMimeTypes,
    resolveExtensionFromUpload,
    uploadsDirectory,
} = require("../utils/uploadConfig");

const router = express.Router();

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

router.get("/", async (_req, res, next) => {
    try {
        const composites = await listComposites();
        res.json(composites);
    } catch (error) {
        next(error);
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
        const existingComposites = await listComposites();

        if (existingComposites.some((composite) => composite.compositeYear === compositeYear)) {
            const error = new Error(`A composite for ${compositeYear} already exists.`);
            error.statusCode = 409;
            throw error;
        }

        const { width, height } = await getImageMetadata(req.file.path);
        const compositeId = req.generatedCompositeId;

        if (!compositeId) {
            throw new Error("Composite identifier was not generated for the uploaded file.");
        }

        const extension = path.extname(req.file.filename);
        const namedFilename = buildCompositeFilename(compositeYear, extension);
        const finalAbsolutePath = path.join(uploadsDirectory, namedFilename);

        if (req.file.path !== finalAbsolutePath) {
            await fs.rename(req.file.path, finalAbsolutePath);
            currentUploadedPath = finalAbsolutePath;
        }

        const storedFilePath = path.posix.join("uploads", "composites", namedFilename);
        const createdComposite = await createComposite({
            compositeId,
            compositeYear,
            displayName: buildCompositeDisplayName(compositeYear),
            originalFilename: req.file.originalname,
            storedFilePath,
            imageWidth: width,
            imageHeight: height,
            uploadTimestamp: new Date().toISOString(),
        });

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

        return res.json({
            success: true,
            compositeId: deletedComposite.compositeId,
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
