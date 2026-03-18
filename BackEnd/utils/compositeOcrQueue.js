const { detectCompositeTextBoxes } = require("./compositeAutoDetect");
const { getCompositeById } = require("./compositeStore");
const {
    deleteCompositeOcrState,
    getCompositeOcrState,
    writeCompositeOcrState,
} = require("./compositeOcrStore");
const { listProfiles } = require("./profileStore");

const compositeOcrCacheVersion = "2026-03-18-v1";
const staleOcrStateMs = 20 * 60 * 1000;
const queuedCompositeIds = [];
const queuedCompositeIdSet = new Set();
let activeCompositeId = null;

async function ensureCompositeOcrQueued(compositeId) {
    const currentState = await getCompositeOcrState(compositeId);

    if (isReadyState(currentState)) {
        return currentState;
    }

    if (isPendingState(currentState) && !isStaleState(currentState)) {
        enqueueCompositeOcr(compositeId);
        return currentState;
    }

    const nextState = await writeCompositeOcrState(compositeId, {
        status: "queued",
        cacheVersion: null,
        textBoxes: [],
        generatedAt: null,
        queuedAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
        error: null,
    });

    enqueueCompositeOcr(compositeId);
    return nextState;
}

function enqueueCompositeOcr(compositeId) {
    if (!compositeId || activeCompositeId === compositeId || queuedCompositeIdSet.has(compositeId)) {
        return;
    }

    queuedCompositeIds.push(compositeId);
    queuedCompositeIdSet.add(compositeId);
    void drainCompositeOcrQueue();
}

async function drainCompositeOcrQueue() {
    if (activeCompositeId || queuedCompositeIds.length === 0) {
        return;
    }

    const compositeId = queuedCompositeIds.shift();

    if (!compositeId) {
        return;
    }

    queuedCompositeIdSet.delete(compositeId);
    activeCompositeId = compositeId;

    try {
        await processCompositeOcr(compositeId);
    } finally {
        activeCompositeId = null;

        if (queuedCompositeIds.length > 0) {
            void drainCompositeOcrQueue();
        }
    }
}

async function processCompositeOcr(compositeId) {
    const composite = await getCompositeById(compositeId);

    if (!composite) {
        await deleteCompositeOcrState(compositeId);
        return;
    }

    await writeCompositeOcrState(compositeId, {
        status: "processing",
        startedAt: new Date().toISOString(),
        completedAt: null,
        error: null,
    });

    try {
        const profiles = await listProfiles();
        const textBoxResult = await detectCompositeTextBoxes({
            composite,
            profiles,
        });

        await writeCompositeOcrState(compositeId, {
            status: "ready",
            cacheVersion: compositeOcrCacheVersion,
            textBoxes: textBoxResult.textBoxes || [],
            generatedAt: textBoxResult.generatedAt || new Date().toISOString(),
            completedAt: new Date().toISOString(),
            error: null,
        });
    } catch (error) {
        await writeCompositeOcrState(compositeId, {
            status: "error",
            cacheVersion: null,
            textBoxes: [],
            generatedAt: null,
            completedAt: new Date().toISOString(),
            error: error?.message || "OCR processing failed for this composite.",
        });
    }
}

function isReadyState(state) {
    return state?.status === "ready" && state.cacheVersion === compositeOcrCacheVersion;
}

function isPendingState(state) {
    return state?.status === "queued" || state?.status === "processing";
}

function isStaleState(state) {
    const referenceTimestamp = state?.startedAt || state?.queuedAt || state?.updatedAt;

    if (!referenceTimestamp) {
        return true;
    }

    const parsedTimestamp = new Date(referenceTimestamp).getTime();

    if (Number.isNaN(parsedTimestamp)) {
        return true;
    }

    return (Date.now() - parsedTimestamp) > staleOcrStateMs;
}

module.exports = {
    compositeOcrCacheVersion,
    deleteCompositeOcrState,
    ensureCompositeOcrQueued,
    getCompositeOcrState,
};
