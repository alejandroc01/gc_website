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
    const lowResStoredFilePath = String(oralHistory.lowResStoredFilePath || "").trim();

    return {
        ...oralHistory,
        isFullLength,
        episodeNumber: isFullLength ? null : Number(oralHistory.episodeNumber),
        profileIds: normalizeProfileIds(oralHistory.profileIds),
        videoUrl: buildVideoUrl(oralHistory.storedFilePath),
        lowResVideoUrl: lowResStoredFilePath ? buildVideoUrl(lowResStoredFilePath) : "",
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

    assertOralHistoryIsUnique({
        oralHistories: store.oralHistories,
        key: normalizedKey,
        episodeNumber: normalizedEpisodeNumber,
        interviewee: normalizedInterviewee,
        isFullLength,
    });

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
        profileIds: normalizeProfileIds(oralHistoryInput?.profileIds),
        lowResOriginalFilename: String(oralHistoryInput?.lowResOriginalFilename || "").trim(),
        lowResFileSize: Number(oralHistoryInput?.lowResFileSize || 0),
        lowResMimeType: String(oralHistoryInput?.lowResMimeType || "").trim().toLowerCase(),
        lowResStoredFilePath: String(oralHistoryInput?.lowResStoredFilePath || "").trim(),
        lowResUploadedAt: oralHistoryInput?.lowResStoredFilePath ? now : "",
        uploadTimestamp: now,
        updatedAt: now,
    };

    store.oralHistories.push(nextOralHistory);
    await writeStore(store);

    return toOralHistoryResponse(nextOralHistory);
}

async function updateOralHistory(oralHistoryId, oralHistoryInput) {
    const store = await readStore();
    const oralHistoryIndex = store.oralHistories.findIndex(
        (entry) => String(entry.oralHistoryId) === String(oralHistoryId),
    );

    if (oralHistoryIndex === -1) {
        return null;
    }

    const existingOralHistory = store.oralHistories[oralHistoryIndex];
    const isFullLength = Boolean(oralHistoryInput?.isFullLength);
    const normalizedKey = String(oralHistoryInput?.key || "").trim().toLowerCase();
    const normalizedEpisodeNumber = isFullLength ? null : Number(oralHistoryInput?.episodeNumber);
    const normalizedInterviewee = String(oralHistoryInput?.interviewee || "").trim().toLowerCase();

    assertOralHistoryIsUnique({
        oralHistories: store.oralHistories,
        key: normalizedKey,
        episodeNumber: normalizedEpisodeNumber,
        interviewee: normalizedInterviewee,
        isFullLength,
        excludedOralHistoryId: existingOralHistory.oralHistoryId,
    });

    const updatedOralHistory = {
        ...existingOralHistory,
        key: normalizedKey,
        title: String(oralHistoryInput?.title || "").trim(),
        description: String(oralHistoryInput?.description || "").trim(),
        interviewee: String(oralHistoryInput?.interviewee || "").trim(),
        category: String(oralHistoryInput?.category || "").trim(),
        isFullLength,
        episodeNumber: normalizedEpisodeNumber,
        profileIds: normalizeProfileIds(oralHistoryInput?.profileIds),
        lowResOriginalFilename: String(existingOralHistory.lowResOriginalFilename || "").trim(),
        lowResFileSize: Number(existingOralHistory.lowResFileSize || 0),
        lowResMimeType: String(existingOralHistory.lowResMimeType || "").trim().toLowerCase(),
        lowResStoredFilePath: String(existingOralHistory.lowResStoredFilePath || "").trim(),
        lowResUploadedAt: String(existingOralHistory.lowResUploadedAt || ""),
        updatedAt: new Date().toISOString(),
    };

    store.oralHistories[oralHistoryIndex] = updatedOralHistory;
    await writeStore(store);

    return toOralHistoryResponse(updatedOralHistory);
}

async function getOralHistoryById(oralHistoryId) {
    const store = await readStore();
    const oralHistory = store.oralHistories.find(
        (entry) => String(entry.oralHistoryId) === String(oralHistoryId),
    );

    return oralHistory ? toOralHistoryResponse(oralHistory) : null;
}

async function updateOralHistoryLowResVideo(oralHistoryId, lowResInput) {
    const store = await readStore();
    const oralHistoryIndex = store.oralHistories.findIndex(
        (entry) => String(entry.oralHistoryId) === String(oralHistoryId),
    );

    if (oralHistoryIndex === -1) {
        return null;
    }

    const currentOralHistory = store.oralHistories[oralHistoryIndex];
    const now = new Date().toISOString();
    const updatedOralHistory = {
        ...currentOralHistory,
        lowResOriginalFilename: String(lowResInput?.originalFilename || "").trim(),
        lowResFileSize: Number(lowResInput?.fileSize || 0),
        lowResMimeType: String(lowResInput?.mimeType || "").trim().toLowerCase(),
        lowResStoredFilePath: String(lowResInput?.storedFilePath || "").trim(),
        lowResUploadedAt: now,
        updatedAt: now,
    };

    store.oralHistories[oralHistoryIndex] = updatedOralHistory;
    await writeStore(store);

    return toOralHistoryResponse(updatedOralHistory);
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

async function listProfileOralHistoryReferences(profileId) {
    const normalizedProfileId = String(profileId || "").trim();

    if (!normalizedProfileId) {
        return [];
    }

    const store = await readStore();

    return store.oralHistories
        .filter((entry) => normalizeProfileIds(entry.profileIds).includes(normalizedProfileId))
        .map((entry) => toOralHistoryResponse(entry))
        .sort(compareOralHistories);
}

function assertOralHistoryIsUnique({
    oralHistories,
    key,
    episodeNumber,
    interviewee,
    isFullLength,
    excludedOralHistoryId = "",
}) {
    const normalizedKey = String(key || "").trim().toLowerCase();
    const normalizedInterviewee = String(interviewee || "").trim().toLowerCase();

    const comparableOralHistories = (Array.isArray(oralHistories) ? oralHistories : [])
        .filter((entry) => String(entry.oralHistoryId) !== String(excludedOralHistoryId));

    if (comparableOralHistories.some((entry) => String(entry.key || "").trim().toLowerCase() === normalizedKey)) {
        const error = new Error(`An oral history with key "${normalizedKey}" already exists.`);
        error.statusCode = 409;
        throw error;
    }

    if (
        comparableOralHistories.some(
            (entry) =>
                !isFullLength
                && !entry.isFullLength
                && Number(entry.episodeNumber) === Number(episodeNumber)
                && String(entry.interviewee || "").trim().toLowerCase() === normalizedInterviewee,
        )
    ) {
        const error = new Error(`Episode ${episodeNumber} already exists for ${interviewee}.`);
        error.statusCode = 409;
        throw error;
    }

    if (
        isFullLength
        && comparableOralHistories.some(
            (entry) =>
                entry.isFullLength
                && String(entry.interviewee || "").trim().toLowerCase() === normalizedInterviewee,
        )
    ) {
        const error = new Error(`A full-length interview already exists for ${interviewee}.`);
        error.statusCode = 409;
        throw error;
    }
}

function normalizeProfileIds(profileIds) {
    return Array.from(new Set(
        (Array.isArray(profileIds) ? profileIds : [])
            .map((profileId) => String(profileId || "").trim())
            .filter(Boolean),
    ));
}

function compareOralHistories(leftEntry, rightEntry) {
    const leftInterviewee = String(leftEntry.interviewee || "");
    const rightInterviewee = String(rightEntry.interviewee || "");
    const intervieweeComparison = leftInterviewee.localeCompare(rightInterviewee, undefined, {
        sensitivity: "base",
    });

    if (intervieweeComparison !== 0) {
        return intervieweeComparison;
    }

    if (Boolean(leftEntry.isFullLength) !== Boolean(rightEntry.isFullLength)) {
        return leftEntry.isFullLength ? -1 : 1;
    }

    return Number(leftEntry.episodeNumber || 0) - Number(rightEntry.episodeNumber || 0);
}

module.exports = {
    createOralHistory,
    deleteOralHistory,
    ensureOralHistoryStore,
    getOralHistoryById,
    listProfileOralHistoryReferences,
    listOralHistories,
    oralHistoryStorePath,
    updateOralHistory,
    updateOralHistoryLowResVideo,
};
