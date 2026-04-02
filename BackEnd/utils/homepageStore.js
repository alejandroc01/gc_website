const fs = require("fs/promises");
const path = require("path");
const {
    copyBundledStorageFileIfMissing,
    storageDirectory,
} = require("./storageConfig");
const { normalizeStoredFilePath } = require("./uploadConfig");

const homepageStorePath = path.join(storageDirectory, "homepage.json");
const defaultHomepage = {
    title: "Alumni Archives",
    description: "This is a test description. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Donec a diam lectus. Sed sit amet ipsum mauris. Maecenas congue ligula ac quam viverra nec consectetur ante hendrerit. Donec et mollis dolor. Praesent et diam eget libero egestas mattis sit amet vitae augue.",
    imageOriginalFilename: null,
    storedFilePath: null,
    imageWidth: null,
    imageHeight: null,
    updatedAt: null,
    imageUploadTimestamp: null,
};
const defaultStore = {
    homepage: defaultHomepage,
};

async function ensureHomepageStore() {
    await copyBundledStorageFileIfMissing("homepage.json");

    try {
        await fs.access(homepageStorePath);
    } catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }

        await fs.writeFile(homepageStorePath, JSON.stringify(defaultStore, null, 2));
    }
}

async function readStore() {
    await ensureHomepageStore();

    const rawStore = await fs.readFile(homepageStorePath, "utf8");

    if (!rawStore.trim()) {
        return { ...defaultStore, homepage: { ...defaultHomepage } };
    }

    const parsedStore = JSON.parse(rawStore);

    return {
        homepage: normalizeHomepageRecord(parsedStore.homepage),
    };
}

async function writeStore(store) {
    await ensureHomepageStore();
    await fs.writeFile(homepageStorePath, JSON.stringify(store, null, 2));
}

function buildImageUrl(storedFilePath) {
    const normalizedPath = normalizeStoredFilePath(storedFilePath);
    return `/api/${normalizedPath}`;
}

function toHomepageResponse(homepage) {
    return {
        title: homepage.title,
        description: homepage.description,
        imageUrl: homepage.storedFilePath ? buildImageUrl(homepage.storedFilePath) : null,
        imageOriginalFilename: homepage.imageOriginalFilename,
        imageWidth: homepage.imageWidth,
        imageHeight: homepage.imageHeight,
        updatedAt: homepage.updatedAt,
        imageUploadTimestamp: homepage.imageUploadTimestamp,
        hasCustomImage: Boolean(homepage.storedFilePath),
    };
}

async function getHomepageRecord() {
    const store = await readStore();
    return normalizeHomepageRecord(store.homepage);
}

async function getHomepageContent() {
    return toHomepageResponse(await getHomepageRecord());
}

async function updateHomepageMetadata({ title, description }) {
    const store = await readStore();
    const nextHomepage = {
        ...normalizeHomepageRecord(store.homepage),
        title: String(title),
        description: String(description),
        updatedAt: new Date().toISOString(),
    };

    store.homepage = nextHomepage;
    await writeStore(store);

    return toHomepageResponse(nextHomepage);
}

async function replaceHomepageContent({
    title,
    description,
    imageOriginalFilename,
    storedFilePath,
    imageWidth,
    imageHeight,
}) {
    const store = await readStore();
    const now = new Date().toISOString();
    const nextHomepage = {
        ...normalizeHomepageRecord(store.homepage),
        title: String(title),
        description: String(description),
        imageOriginalFilename: String(imageOriginalFilename),
        storedFilePath: String(storedFilePath),
        imageWidth: Number(imageWidth),
        imageHeight: Number(imageHeight),
        updatedAt: now,
        imageUploadTimestamp: now,
    };

    store.homepage = nextHomepage;
    await writeStore(store);

    return toHomepageResponse(nextHomepage);
}

function normalizeHomepageRecord(homepage) {
    return {
        title: normalizeRequiredString(homepage?.title, defaultHomepage.title),
        description: normalizeRequiredString(homepage?.description, defaultHomepage.description),
        imageOriginalFilename: normalizeOptionalString(homepage?.imageOriginalFilename),
        storedFilePath: normalizeOptionalString(homepage?.storedFilePath),
        imageWidth: normalizeOptionalNumber(homepage?.imageWidth),
        imageHeight: normalizeOptionalNumber(homepage?.imageHeight),
        updatedAt: normalizeOptionalString(homepage?.updatedAt),
        imageUploadTimestamp: normalizeOptionalString(homepage?.imageUploadTimestamp),
    };
}

function normalizeRequiredString(value, fallbackValue) {
    const normalizedValue = String(value || "").trim();
    return normalizedValue || String(fallbackValue || "");
}

function normalizeOptionalString(value) {
    const normalizedValue = String(value || "").trim();
    return normalizedValue || null;
}

function normalizeOptionalNumber(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
}

module.exports = {
    ensureHomepageStore,
    getHomepageContent,
    getHomepageRecord,
    homepageStorePath,
    replaceHomepageContent,
    updateHomepageMetadata,
};
