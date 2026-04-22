const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const {
    copyBundledStorageFileIfMissing,
    storageDirectory,
} = require("./storageConfig");
const { normalizeStoredFilePath } = require("./uploadConfig");

const oralHistoryStorePath = path.join(storageDirectory, "oralHistories.json");
const defaultStore = {
    oralHistories: [],
};

async function ensureOralHistoryStore() {
    await copyBundledStorageFileIfMissing("oralHistories.json");

    try {
        await fs.access(oralHistoryStorePath);
    } catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }

        await fs.writeFile(oralHistoryStorePath, JSON.stringify(defaultStore, null, 2));
    }
}

async function readStore() {
    await ensureOralHistoryStore();

    const rawStore = await fs.readFile(oralHistoryStorePath, "utf8");

    if (!rawStore.trim()) {
        return { ...defaultStore, oralHistories: [] };
    }

    const parsedStore = JSON.parse(rawStore);
    const oralHistories = Array.isArray(parsedStore.oralHistories) ? parsedStore.oralHistories : [];

    return { oralHistories };
}

async function writeStore(store) {
    await ensureOralHistoryStore();
    await fs.writeFile(oralHistoryStorePath, JSON.stringify(store, null, 2));
}

function buildVideoUrl(storedFilePath) {
    const normalizedPath = normalizeStoredFilePath(storedFilePath);
    return `/api/${normalizedPath}`;
}

function toOralHistoryResponse(oralHistory) {
    const isFullLength = Boolean(oralHistory.isFullLength);

    return {
        ...oralHistory,
        isFullLength,
        episodeNumber: isFullLength ? null : Number(oralHistory.episodeNumber),
        videoUrl: buildVideoUrl(oralHistory.storedFilePath),
    };
}

async function listOralHistories() {
    const store = await readStore();

    return store.oralHistories
        .map((oralHistory) => toOralHistoryResponse(oralHistory))
        .sort(compareOralHistories);
}

async function createOralHistory(oralHistoryInput) {
    const store = await readStore();
    const normalizedKey = String(oralHistoryInput?.key || "").trim().toLowerCase();
    const isFullLength = Boolean(oralHistoryInput?.isFullLength);
    const normalizedEpisodeNumber = isFullLength ? null : Number(oralHistoryInput?.episodeNumber);
    const normalizedInterviewee = String(oralHistoryInput?.interviewee || "").trim().toLowerCase();

    if (store.oralHistories.some((entry) => String(entry.key || "").trim().toLowerCase() === normalizedKey)) {
        const error = new Error(`An oral history with key "${normalizedKey}" already exists.`);
        error.statusCode = 409;
        throw error;
    }

    if (
        store.oralHistories.some(
            (entry) =>
                !isFullLength
                && !entry.isFullLength
                &&
                Number(entry.episodeNumber) === normalizedEpisodeNumber
                && String(entry.interviewee || "").trim().toLowerCase() === normalizedInterviewee,
        )
    ) {
        const error = new Error(`Episode ${normalizedEpisodeNumber} already exists for ${oralHistoryInput?.interviewee}.`);
        error.statusCode = 409;
        throw error;
    }

    if (
        isFullLength
        && store.oralHistories.some(
            (entry) =>
                entry.isFullLength
                && String(entry.interviewee || "").trim().toLowerCase() === normalizedInterviewee,
        )
    ) {
        const error = new Error(`A full-length interview already exists for ${oralHistoryInput?.interviewee}.`);
        error.statusCode = 409;
        throw error;
    }

    const now = new Date().toISOString();
    const nextOralHistory = {
        oralHistoryId: String(oralHistoryInput?.oralHistoryId || `oral-history-${crypto.randomUUID()}`),
        key: normalizedKey,
        title: String(oralHistoryInput?.title || "").trim(),
        description: String(oralHistoryInput?.description || "").trim(),
        interviewee: String(oralHistoryInput?.interviewee || "").trim(),
        category: String(oralHistoryInput?.category || "").trim(),
        isFullLength,
        episodeNumber: normalizedEpisodeNumber,
        originalFilename: String(oralHistoryInput?.originalFilename || "").trim(),
        fileSize: Number(oralHistoryInput?.fileSize || 0),
        mimeType: String(oralHistoryInput?.mimeType || "").trim().toLowerCase(),
        storedFilePath: String(oralHistoryInput?.storedFilePath || "").trim(),
        uploadTimestamp: now,
        updatedAt: now,
    };

    store.oralHistories.push(nextOralHistory);
    await writeStore(store);

    return toOralHistoryResponse(nextOralHistory);
}

async function deleteOralHistory(oralHistoryId) {
    const store = await readStore();
    const oralHistoryIndex = store.oralHistories.findIndex(
        (entry) => String(entry.oralHistoryId) === String(oralHistoryId),
    );

    if (oralHistoryIndex === -1) {
        return null;
    }

    const [deletedOralHistory] = store.oralHistories.splice(oralHistoryIndex, 1);
    await writeStore(store);

    return deletedOralHistory;
}

function compareOralHistories(leftEntry, rightEntry) {
    if (Boolean(leftEntry.isFullLength) !== Boolean(rightEntry.isFullLength)) {
        return leftEntry.isFullLength ? -1 : 1;
    }

    return Number(leftEntry.episodeNumber || 0) - Number(rightEntry.episodeNumber || 0);
}

module.exports = {
    createOralHistory,
    deleteOralHistory,
    ensureOralHistoryStore,
    listOralHistories,
    oralHistoryStorePath,
};
