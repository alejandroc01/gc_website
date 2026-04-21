const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const { parseCsvRecords } = require("./csvParser");
const { listScrapbooks } = require("./scrapbookStore");
const { scrapbookUploadsDirectory } = require("./uploadConfig");

const bundledScrapbookMetadataPath = path.join(
    __dirname,
    "..",
    "metaData",
    "GCAF Digital Archive Photo Meta-Data.xlsx - Sheet1.csv",
);
const scrapbookMetadataDirectory = path.join(scrapbookUploadsDirectory, "metadata");
const scrapbookMetadataPath = path.join(scrapbookMetadataDirectory, "scrapbookMetadata.csv");
const scrapbookMetadataLinksPath = path.join(scrapbookMetadataDirectory, "scrapbookMetadataProfileLinks.json");
const requiredMetadataHeaders = ["Identifier", "Title", "Date", "Description", "Is Part of", "Event/Category", "Tags", "Source"];

async function listProfileScrapbookReferences(profile) {
    const profileAliases = buildProfileAliases(profile);

    if (profileAliases.size === 0 && !profile?.id) {
        return [];
    }

    const metadataRows = await readScrapbookMetadataRows();
    const manualLinks = await listScrapbookMetadataProfileLinks();
    const profileManualLinks = manualLinks.filter((link) => String(link.profileId) === String(profile.id));
    const profileManualNameAliases = new Set(
        profileManualLinks.map((link) => normalizeNameForMatch(link.rawName)).filter(Boolean),
    );
    const rowsByIdentifier = new Map(
        metadataRows.map((row) => [normalizeIdentifierKey(row.identifier), row]),
    );
    const uploadedPagesByIdentifier = await buildUploadedPagesByIdentifier();
    const groupedMatches = new Map();

    metadataRows.forEach((row) => {
        const hasAutomaticMatch = row.tags.some((tag) => profileAliases.has(normalizeNameForMatch(tag)));
        const hasManualMatch = row.tags.some((tag) => profileManualNameAliases.has(normalizeNameForMatch(tag)));

        if (!hasAutomaticMatch && !hasManualMatch) {
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
            matchedNames: [
                ...row.tags.filter((tag) => profileAliases.has(normalizeNameForMatch(tag))),
                ...row.tags.filter((tag) => profileManualNameAliases.has(normalizeNameForMatch(tag))),
            ].filter(Boolean),
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
        csvText = await fs.readFile(await resolveScrapbookMetadataPath(), "utf8");
    } catch (error) {
        if (error.code === "ENOENT") {
            return [];
        }

        throw error;
    }

    return parseScrapbookMetadataRows(csvText);
}

async function importScrapbookMetadataCsv(csvText, profiles = []) {
    const { headers } = parseCsvRecords(csvText);
    validateMetadataHeaders(headers);
    const rows = parseScrapbookMetadataRows(csvText);

    await ensureScrapbookMetadataDirectory();
    await fs.writeFile(scrapbookMetadataPath, String(csvText || ""));

    return buildScrapbookMetadataReview(rows, profiles);
}

async function getScrapbookMetadataReview(profiles = []) {
    const rows = await readScrapbookMetadataRows();
    return buildScrapbookMetadataReview(rows, profiles);
}

async function saveScrapbookMetadataProfileLinks(linksInput) {
    const now = new Date().toISOString();
    const incomingLinks = normalizeIncomingProfileLinks(linksInput, now);
    const incomingLinksByName = collapseIncomingProfileLinksByName(incomingLinks);
    const store = await readMetadataLinksStore();
    const nextLinksByKey = new Map(
        store.profileLinks.map((link) => [buildManualLinkKey(link.identifier, link.rawName), link]),
    );

    incomingLinksByName.forEach((incomingLink) => {
        const key = buildManualLinkKey(incomingLink.identifier, incomingLink.rawName);

        if (!incomingLink.profileId) {
            nextLinksByKey.delete(key);
            return;
        }

        const existingLink = nextLinksByKey.get(key);

        nextLinksByKey.set(key, {
            id: existingLink?.id || `scrapbook-link-${crypto.randomUUID()}`,
            identifier: incomingLink.identifier,
            rawName: incomingLink.rawName,
            profileId: incomingLink.profileId,
            matchType: "manual",
            createdAt: existingLink?.createdAt || now,
            updatedAt: now,
        });
    });

    store.profileLinks = Array.from(nextLinksByKey.values()).sort(compareProfileLinks);
    await writeMetadataLinksStore(store);

    return {
        savedCount: incomingLinksByName.filter((link) => link.profileId).length,
        removedCount: incomingLinksByName.filter((link) => !link.profileId).length,
        profileLinks: store.profileLinks,
    };
}

async function listScrapbookMetadataProfileLinks() {
    const store = await readMetadataLinksStore();
    return store.profileLinks;
}

function parseScrapbookMetadataRows(csvText) {
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

async function buildScrapbookMetadataReview(metadataRows, profiles = []) {
    const profileLinks = await listScrapbookMetadataProfileLinks();
    const profileMap = new Map((Array.isArray(profiles) ? profiles : []).map((profile) => [String(profile.id), profile]));
    const uploadedPagesByIdentifier = await buildUploadedPagesByIdentifier();
    const manualLinksByName = new Map(
        profileLinks.map((link) => [normalizeNameForMatch(link.rawName), link]),
    );

    const rows = metadataRows.map((row) => {
        const people = row.tags.map((rawName) => {
            const manualLink = manualLinksByName.get(normalizeNameForMatch(rawName));
            const automaticMatch = manualLink ? null : findAutomaticProfileMatch(rawName, profiles);
            const profileId = manualLink?.profileId || automaticMatch?.profile?.id || null;

            return {
                rawName,
                profileId,
                matchedProfileId: automaticMatch?.profile?.id || null,
                matchType: manualLink ? "manual" : automaticMatch?.matchType || "unmatched",
                matchConfidence: manualLink ? 1 : automaticMatch?.confidence || 0,
                needsReview: !profileId || Boolean(automaticMatch?.ambiguous),
                profile: profileId ? summarizeProfile(profileMap.get(String(profileId))) : null,
            };
        });
        const uploadedPage = uploadedPagesByIdentifier.get(normalizeIdentifierKey(row.identifier));

        return {
            identifier: row.identifier,
            title: row.title,
            year: row.date,
            description: row.description,
            isPartOf: row.isPartOf,
            category: row.category,
            source: row.source,
            pageNumber: extractPageNumber(row.identifier),
            isUploaded: Boolean(uploadedPage),
            people,
        };
    });

    const people = rows.flatMap((row) => row.people);

    return {
        rowCount: rows.length,
        peopleCount: people.length,
        matchedCount: people.filter((person) => person.profileId).length,
        needsReviewCount: people.filter((person) => person.needsReview).length,
        rows,
    };
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
                imageUrl: pageEntry.imageUrl || "",
                originalFilename: pageEntry.originalFilename || "",
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
        imageUrl: uploadedPage?.imageUrl || "",
        originalFilename: uploadedPage?.originalFilename || "",
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

function findAutomaticProfileMatch(rawName, profiles) {
    const normalizedName = normalizeNameForMatch(rawName);

    if (!normalizedName) {
        return null;
    }

    const matches = (Array.isArray(profiles) ? profiles : [])
        .map((profile) => ({
            profile,
            aliases: buildProfileAliases(profile),
        }))
        .filter((entry) => entry.aliases.has(normalizedName));

    if (matches.length === 1) {
        return {
            profile: matches[0].profile,
            matchType: "automatic",
            confidence: 1,
            ambiguous: false,
        };
    }

    if (matches.length > 1) {
        return {
            profile: matches[0].profile,
            matchType: "automatic",
            confidence: 0.5,
            ambiguous: true,
        };
    }

    return null;
}

function summarizeProfile(profile) {
    if (!profile) {
        return null;
    }

    return {
        id: profile.id,
        displayName: profile.displayName,
        graduationYear: profile.graduationYear || null,
    };
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

function validateMetadataHeaders(headers) {
    const normalizedHeaders = new Set((Array.isArray(headers) ? headers : []).map((header) => String(header || "").trim()));
    const missingHeaders = requiredMetadataHeaders.filter((header) => !normalizedHeaders.has(header));

    if (missingHeaders.length > 0) {
        const error = new Error(`Metadata CSV is missing required columns: ${missingHeaders.join(", ")}`);
        error.statusCode = 400;
        throw error;
    }
}

async function resolveScrapbookMetadataPath() {
    try {
        await fs.access(scrapbookMetadataPath);
        return scrapbookMetadataPath;
    } catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }
    }

    return bundledScrapbookMetadataPath;
}

async function readMetadataLinksStore() {
    await ensureScrapbookMetadataDirectory();

    try {
        const rawStore = await fs.readFile(scrapbookMetadataLinksPath, "utf8");
        const parsedStore = JSON.parse(rawStore);

        return {
            profileLinks: Array.isArray(parsedStore.profileLinks)
                ? parsedStore.profileLinks.map(normalizeStoredProfileLink).filter(Boolean)
                : [],
        };
    } catch (error) {
        if (error.code === "ENOENT") {
            return { profileLinks: [] };
        }

        throw error;
    }
}

async function writeMetadataLinksStore(store) {
    await ensureScrapbookMetadataDirectory();
    await fs.writeFile(scrapbookMetadataLinksPath, JSON.stringify({
        profileLinks: Array.isArray(store?.profileLinks) ? store.profileLinks : [],
    }, null, 2));
}

async function ensureScrapbookMetadataDirectory() {
    await fs.mkdir(scrapbookMetadataDirectory, { recursive: true });
}

function normalizeIncomingProfileLinks(linksInput, timestamp) {
    return (Array.isArray(linksInput) ? linksInput : [])
        .map((link) => ({
            id: String(link?.id || `scrapbook-link-${crypto.randomUUID()}`),
            identifier: String(link?.identifier || "").trim(),
            rawName: String(link?.rawName || "").trim(),
            profileId: link?.profileId ? String(link.profileId) : null,
            matchType: "manual",
            createdAt: link?.createdAt || timestamp,
            updatedAt: timestamp,
        }))
        .filter((link) => link.identifier && link.rawName);
}

function collapseIncomingProfileLinksByName(incomingLinks) {
    const linksByName = new Map();

    incomingLinks.forEach((incomingLink) => {
        const key = normalizeNameForMatch(incomingLink.rawName);
        const existingLink = linksByName.get(key);

        if (!existingLink || incomingLink.profileId) {
            linksByName.set(key, incomingLink);
        }
    });

    return Array.from(linksByName.values());
}

function normalizeStoredProfileLink(link) {
    const identifier = String(link?.identifier || "").trim();
    const rawName = String(link?.rawName || "").trim();
    const profileId = String(link?.profileId || "").trim();

    if (!identifier || !rawName || !profileId) {
        return null;
    }

    return {
        id: String(link?.id || `scrapbook-link-${crypto.randomUUID()}`),
        identifier,
        rawName,
        profileId,
        matchType: "manual",
        createdAt: link?.createdAt || new Date().toISOString(),
        updatedAt: link?.updatedAt || link?.createdAt || new Date().toISOString(),
    };
}

function buildManualLinkKey(identifier, rawName) {
    return normalizeNameForMatch(rawName || identifier);
}

function compareProfileLinks(leftLink, rightLink) {
    return (
        normalizeIdentifierKey(leftLink.identifier).localeCompare(normalizeIdentifierKey(rightLink.identifier))
        || normalizeNameForMatch(leftLink.rawName).localeCompare(normalizeNameForMatch(rightLink.rawName))
    );
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
    getScrapbookMetadataReview,
    importScrapbookMetadataCsv,
    listProfileScrapbookReferences,
    listScrapbookMetadataProfileLinks,
    readScrapbookMetadataRows,
    saveScrapbookMetadataProfileLinks,
};
