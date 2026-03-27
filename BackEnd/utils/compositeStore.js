const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const {
    copyBundledStorageFileIfMissing,
    storageDirectory,
} = require("./storageConfig");
const { normalizeStoredFilePath } = require("./uploadConfig");

const compositeStorePath = path.join(storageDirectory, "composites.json");
const defaultStore = {
    composites: [],
};

async function ensureCompositeStore() {
    await copyBundledStorageFileIfMissing("composites.json");

    try {
        await fs.access(compositeStorePath);
    } catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }

        await fs.writeFile(compositeStorePath, JSON.stringify(defaultStore, null, 2));
    }
}

async function readStore() {
    await ensureCompositeStore();

    const rawStore = await fs.readFile(compositeStorePath, "utf8");

    if (!rawStore.trim()) {
        return { ...defaultStore, composites: [] };
    }

    const parsedStore = JSON.parse(rawStore);
    const composites = Array.isArray(parsedStore.composites) ? parsedStore.composites : [];

    return { composites };
}

async function writeStore(store) {
    await ensureCompositeStore();
    await fs.writeFile(compositeStorePath, JSON.stringify(store, null, 2));
}

function buildImageUrl(storedFilePath) {
    const normalizedPath = normalizeStoredFilePath(storedFilePath);
    return `/api/${normalizedPath}`;
}

function toCompositeResponse(composite) {
    const compositeYear = composite.compositeYear ? String(composite.compositeYear) : null;
    const displayName = compositeYear
        ? buildCompositeDisplayName(compositeYear, composite.originalFilename)
        : composite.displayName || buildCompositeDisplayName(compositeYear, composite.originalFilename);

    return {
        ...composite,
        compositeYear,
        displayName,
        imageUrl: buildImageUrl(composite.storedFilePath),
        annotationCount: Array.isArray(composite.annotations) ? composite.annotations.length : 0,
    };
}

async function listComposites() {
    const store = await readStore();

    return store.composites.map((composite) => toCompositeResponse(composite));
}

async function getCompositeById(compositeId) {
    const store = await readStore();
    const composite = store.composites.find((entry) => entry.compositeId === compositeId);

    return composite ? toCompositeResponse(composite) : null;
}

async function listProfileCompositeReferences(profileId) {
    const store = await readStore();
    const references = [];

    for (const composite of store.composites) {
        const compositeResponse = toCompositeResponse(composite);

        for (const annotation of composite.annotations || []) {
            if (String(annotation.profileId || "") !== String(profileId || "")) {
                continue;
            }

            references.push({
                compositeId: compositeResponse.compositeId,
                compositeYear: compositeResponse.compositeYear,
                compositeName: compositeResponse.displayName,
                imageUrl: compositeResponse.imageUrl,
                imageWidth: composite.imageWidth,
                imageHeight: composite.imageHeight,
                uploadTimestamp: composite.uploadTimestamp,
                annotationId: annotation.annotationId,
                x: annotation.x,
                y: annotation.y,
                width: annotation.width,
                height: annotation.height,
                normalizedX: annotation.normalizedX,
                normalizedY: annotation.normalizedY,
                normalizedWidth: annotation.normalizedWidth,
                normalizedHeight: annotation.normalizedHeight,
                updatedAt: annotation.updatedAt,
            });
        }
    }

    return references.sort(compareProfileCompositeReferences);
}

async function createComposite(metadata) {
    const store = await readStore();

    if (metadata.compositeYear && hasCompositeYear(store.composites, metadata.compositeYear)) {
        const error = new Error(`A composite for ${metadata.compositeYear} already exists.`);
        error.statusCode = 409;
        throw error;
    }

    const nextComposite = {
        ...metadata,
        annotations: [],
    };

    store.composites.unshift(nextComposite);
    await writeStore(store);

    return toCompositeResponse(nextComposite);
}

async function deleteComposite(compositeId) {
    const store = await readStore();
    const compositeIndex = store.composites.findIndex((entry) => entry.compositeId === compositeId);

    if (compositeIndex === -1) {
        return null;
    }

    const [deletedComposite] = store.composites.splice(compositeIndex, 1);
    await writeStore(store);

    return deletedComposite;
}

async function replaceAnnotations(compositeId, incomingAnnotations, validProfileIds) {
    const store = await readStore();
    const composite = store.composites.find((entry) => entry.compositeId === compositeId);

    if (!composite) {
        return null;
    }

    const existingAnnotations = new Map(
        (composite.annotations || []).map((annotation) => [annotation.annotationId, annotation]),
    );

    const nextAnnotations = [];
    const usedAnnotationIds = new Set();

    for (const annotation of incomingAnnotations) {
        const sanitizedAnnotation = sanitizeAnnotation(
            annotation,
            composite,
            validProfileIds,
            existingAnnotations,
        );

        if (!sanitizedAnnotation || usedAnnotationIds.has(sanitizedAnnotation.annotationId)) {
            continue;
        }

        nextAnnotations.push(sanitizedAnnotation);
        usedAnnotationIds.add(sanitizedAnnotation.annotationId);
    }

    composite.annotations = nextAnnotations;
    await writeStore(store);

    return toCompositeResponse(composite);
}

async function removeProfileReferences(profileId) {
    const normalizedProfileId = String(profileId || "");

    if (!normalizedProfileId) {
        return {
            updatedCompositeCount: 0,
            clearedAnnotationCount: 0,
        };
    }

    const store = await readStore();
    const now = new Date().toISOString();
    let updatedCompositeCount = 0;
    let clearedAnnotationCount = 0;

    for (const composite of store.composites) {
        let compositeWasUpdated = false;

        composite.annotations = (composite.annotations || []).map((annotation) => {
            const hadAssignedProfile = String(annotation.profileId || "") === normalizedProfileId;
            const hadSuggestedProfile = String(annotation.matchedProfileId || "") === normalizedProfileId;

            if (!hadAssignedProfile && !hadSuggestedProfile) {
                return annotation;
            }

            compositeWasUpdated = true;
            clearedAnnotationCount += 1;

            const nextProfileId = hadAssignedProfile ? null : annotation.profileId ?? null;
            const nextMatchedProfileId = hadSuggestedProfile ? null : annotation.matchedProfileId ?? null;

            return {
                ...annotation,
                profileId: nextProfileId,
                matchedProfileId: nextMatchedProfileId,
                needsReview: hadAssignedProfile
                    ? true
                    : !nextProfileId
                        ? Boolean(annotation.needsReview || hadSuggestedProfile)
                        : Boolean(annotation.needsReview),
                updatedAt: now,
            };
        });

        if (compositeWasUpdated) {
            updatedCompositeCount += 1;
        }
    }

    if (updatedCompositeCount > 0) {
        await writeStore(store);
    }

    return {
        updatedCompositeCount,
        clearedAnnotationCount,
    };
}

function sanitizeAnnotation(annotation, composite, validProfileIds, existingAnnotations) {
    const imageWidth = Number(composite.imageWidth);
    const imageHeight = Number(composite.imageHeight);
    const x = toFiniteNumber(annotation?.x);
    const y = toFiniteNumber(annotation?.y);
    const width = toFiniteNumber(annotation?.width);
    const height = toFiniteNumber(annotation?.height);

    if ([imageWidth, imageHeight, x, y, width, height].some((value) => value === null)) {
        return null;
    }

    const startX = Math.min(x, x + width);
    const endX = Math.max(x, x + width);
    const startY = Math.min(y, y + height);
    const endY = Math.max(y, y + height);

    const clampedLeft = clamp(startX, 0, imageWidth);
    const clampedRight = clamp(endX, 0, imageWidth);
    const clampedTop = clamp(startY, 0, imageHeight);
    const clampedBottom = clamp(endY, 0, imageHeight);
    const pixelWidth = Math.round(clampedRight - clampedLeft);
    const pixelHeight = Math.round(clampedBottom - clampedTop);

    if (pixelWidth < 16 || pixelHeight < 16) {
        return null;
    }

    let profileId = annotation?.profileId ?? null;

    if (profileId !== null) {
        profileId = String(profileId);

        if (!validProfileIds.has(profileId)) {
            const error = new Error(`Profile "${profileId}" does not exist in the local profile dataset.`);
            error.statusCode = 400;
            throw error;
        }
    }

    const existingAnnotation = annotation?.annotationId
        ? existingAnnotations.get(String(annotation.annotationId))
        : null;
    const now = new Date().toISOString();
    const source = sanitizeAnnotationSource(annotation?.source || existingAnnotation?.source);
    const detectedName = sanitizeDetectedName(annotation?.detectedName ?? existingAnnotation?.detectedName);
    const matchedProfileId = sanitizeSuggestedProfileId(
        annotation?.matchedProfileId ?? existingAnnotation?.matchedProfileId,
        validProfileIds,
    );
    const matchConfidence = sanitizeMatchConfidence(
        annotation?.matchConfidence ?? existingAnnotation?.matchConfidence,
    );
    const needsReview = Boolean(
        annotation?.needsReview
        ?? existingAnnotation?.needsReview
        ?? (source === "auto"),
    );
    const captionBox = sanitizeCaptionBox(
        annotation?.captionBox ?? existingAnnotation?.captionBox,
        composite,
    );

    return {
        annotationId: sanitizeAnnotationId(annotation?.annotationId) || existingAnnotation?.annotationId || crypto.randomUUID(),
        compositeId: composite.compositeId,
        profileId,
        source,
        detectedName,
        matchedProfileId,
        matchConfidence,
        needsReview,
        captionBox,
        x: Math.round(clampedLeft),
        y: Math.round(clampedTop),
        width: pixelWidth,
        height: pixelHeight,
        normalizedX: roundNormalized(clampedLeft / imageWidth),
        normalizedY: roundNormalized(clampedTop / imageHeight),
        normalizedWidth: roundNormalized(pixelWidth / imageWidth),
        normalizedHeight: roundNormalized(pixelHeight / imageHeight),
        createdAt: existingAnnotation?.createdAt || now,
        updatedAt: now,
    };
}

function sanitizeAnnotationId(annotationId) {
    const normalizedAnnotationId = String(annotationId || "").trim();

    if (!normalizedAnnotationId) {
        return null;
    }

    return normalizedAnnotationId.slice(0, 120);
}

function sanitizeAnnotationSource(source) {
    return String(source || "").toLowerCase() === "auto" ? "auto" : "manual";
}

function sanitizeDetectedName(value) {
    const normalizedValue = String(value || "").trim();

    return normalizedValue ? normalizedValue.slice(0, 120) : null;
}

function sanitizeSuggestedProfileId(profileId, validProfileIds) {
    if (profileId === null || profileId === undefined || profileId === "") {
        return null;
    }

    const normalizedProfileId = String(profileId);

    return validProfileIds.has(normalizedProfileId) ? normalizedProfileId : null;
}

function sanitizeMatchConfidence(value) {
    const numericValue = toFiniteNumber(value);

    if (numericValue === null) {
        return null;
    }

    return clamp(Number(numericValue.toFixed(3)), 0, 1);
}

function sanitizeCaptionBox(captionBox, composite) {
    if (!captionBox || typeof captionBox !== "object") {
        return null;
    }

    const imageWidth = Number(composite.imageWidth);
    const imageHeight = Number(composite.imageHeight);
    const x = toFiniteNumber(captionBox.x);
    const y = toFiniteNumber(captionBox.y);
    const width = toFiniteNumber(captionBox.width);
    const height = toFiniteNumber(captionBox.height);

    if ([imageWidth, imageHeight, x, y, width, height].some((value) => value === null)) {
        return null;
    }

    const left = clamp(Math.round(x), 0, imageWidth);
    const top = clamp(Math.round(y), 0, imageHeight);
    const boxWidth = clamp(Math.round(width), 0, imageWidth - left);
    const boxHeight = clamp(Math.round(height), 0, imageHeight - top);

    if (boxWidth <= 0 || boxHeight <= 0) {
        return null;
    }

    return {
        x: left,
        y: top,
        width: boxWidth,
        height: boxHeight,
    };
}

function toFiniteNumber(value) {
    const parsedValue = Number(value);

    return Number.isFinite(parsedValue) ? parsedValue : null;
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function roundNormalized(value) {
    return Number(value.toFixed(6));
}

function buildCompositeDisplayName(compositeYear, originalFilename) {
    if (compositeYear) {
        return `${compositeYear}_composite`;
    }

    return originalFilename;
}

function hasCompositeYear(composites, compositeYear) {
    return composites.some((entry) => String(entry.compositeYear || "") === String(compositeYear));
}

function compareProfileCompositeReferences(leftReference, rightReference) {
    const leftTimestamp = new Date(leftReference.updatedAt || leftReference.uploadTimestamp || 0).getTime();
    const rightTimestamp = new Date(rightReference.updatedAt || rightReference.uploadTimestamp || 0).getTime();

    return rightTimestamp - leftTimestamp;
}

module.exports = {
    buildImageUrl,
    compositeStorePath,
    createComposite,
    deleteComposite,
    ensureCompositeStore,
    getCompositeById,
    listProfileCompositeReferences,
    listComposites,
    removeProfileReferences,
    replaceAnnotations,
};
