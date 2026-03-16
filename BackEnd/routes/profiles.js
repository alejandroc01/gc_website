const express = require("express");
const multer = require("multer");
const path = require("path");

const {
    getProfileById,
    importProfilesFromCsv,
    listProfiles,
    profilePlaceholderImageUrl,
} = require("../utils/profileStore");
const { listProfileCompositeReferences } = require("../utils/compositeStore");

const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (_req, file, callback) => {
        const isCsvUpload = (
            file.mimetype === "text/csv"
            || file.mimetype === "application/vnd.ms-excel"
            || path.extname(file.originalname || "").toLowerCase() === ".csv"
        );

        if (!isCsvUpload) {
            const error = new Error("Upload a CSV file to import member profiles.");
            error.statusCode = 400;
            return callback(error);
        }

        return callback(null, true);
    },
    limits: {
        files: 1,
        fileSize: 10 * 1024 * 1024,
    },
});

router.get("/", async (_req, res, next) => {
    try {
        const profiles = await listProfiles();
        res.json(profiles);
    } catch (error) {
        next(error);
    }
});

router.get("/:profileId", async (req, res, next) => {
    try {
        const profile = await getProfileById(req.params.profileId);

        if (!profile) {
            return res.status(404).json({ error: "Member profile not found." });
        }

        const relatedComposites = await listProfileCompositeReferences(profile.id);
        const primaryPortraitReference = relatedComposites[0] || null;

        return res.json({
            ...profile,
            portrait: primaryPortraitReference
                ? {
                    mode: "composite-reference",
                    imageUrl: primaryPortraitReference.imageUrl,
                    imageWidth: primaryPortraitReference.imageWidth,
                    imageHeight: primaryPortraitReference.imageHeight,
                    x: primaryPortraitReference.x,
                    y: primaryPortraitReference.y,
                    width: primaryPortraitReference.width,
                    height: primaryPortraitReference.height,
                    compositeId: primaryPortraitReference.compositeId,
                    compositeName: primaryPortraitReference.compositeName,
                    compositeYear: primaryPortraitReference.compositeYear,
                    updatedAt: primaryPortraitReference.updatedAt,
                }
                : {
                    mode: "placeholder",
                    imageUrl: profile.profileImageUrl || profilePlaceholderImageUrl,
                },
            relatedComposites: relatedComposites.map((reference) => ({
                compositeId: reference.compositeId,
                compositeYear: reference.compositeYear,
                compositeName: reference.compositeName,
                uploadTimestamp: reference.uploadTimestamp,
                updatedAt: reference.updatedAt,
                annotationId: reference.annotationId,
            })),
        });
    } catch (error) {
        return next(error);
    }
});

router.post("/import", upload.single("profilesCsv"), async (req, res, next) => {
    try {
        if (!req.file?.buffer) {
            return res.status(400).json({ error: "Attach a CSV file to import member profiles." });
        }

        const importSummary = await importProfilesFromCsv(req.file.buffer.toString("utf8"));
        return res.status(201).json(importSummary);
    } catch (error) {
        return next(error);
    }
});

module.exports = router;
