const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const {
    copyBundledStorageFileIfMissing,
    storageDirectory,
} = require("./storageConfig");
const { normalizeStoredFilePath } = require("./uploadConfig");

const historyStorePath = path.join(storageDirectory, "histories.json");
const defaultStore = {
    histories: [],
};

async function ensureHistoryStore() {
    await copyBundledStorageFileIfMissing("histories.json");

    try {
        await fs.access(historyStorePath);
    } catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }

        await fs.writeFile(historyStorePath, JSON.stringify(defaultStore, null, 2));
    }
}

async function readStore() {
    await ensureHistoryStore();

    const rawStore = await fs.readFile(historyStorePath, "utf8");

    if (!rawStore.trim()) {
        return { ...defaultStore, histories: [] };
    }

    const parsedStore = JSON.parse(rawStore);
    const histories = Array.isArray(parsedStore.histories) ? parsedStore.histories : [];

    return { histories };
}

async function writeStore(store) {
    await ensureHistoryStore();
    await fs.writeFile(historyStorePath, JSON.stringify(store, null, 2));
}

function buildPdfUrl(storedFilePath) {
    const normalizedPath = normalizeStoredFilePath(storedFilePath);
    return `/api/${normalizedPath}`;
}

function toHistoryResponse(history) {
    return {
        ...history,
        pdfUrl: buildPdfUrl(history.storedFilePath),
    };
}

async function listHistories() {
    const store = await readStore();
    return store.histories.map((history) => toHistoryResponse(history));
}

async function createHistory(historyInput) {
    const store = await readStore();
    const normalizedKey = String(historyInput?.key || "").trim().toLowerCase();

    if (store.histories.some((entry) => String(entry.key || "").trim().toLowerCase() === normalizedKey)) {
        const error = new Error(`A written history with key "${normalizedKey}" already exists.`);
        error.statusCode = 409;
        throw error;
    }

    const now = new Date().toISOString();
    const nextHistory = {
        historyId: String(historyInput?.historyId || `history-${crypto.randomUUID()}`),
        key: normalizedKey,
        title: String(historyInput?.title || "").trim(),
        description: String(historyInput?.description || "").trim(),
        originalFilename: String(historyInput?.originalFilename || "").trim(),
        fileSize: Number(historyInput?.fileSize || 0),
        mimeType: String(historyInput?.mimeType || "").trim().toLowerCase(),
        storedFilePath: String(historyInput?.storedFilePath || "").trim(),
        uploadTimestamp: now,
        updatedAt: now,
    };

    store.histories.unshift(nextHistory);
    await writeStore(store);

    return toHistoryResponse(nextHistory);
}

async function deleteHistory(historyId) {
    const store = await readStore();
    const historyIndex = store.histories.findIndex(
        (entry) => String(entry.historyId) === String(historyId),
    );

    if (historyIndex === -1) {
        return null;
    }

    const [deletedHistory] = store.histories.splice(historyIndex, 1);
    await writeStore(store);

    return deletedHistory;
}

module.exports = {
    createHistory,
    deleteHistory,
    ensureHistoryStore,
    historyStorePath,
    listHistories,
};
