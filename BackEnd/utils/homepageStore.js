const fs = require("fs/promises");
const path = require("path");
const {
    copyBundledStorageFileIfMissing,
    storageDirectory,
} = require("./storageConfig");
const { normalizeStoredFilePath } = require("./uploadConfig");

const homepageStorePath = path.join(storageDirectory, "homepage.json");
const defaultHomepageEyebrow = "German Club of Virginia Tech";
const homepageTextStyleKeys = ["eyebrow", "title", "description"];
const allowedHomepageFontFamilies = new Set([
    "body",
    "display",
    "smallcaps",
    "script",
    "georgia",
    "times",
    "arial",
    "courier",
]);
const defaultHomepageTextStyles = {
    eyebrow: {
        fontFamily: "smallcaps",
        fontSize: 15,
        isBold: false,
        isItalic: false,
        isUnderlined: false,
    },
    title: {
        fontFamily: "display",
        fontSize: 52,
        isBold: false,
        isItalic: false,
        isUnderlined: false,
    },
    description: {
        fontFamily: "body",
        fontSize: 17,
        isBold: false,
        isItalic: false,
        isUnderlined: false,
    },
};
const defaultHomepage = {
    eyebrow: defaultHomepageEyebrow,
    title: "Digital Archives",
    description: "This is a test description. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Donec a diam lectus. Sed sit amet ipsum mauris. Maecenas congue ligula ac quam viverra nec consectetur ante hendrerit. Donec et mollis dolor. Praesent et diam eget libero egestas mattis sit amet vitae augue.",
    textStyles: defaultHomepageTextStyles,
    imageOriginalFilename: null,
    storedFilePath: null,
    imageWidth: null,
    imageHeight: null,
    updatedAt: null,
    imageUploadTimestamp: null,
};
const defaultStore = {
    homepage: buildDefaultHomepageRecord(),
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
        return buildDefaultStore();
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
        eyebrow: homepage.eyebrow,
        title: homepage.title,
        description: homepage.description,
        textStyles: normalizeHomepageTextStyles(homepage.textStyles),
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

async function updateHomepageMetadata({ eyebrow, title, description, textStyles }) {
    const store = await readStore();
    const nextHomepage = {
        ...normalizeHomepageRecord(store.homepage),
        eyebrow: String(eyebrow),
        title: String(title),
        description: String(description),
        textStyles: normalizeHomepageTextStyles(textStyles),
        updatedAt: new Date().toISOString(),
    };

    store.homepage = nextHomepage;
    await writeStore(store);

    return toHomepageResponse(nextHomepage);
}

async function replaceHomepageContent({
    eyebrow,
    title,
    description,
    textStyles,
    imageOriginalFilename,
    storedFilePath,
    imageWidth,
    imageHeight,
}) {
    const store = await readStore();
    const now = new Date().toISOString();
    const nextHomepage = {
        ...normalizeHomepageRecord(store.homepage),
        eyebrow: String(eyebrow),
        title: String(title),
        description: String(description),
        textStyles: normalizeHomepageTextStyles(textStyles),
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
        eyebrow: normalizeRequiredString(homepage?.eyebrow, defaultHomepage.eyebrow),
        title: normalizeRequiredString(homepage?.title, defaultHomepage.title),
        description: normalizeRequiredString(homepage?.description, defaultHomepage.description),
        textStyles: normalizeHomepageTextStyles(homepage?.textStyles),
        imageOriginalFilename: normalizeOptionalString(homepage?.imageOriginalFilename),
        storedFilePath: normalizeOptionalString(homepage?.storedFilePath),
        imageWidth: normalizeOptionalNumber(homepage?.imageWidth),
        imageHeight: normalizeOptionalNumber(homepage?.imageHeight),
        updatedAt: normalizeOptionalString(homepage?.updatedAt),
        imageUploadTimestamp: normalizeOptionalString(homepage?.imageUploadTimestamp),
    };
}

function buildDefaultStore() {
    return {
        homepage: buildDefaultHomepageRecord(),
    };
}

function buildDefaultHomepageRecord() {
    return {
        ...defaultHomepage,
        textStyles: normalizeHomepageTextStyles(defaultHomepage.textStyles),
    };
}

function normalizeHomepageTextStyles(textStyles) {
    return homepageTextStyleKeys.reduce((normalizedStyles, styleKey) => ({
        ...normalizedStyles,
        [styleKey]: normalizeHomepageTextStyle(
            textStyles?.[styleKey],
            defaultHomepageTextStyles[styleKey],
        ),
    }), {});
}

function normalizeHomepageTextStyle(textStyle, fallbackStyle) {
    const fontFamily = normalizeOptionalString(textStyle?.fontFamily);
    const fontSize = Number(textStyle?.fontSize);

    return {
        fontFamily: allowedHomepageFontFamilies.has(fontFamily) ? fontFamily : fallbackStyle.fontFamily,
        fontSize: clampNumber(
            Number.isFinite(fontSize) ? fontSize : fallbackStyle.fontSize,
            10,
            120,
        ),
        isBold: normalizeBoolean(textStyle?.isBold),
        isItalic: normalizeBoolean(textStyle?.isItalic),
        isUnderlined: normalizeBoolean(textStyle?.isUnderlined),
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

function normalizeBoolean(value) {
    return value === true || value === "true";
}

function clampNumber(value, minimumValue, maximumValue) {
    return Math.min(Math.max(Math.round(value), minimumValue), maximumValue);
}

module.exports = {
    ensureHomepageStore,
    getHomepageContent,
    getHomepageRecord,
    homepageStorePath,
    normalizeHomepageTextStyles,
    replaceHomepageContent,
    updateHomepageMetadata,
};
