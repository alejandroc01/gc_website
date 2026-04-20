const fs = require("fs/promises");
const path = require("path");

const { parseCsvRecords } = require("./csvParser");
const { listScrapbooks } = require("./scrapbookStore");

const scrapbookMetadataPath = path.join(
    __dirname,
    "..",
    "metaData",
    "GCAF Digital Archive Photo Meta-Data.xlsx - Sheet1.csv",
);

async function listProfileScrapbookReferences(profile) {
    const profileAliases = buildProfileAliases(profile);

    if (profileAliases.size === 0) {
        return [];
    }

    const metadataRows = await readScrapbookMetadataRows();
    const rowsByIdentifier = new Map(
        metadataRows.map((row) => [normalizeIdentifierKey(row.identifier), row]),
    );
    const uploadedPagesByIdentifier = await buildUploadedPagesByIdentifier();
    const groupedMatches = new Map();

    metadataRows.forEach((row) => {
        if (!row.tags.some((tag) => profileAliases.has(normalizeNameForMatch(tag)))) {
            return;
        }

        const parentKey = normalizeIdentifierKey(row.isPartOf);
        const groupKey = parentKey || normalizeIdentifierKey(row.identifier);
        const parentRow = parentKey ? rowsByIdentifier.get(parentKey) : row;
        const displayRow = parentRow || row;

        if (!groupedMatches.has(groupKey)) {
            groupedMatches.set(groupKey, {
                identifier: displayRow.identifier,
                title: displayRow.title,
                year: displayRow.date,
                source: displayRow.source,
                category: displayRow.category,
                description: displayRow.description,
                pageNumber: extractPageNumber(displayRow.identifier),
                matchedItems: [],
            });
        }

        const group = groupedMatches.get(groupKey);
        const isDetail = Boolean(parentKey);
        const matchedItem = {
            identifier: row.identifier,
            title: row.title,
            category: row.category,
            description: row.description,
            isDetail,
        };
        const hasDuplicate = group.matchedItems.some(
            (item) => normalizeIdentifierKey(item.identifier) === normalizeIdentifierKey(matchedItem.identifier),
        );

        if (!hasDuplicate) {
            group.matchedItems.push(matchedItem);
        }
    });

    return Array.from(groupedMatches.values())
        .map((group) => enrichScrapbookGroup(group, uploadedPagesByIdentifier))
        .sort(compareScrapbookReferences);
}

async function readScrapbookMetadataRows() {
    let csvText = "";

    try {
        csvText = await fs.readFile(scrapbookMetadataPath, "utf8");
    } catch (error) {
        if (error.code === "ENOENT") {
            return [];
        }

        throw error;
    }

    const { rows } = parseCsvRecords(csvText);

    return rows.map((row) => ({
        identifier: String(row.Identifier || "").trim(),
        title: String(row.Title || "").trim(),
        date: String(row.Date || "").trim(),
        description: String(row.Description || "").trim(),
        isPartOf: String(row["Is Part of"] || "").trim(),
        category: String(row["Event/Category"] || "").trim(),
        tags: splitTags(row.Tags),
        source: String(row.Source || "").trim(),
    })).filter((row) => row.identifier);
}

async function buildUploadedPagesByIdentifier() {
    const uploadedPagesByIdentifier = new Map();
    const scrapbooks = await listScrapbooks();

    scrapbooks.forEach((scrapbook) => {
        const pageEntries = Array.isArray(scrapbook.pageEntries) ? scrapbook.pageEntries : [];

        pageEntries.forEach((pageEntry, index) => {
            const key = normalizeIdentifierKey(pageEntry.originalFilename);

            if (!key) {
                return;
            }

            uploadedPagesByIdentifier.set(key, {
                scrapbookYear: scrapbook.scrapbookYear,
                pageIndex: index,
            });
        });
    });

    return uploadedPagesByIdentifier;
}

function enrichScrapbookGroup(group, uploadedPagesByIdentifier) {
    const uploadedPage = uploadedPagesByIdentifier.get(normalizeIdentifierKey(group.identifier));
    const year = group.year || uploadedPage?.scrapbookYear || "";
    const pageNumber = group.pageNumber || (Number.isInteger(uploadedPage?.pageIndex) ? uploadedPage.pageIndex + 1 : null);

    return {
        ...group,
        year,
        pageNumber,
        isUploaded: Boolean(uploadedPage),
        to: uploadedPage
            ? buildScrapbookLink(uploadedPage.scrapbookYear || year, uploadedPage.pageIndex)
            : buildScrapbookLink(year, null),
        matchedItems: group.matchedItems.sort(compareMatchedItems),
    };
}

function buildProfileAliases(profile) {
    const firstName = String(profile?.firstName || "").trim();
    const preferredName = String(profile?.preferredName || "").trim();
    const lastName = String(profile?.lastName || "").trim();
    const displayName = String(profile?.displayName || "").replace(/"/g, " ").trim();
    const aliases = [
        displayName,
        [firstName, lastName].filter(Boolean).join(" "),
        [preferredName, lastName].filter(Boolean).join(" "),
    ];

    return new Set(
        aliases
            .map((alias) => normalizeNameForMatch(alias))
            .filter(Boolean),
    );
}

function splitTags(tagsValue) {
    return String(tagsValue || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag && tag !== "??");
}

function normalizeNameForMatch(name) {
    return String(name || "")
        .toLowerCase()
        .replace(/["']/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeIdentifierKey(identifier) {
    return String(identifier || "")
        .trim()
        .toLowerCase()
        .replace(/\.[a-z0-9]+$/i, "");
}

function extractPageNumber(identifier) {
    const pageMatch = String(identifier || "").match(/-p(\d+)/i);
    return pageMatch ? Number(pageMatch[1]) : null;
}

function buildScrapbookLink(year, pageIndex) {
    const normalizedYear = String(year || "").trim();

    if (!normalizedYear) {
        return "/scrapbooks";
    }

    const searchParams = new URLSearchParams({ year: normalizedYear });

    if (Number.isInteger(pageIndex) && pageIndex >= 0) {
        searchParams.set("page", String(pageIndex + 1));
    }

    return `/scrapbooks?${searchParams.toString()}`;
}

function compareScrapbookReferences(leftReference, rightReference) {
    const leftYear = Number(leftReference.year || 0);
    const rightYear = Number(rightReference.year || 0);

    if (leftYear !== rightYear) {
        return rightYear - leftYear;
    }

    const leftPage = Number(leftReference.pageNumber || 0);
    const rightPage = Number(rightReference.pageNumber || 0);

    if (leftPage !== rightPage) {
        return leftPage - rightPage;
    }

    return String(leftReference.title || "").localeCompare(String(rightReference.title || ""), undefined, {
        sensitivity: "base",
    });
}

function compareMatchedItems(leftItem, rightItem) {
    if (leftItem.isDetail !== rightItem.isDetail) {
        return leftItem.isDetail ? 1 : -1;
    }

    return String(leftItem.title || "").localeCompare(String(rightItem.title || ""), undefined, {
        sensitivity: "base",
    });
}

module.exports = {
    listProfileScrapbookReferences,
};
