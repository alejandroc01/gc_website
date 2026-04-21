const fs = require("fs/promises");
const path = require("path");
const {
    defaultStorageDirectory,
    storageDirectory,
} = require("./storageConfig");
const {
    buildScrapbookStoredFilePath,
    normalizeStoredFilePath,
    scrapbookUploadsDirectory,
} = require("./uploadConfig");

const configuredScrapbookStorePath = String(process.env.SCRAPBOOK_STORAGE_FILE || "").trim();
const scrapbookStorePath = configuredScrapbookStorePath
    ? path.resolve(configuredScrapbookStorePath)
    : path.join(storageDirectory, "scrapbooks.json");
const defaultStore = {
    scrapbooks: [],
};

async function ensureScrapbookStore() {
    await fs.mkdir(path.dirname(scrapbookStorePath), { recursive: true });
    await copyBundledScrapbookStoreIfMissing();

    try {
        await fs.access(scrapbookStorePath);
    } catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }

        await fs.writeFile(scrapbookStorePath, JSON.stringify(defaultStore, null, 2));
    }
}

async function readStore() {
    await ensureScrapbookStore();

    const rawStore = await fs.readFile(scrapbookStorePath, "utf8");

    if (!rawStore.trim()) {
        return { ...defaultStore, scrapbooks: [] };
    }

    const parsedStore = JSON.parse(rawStore);
    const scrapbooks = Array.isArray(parsedStore.scrapbooks) ? parsedStore.scrapbooks : [];

    return { scrapbooks };
}

async function writeStore(store) {
    await ensureScrapbookStore();
    await fs.writeFile(scrapbookStorePath, JSON.stringify(store, null, 2));
}

async function copyBundledScrapbookStoreIfMissing() {
    const sourcePath = path.join(defaultStorageDirectory, "scrapbooks.json");

    if (path.resolve(scrapbookStorePath) === path.resolve(sourcePath)) {
        return false;
    }

    try {
        await fs.access(scrapbookStorePath);
        return false;
    } catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }
    }

    try {
        await fs.access(sourcePath);
    } catch (error) {
        if (error.code === "ENOENT") {
            return false;
        }

        throw error;
    }

    await fs.copyFile(sourcePath, scrapbookStorePath);
    return true;
}

function buildAssetUrl(storedFilePath) {
    return `/api/${normalizeStoredFilePath(storedFilePath)}`;
}

function toScrapbookResponse(scrapbook) {
    const pageRecords = buildPageRecords(scrapbook);

    return {
        ...scrapbook,
        scrapbookYear: scrapbook.scrapbookYear ? String(scrapbook.scrapbookYear) : null,
        title: scrapbook.title || buildScrapbookDisplayName(scrapbook.scrapbookYear),
        pdfUrl: scrapbook.pdfStoredFilePath ? buildAssetUrl(scrapbook.pdfStoredFilePath) : null,
        pageOriginalFilenames: pageRecords.map((pageRecord) => pageRecord.originalFilename),
        pageImageUrls: pageRecords.map((pageRecord) => buildAssetUrl(pageRecord.storedFilePath)),
        pageEntries: pageRecords.map((pageRecord) => ({
            pageId: pageRecord.pageId,
            originalFilename: pageRecord.originalFilename,
            imageUrl: buildAssetUrl(pageRecord.storedFilePath),
            thumbnailUrl: `/api/scrapbooks/${encodeURIComponent(scrapbook.scrapbookId)}/pages/${encodeURIComponent(pageRecord.pageId)}/thumbnail`,
        })),
    };
}

async function listScrapbooks() {
    const store = await readStore();
    const discoveredScrapbooks = await listUploadedDirectoryScrapbooks();

    return mergeScrapbooks(store.scrapbooks, discoveredScrapbooks)
        .map((scrapbook) => toScrapbookResponse(scrapbook));
}

async function getScrapbookById(scrapbookId) {
    const store = await readStore();
    const discoveredScrapbooks = await listUploadedDirectoryScrapbooks();
    const mergedScrapbooks = mergeScrapbooks(store.scrapbooks, discoveredScrapbooks);
    const scrapbook = mergedScrapbooks.find((entry) => entry.scrapbookId === scrapbookId);

    return scrapbook ? toScrapbookResponse(scrapbook) : null;
}

async function getScrapbookPageAsset(scrapbookId, pageId) {
    const store = await readStore();
    const discoveredScrapbooks = await listUploadedDirectoryScrapbooks();
    const mergedScrapbooks = mergeScrapbooks(store.scrapbooks, discoveredScrapbooks);
    const scrapbook = mergedScrapbooks.find((entry) => entry.scrapbookId === scrapbookId);

    if (!scrapbook) {
        return null;
    }

    const pageRecord = buildPageRecords(scrapbook).find(
        (record) => record.pageId === String(pageId || ""),
    );

    return {
        scrapbook,
        pageRecord: pageRecord || null,
    };
}

async function createScrapbook(metadata) {
    const store = await readStore();

    if (metadata.scrapbookYear && hasScrapbookYear(store.scrapbooks, metadata.scrapbookYear)) {
        const error = new Error(`A scrapbook for ${metadata.scrapbookYear} already exists.`);
        error.statusCode = 409;
        throw error;
    }

    store.scrapbooks.unshift(metadata);
    await writeStore(store);

    return toScrapbookResponse(metadata);
}

async function addScrapbookPage({
    scrapbookYear,
    originalFilename,
    storedFilePath,
    uploadTimestamp,
}) {
    const store = await readStore();
    const existingScrapbook = store.scrapbooks.find(
        (entry) => String(entry.scrapbookYear || "") === String(scrapbookYear || ""),
    );

    if (existingScrapbook) {
        const existingOriginalFilenames = Array.isArray(existingScrapbook.pageOriginalFilenames)
            ? existingScrapbook.pageOriginalFilenames
            : [];
        const hasDuplicateFilename = existingOriginalFilenames.some(
            (filename) => String(filename || "").toLowerCase() === String(originalFilename || "").toLowerCase(),
        );

        if (hasDuplicateFilename) {
            const error = new Error("A scrapbook page with that filename already exists. Please rename the file and try again.");
            error.statusCode = 409;
            throw error;
        }

        existingScrapbook.originalFilename = existingScrapbook.originalFilename || originalFilename;
        const updatedPageRecords = sortPageRecords([
            ...buildPageRecords(existingScrapbook),
            createPageRecord(storedFilePath, originalFilename),
        ]);
        existingScrapbook.pageImagePaths = updatedPageRecords.map((pageRecord) => pageRecord.storedFilePath);
        existingScrapbook.pageOriginalFilenames = updatedPageRecords.map((pageRecord) => pageRecord.originalFilename);
        existingScrapbook.pageCount = existingScrapbook.pageImagePaths.length;
        existingScrapbook.uploadTimestamp = uploadTimestamp || new Date().toISOString();
        await writeStore(store);
        return toScrapbookResponse(existingScrapbook);
    }

    const nextScrapbook = {
        scrapbookId: `scrapbook-${scrapbookYear}`,
        scrapbookYear,
        title: buildScrapbookDisplayName(scrapbookYear),
        originalFilename,
        pageOriginalFilenames: [originalFilename],
        pageImagePaths: [storedFilePath],
        pageCount: 1,
        uploadTimestamp: uploadTimestamp || new Date().toISOString(),
    };

    store.scrapbooks.unshift(nextScrapbook);
    await writeStore(store);

    return toScrapbookResponse(nextScrapbook);
}

async function deleteScrapbook(scrapbookId) {
    const store = await readStore();
    const discoveredScrapbooks = await listUploadedDirectoryScrapbooks();
    const mergedScrapbooks = mergeScrapbooks(store.scrapbooks, discoveredScrapbooks);
    const deletedScrapbook = mergedScrapbooks.find((entry) => entry.scrapbookId === scrapbookId);

    if (!deletedScrapbook) {
        return null;
    }

    store.scrapbooks = store.scrapbooks.filter((entry) => entry.scrapbookId !== scrapbookId);
    await writeStore(store);

    return deletedScrapbook;
}

async function deleteScrapbookPage(scrapbookId, pageId) {
    const store = await readStore();
    const discoveredScrapbooks = await listUploadedDirectoryScrapbooks();
    const mergedScrapbooks = mergeScrapbooks(store.scrapbooks, discoveredScrapbooks);
    const scrapbook = mergedScrapbooks.find((entry) => entry.scrapbookId === scrapbookId);

    if (!scrapbook) {
        return null;
    }

    const existingPageRecords = buildPageRecords(scrapbook);
    const deletedPageRecord = existingPageRecords.find((pageRecord) => pageRecord.pageId === String(pageId || ""));

    if (!deletedPageRecord) {
        return {
            scrapbook: toScrapbookResponse(scrapbook),
            deletedPage: null,
        };
    }

    const remainingPageRecords = existingPageRecords.filter(
        (pageRecord) => pageRecord.pageId !== deletedPageRecord.pageId,
    );
    const storedScrapbookIndex = store.scrapbooks.findIndex((entry) => entry.scrapbookId === scrapbookId);

    if (remainingPageRecords.length === 0) {
        if (storedScrapbookIndex >= 0) {
            store.scrapbooks.splice(storedScrapbookIndex, 1);
        }

        await writeStore(store);

        return {
            scrapbook: null,
            deletedPage: deletedPageRecord,
            deletedScrapbook: {
                ...scrapbook,
                pageImagePaths: [],
                pageOriginalFilenames: [],
                pageCount: 0,
            },
        };
    }

    const updatedScrapbook = {
        ...scrapbook,
        pageImagePaths: remainingPageRecords.map((pageRecord) => pageRecord.storedFilePath),
        pageOriginalFilenames: remainingPageRecords.map((pageRecord) => pageRecord.originalFilename),
        pageCount: remainingPageRecords.length,
        uploadTimestamp: new Date().toISOString(),
    };

    if (storedScrapbookIndex >= 0) {
        store.scrapbooks[storedScrapbookIndex] = updatedScrapbook;
    } else {
        store.scrapbooks.unshift(updatedScrapbook);
    }

    await writeStore(store);

    return {
        scrapbook: toScrapbookResponse(updatedScrapbook),
        deletedPage: deletedPageRecord,
    };
}

function hasScrapbookYear(scrapbooks, scrapbookYear) {
    return scrapbooks.some((entry) => String(entry.scrapbookYear || "") === String(scrapbookYear || ""));
}

function buildScrapbookDisplayName(scrapbookYear) {
    return scrapbookYear ? `${scrapbookYear} Scrapbook` : "Scrapbook";
}

module.exports = {
    addScrapbookPage,
    buildScrapbookDisplayName,
    createScrapbook,
    deleteScrapbook,
    deleteScrapbookPage,
    ensureScrapbookStore,
    getScrapbookById,
    getScrapbookPageAsset,
    listScrapbooks,
};

async function listUploadedDirectoryScrapbooks() {
    let yearEntries = [];

    try {
        yearEntries = await fs.readdir(scrapbookUploadsDirectory, { withFileTypes: true });
    } catch (error) {
        if (error.code === "ENOENT") {
            return [];
        }

        throw error;
    }

    const scrapbooks = [];

    for (const yearEntry of yearEntries) {
        if (!yearEntry.isDirectory()) {
            continue;
        }

        const scrapbookYear = extractScrapbookYear(yearEntry.name);

        if (!scrapbookYear) {
            continue;
        }

        const pageDirectory = await resolveScrapbookPageDirectory(yearEntry.name);

        if (!pageDirectory) {
            continue;
        }

        const pageEntries = await fs.readdir(pageDirectory, { withFileTypes: true });
        const pageOriginalFilenames = pageEntries
            .filter((entry) => entry.isFile() && /\.(jpe?g|png|webp)$/i.test(entry.name))
            .map((entry) => entry.name)
            .sort((leftValue, rightValue) => leftValue.localeCompare(rightValue, undefined, { numeric: true }));

        if (pageOriginalFilenames.length === 0) {
            continue;
        }

        const pageImagePaths = sortPageImagePaths(
            pageOriginalFilenames.map((filename) => {
                const pathSegments = pageDirectory === path.join(scrapbookUploadsDirectory, yearEntry.name)
                    ? [yearEntry.name, filename]
                    : [yearEntry.name, "pages", filename];

                return buildScrapbookStoredFilePath(...pathSegments);
            }),
        );

        scrapbooks.push({
            scrapbookId: `scrapbook-${scrapbookYear}`,
            scrapbookYear,
            title: buildScrapbookDisplayName(scrapbookYear),
            originalFilename: pageOriginalFilenames[0],
            pageOriginalFilenames,
            pageImagePaths,
            pageCount: pageImagePaths.length,
            uploadTimestamp: null,
        });
    }

    return scrapbooks;
}

async function resolveScrapbookPageDirectory(directoryName) {
    const directDirectory = path.join(scrapbookUploadsDirectory, directoryName);
    const nestedPagesDirectory = path.join(directDirectory, "pages");

    try {
        const nestedPagesStats = await fs.stat(nestedPagesDirectory);

        if (nestedPagesStats.isDirectory()) {
            return nestedPagesDirectory;
        }
    } catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }
    }

    try {
        const directStats = await fs.stat(directDirectory);
        return directStats.isDirectory() ? directDirectory : null;
    } catch (error) {
        if (error.code === "ENOENT") {
            return null;
        }

        throw error;
    }
}

function extractScrapbookYear(directoryName) {
    const match = String(directoryName || "").match(/^(\d{4})/);
    return match ? match[1] : null;
}

function mergeScrapbooks(storedScrapbooks, discoveredScrapbooks) {
    const mergedByYear = new Map();

    for (const scrapbook of discoveredScrapbooks) {
        mergedByYear.set(String(scrapbook.scrapbookYear || scrapbook.scrapbookId), scrapbook);
    }

    for (const scrapbook of storedScrapbooks) {
        mergedByYear.set(String(scrapbook.scrapbookYear || scrapbook.scrapbookId), scrapbook);
    }

    return Array.from(mergedByYear.values());
}

function sortPageImagePaths(pageImagePaths) {
    return pageImagePaths
        .map((pageImagePath) => String(pageImagePath || "").trim())
        .filter(Boolean)
        .sort((leftValue, rightValue) => {
            const leftFilename = path.basename(leftValue);
            const rightFilename = path.basename(rightValue);
            const leftPageNumber = extractPageNumber(leftFilename);
            const rightPageNumber = extractPageNumber(rightFilename);

            if (leftPageNumber !== null && rightPageNumber !== null && leftPageNumber !== rightPageNumber) {
                return leftPageNumber - rightPageNumber;
            }

            return leftFilename.localeCompare(rightFilename, undefined, { numeric: true });
        });
}

function buildPageRecords(scrapbook) {
    const pageImagePaths = Array.isArray(scrapbook?.pageImagePaths) ? scrapbook.pageImagePaths : [];
    const pageOriginalFilenames = Array.isArray(scrapbook?.pageOriginalFilenames) ? scrapbook.pageOriginalFilenames : [];

    return sortPageRecords(
        pageImagePaths.map((storedFilePath, index) =>
            createPageRecord(storedFilePath, pageOriginalFilenames[index] || path.basename(String(storedFilePath || ""))),
        ),
    );
}

function createPageRecord(storedFilePath, originalFilename) {
    const normalizedStoredFilePath = String(storedFilePath || "").trim();

    return {
        pageId: path.basename(normalizedStoredFilePath),
        storedFilePath: normalizedStoredFilePath,
        originalFilename: String(originalFilename || path.basename(normalizedStoredFilePath)),
    };
}

function sortPageRecords(pageRecords) {
    return pageRecords
        .map((pageRecord) => ({
            pageId: String(pageRecord?.pageId || path.basename(String(pageRecord?.storedFilePath || "").trim())),
            storedFilePath: String(pageRecord?.storedFilePath || "").trim(),
            originalFilename: String(pageRecord?.originalFilename || "").trim(),
        }))
        .filter((pageRecord) => pageRecord.storedFilePath)
        .sort((leftValue, rightValue) => {
            const leftFilename = path.basename(leftValue.storedFilePath);
            const rightFilename = path.basename(rightValue.storedFilePath);
            const leftPageNumber = extractPageNumber(leftFilename);
            const rightPageNumber = extractPageNumber(rightFilename);

            if (leftPageNumber !== null && rightPageNumber !== null && leftPageNumber !== rightPageNumber) {
                return leftPageNumber - rightPageNumber;
            }

            return leftFilename.localeCompare(rightFilename, undefined, { numeric: true });
        });
}

function extractPageNumber(filename) {
    const match = String(filename || "").match(/(?:^|[^a-z0-9])p(?:age)?[-_ ]?(\d+)/i);

    if (!match) {
        return null;
    }

    const pageNumber = Number(match[1]);
    return Number.isFinite(pageNumber) ? pageNumber : null;
}
