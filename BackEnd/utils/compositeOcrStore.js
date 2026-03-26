const fs = require("fs/promises");
const path = require("path");
const {
    copyBundledStorageFileIfMissing,
    storageDirectory,
} = require("./storageConfig");

const compositeOcrStorePath = path.join(storageDirectory, "compositeOcr.json");
const defaultStore = {
    composites: {},
};
const validStatuses = new Set(["idle", "queued", "processing", "ready", "error"]);

async function ensureCompositeOcrStore() {
    await copyBundledStorageFileIfMissing("compositeOcr.json");

    try {
        await fs.access(compositeOcrStorePath);
    } catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }

        await fs.writeFile(compositeOcrStorePath, JSON.stringify(defaultStore, null, 2));
    }
}

async function readStore() {
    await ensureCompositeOcrStore();

    const rawStore = await fs.readFile(compositeOcrStorePath, "utf8");

    if (!rawStore.trim()) {
        return { ...defaultStore, composites: {} };
    }

    const parsedStore = JSON.parse(rawStore);
    const composites = parsedStore?.composites && typeof parsedStore.composites === "object"
        ? parsedStore.composites
        : {};

    return { composites };
}

async function writeStore(store) {
    await ensureCompositeOcrStore();
    await fs.writeFile(compositeOcrStorePath, JSON.stringify(store, null, 2));
}

async function getCompositeOcrState(compositeId) {
    const store = await readStore();
    return normalizeCompositeOcrState(compositeId, store.composites?.[compositeId]);
}

async function writeCompositeOcrState(compositeId, partialState) {
    const store = await readStore();
    const previousState = normalizeCompositeOcrState(compositeId, store.composites?.[compositeId]);
    const nextState = normalizeCompositeOcrState(compositeId, {
        ...previousState,
        ...partialState,
        updatedAt: new Date().toISOString(),
    });

    store.composites[compositeId] = nextState;
    await writeStore(store);
    return nextState;
}

async function deleteCompositeOcrState(compositeId) {
    const store = await readStore();

    if (!store.composites?.[compositeId]) {
        return false;
    }

    delete store.composites[compositeId];
    await writeStore(store);
    return true;
}

function normalizeCompositeOcrState(compositeId, state) {
    const normalizedState = state && typeof state === "object" ? state : {};
    const status = validStatuses.has(normalizedState.status) ? normalizedState.status : "idle";

    return {
        compositeId,
        status,
        cacheVersion: normalizeOptionalString(normalizedState.cacheVersion),
        textBoxes: sanitizeTextBoxes(normalizedState.textBoxes),
        generatedAt: normalizeOptionalDate(normalizedState.generatedAt),
        queuedAt: normalizeOptionalDate(normalizedState.queuedAt),
        startedAt: normalizeOptionalDate(normalizedState.startedAt),
        completedAt: normalizeOptionalDate(normalizedState.completedAt),
        updatedAt: normalizeOptionalDate(normalizedState.updatedAt),
        error: normalizeOptionalString(normalizedState.error, 280),
    };
}

function sanitizeTextBoxes(textBoxes) {
    return (Array.isArray(textBoxes) ? textBoxes : [])
        .map((textBox, index) => sanitizeTextBox(textBox, index))
        .filter(Boolean);
}

function sanitizeTextBox(textBox, index) {
    if (!textBox || typeof textBox !== "object") {
        return null;
    }

    const x = toFiniteNumber(textBox.x);
    const y = toFiniteNumber(textBox.y);
    const width = toFiniteNumber(textBox.width);
    const height = toFiniteNumber(textBox.height);

    if ([x, y, width, height].some((value) => value === null) || width <= 0 || height <= 0) {
        return null;
    }

    return {
        textBoxId: normalizeOptionalString(textBox.textBoxId) || `ocr-text-${index}`,
        rowIndex: Math.max(0, Math.round(toFiniteNumber(textBox.rowIndex) || 0)),
        text: normalizeOptionalString(textBox.text, 120),
        rawText: normalizeOptionalString(textBox.rawText, 160),
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.round(height),
        centerX: roundCoordinate(textBox.centerX, x + (width / 2)),
        centerY: roundCoordinate(textBox.centerY, y + (height / 2)),
        isPlacementCandidate: Boolean(textBox.isPlacementCandidate),
        isAnchorCandidate: Boolean(textBox.isAnchorCandidate),
        hasEmbeddedSubtitle: Boolean(textBox.hasEmbeddedSubtitle),
        isSubtext: Boolean(textBox.isSubtext),
        subtitleText: normalizeOptionalString(textBox.subtitleText, 160),
        matchedProfileId: normalizeOptionalString(textBox.matchedProfileId),
        matchedProfileDisplayName: normalizeOptionalString(textBox.matchedProfileDisplayName, 160),
        matchConfidence: normalizeOptionalConfidence(textBox.matchConfidence),
        needsReview: Boolean(textBox.needsReview),
        captionGroupId: normalizeOptionalString(textBox.captionGroupId),
        captionRole: normalizeOptionalString(textBox.captionRole),
        parentTextBoxId: normalizeOptionalString(textBox.parentTextBoxId),
        hasSubtext: Boolean(textBox.hasSubtext),
        anchorCenterX: roundCoordinate(textBox.anchorCenterX, x + (width / 2)),
        anchorTopY: roundCoordinate(textBox.anchorTopY, y),
        anchorBottomY: roundCoordinate(textBox.anchorBottomY, y + height),
        fullCaptionBox: sanitizeBoundingBox(textBox.fullCaptionBox),
    };
}

function sanitizeBoundingBox(box) {
    if (!box || typeof box !== "object") {
        return null;
    }

    const x = toFiniteNumber(box.x);
    const y = toFiniteNumber(box.y);
    const width = toFiniteNumber(box.width);
    const height = toFiniteNumber(box.height);

    if ([x, y, width, height].some((value) => value === null) || width <= 0 || height <= 0) {
        return null;
    }

    return {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.round(height),
    };
}

function normalizeOptionalString(value, maxLength = 120) {
    const normalizedValue = String(value || "").trim();
    return normalizedValue ? normalizedValue.slice(0, maxLength) : null;
}

function normalizeOptionalDate(value) {
    if (!value) {
        return null;
    }

    const parsedTimestamp = new Date(value);
    return Number.isNaN(parsedTimestamp.getTime()) ? null : parsedTimestamp.toISOString();
}

function normalizeOptionalConfidence(value) {
    const numericValue = toFiniteNumber(value);

    if (numericValue === null) {
        return null;
    }

    return Math.min(Math.max(Number(numericValue.toFixed(3)), 0), 1);
}

function roundCoordinate(value, fallbackValue) {
    const numericValue = toFiniteNumber(value);
    return Math.round(numericValue === null ? fallbackValue : numericValue);
}

function toFiniteNumber(value) {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : null;
}

module.exports = {
    compositeOcrStorePath,
    deleteCompositeOcrState,
    ensureCompositeOcrStore,
    getCompositeOcrState,
    writeCompositeOcrState,
};
