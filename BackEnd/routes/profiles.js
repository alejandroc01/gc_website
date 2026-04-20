const express = require("express");
const multer = require("multer");
const path = require("path");

const {
    createProfile,
    deleteProfile,
    exportProfilesToCsv,
    getProfileById,
    importProfilesFromCsv,
    listProfiles,
    profilePlaceholderImageUrl,
    updateProfile,
} = require("../utils/profileStore");
const {
    listProfileCompositeReferences,
    removeProfileReferences,
} = require("../utils/compositeStore");
const {
    listProfileScrapbookReferences,
} = require("../utils/scrapbookMetadataStore");

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

router.get("/export", async (req, res, next) => {
    try {
        const exportSummary = await exportProfilesToCsv(req.query);

        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${exportSummary.filename}"`);
        return res.status(200).send(exportSummary.csvText);
    } catch (error) {
        return next(error);
    }
});

router.get("/:profileId", async (req, res, next) => {
    try {
        const profile = await getProfileById(req.params.profileId);

        if (!profile) {
            return res.status(404).json({ error: "Member profile not found." });
        }

        const [relatedComposites, relatedScrapbookPages] = await Promise.all([
            listProfileCompositeReferences(profile.id),
            listProfileScrapbookReferences(profile),
        ]);
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
            relatedScrapbookPages,
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

router.post("/", async (req, res, next) => {
    try {
        const createdProfile = await createProfile(req.body);
        return res.status(201).json(createdProfile);
    } catch (error) {
        return next(error);
    }
});

router.put("/:profileId", async (req, res, next) => {
    try {
        const updatedProfile = await updateProfile(req.params.profileId, req.body);

        if (!updatedProfile) {
            return res.status(404).json({ error: "Member profile not found." });
        }

        return res.json(updatedProfile);
    } catch (error) {
        return next(error);
    }
});

router.delete("/:profileId", async (req, res, next) => {
    try {
        const existingProfile = await getProfileById(req.params.profileId);

        if (!existingProfile) {
            return res.status(404).json({ error: "Member profile not found." });
        }

        const clearedReferences = await removeProfileReferences(req.params.profileId);
        const deletedProfile = await deleteProfile(req.params.profileId);

        if (!deletedProfile) {
            return res.status(500).json({ error: "Member profile could not be deleted." });
        }

        return res.json({
            success: true,
            profileId: deletedProfile.id,
            clearedAnnotationCount: clearedReferences.clearedAnnotationCount,
            updatedCompositeCount: clearedReferences.updatedCompositeCount,
        });
    } catch (error) {
        return next(error);
    }
});

module.exports = router;
