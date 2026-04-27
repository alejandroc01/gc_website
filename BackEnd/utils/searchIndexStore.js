const { listComposites } = require("./compositeStore");
const { listHistories } = require("./historyStore");
const { listOralHistories } = require("./oralHistoryStore");
const { listProfiles } = require("./profileStore");
const { listScrapbooks } = require("./scrapbookStore");
const { readScrapbookMetadataRows } = require("./scrapbookMetadataStore");

const searchIndexCacheDurationMs = 60 * 1000;
let cachedSearchIndex = null;
let cachedSearchIndexExpiresAt = 0;
let pendingSearchIndexPromise = null;

async function getSearchIndex({ forceRefresh = false } = {}) {
    const now = Date.now();

    if (!forceRefresh && cachedSearchIndex && cachedSearchIndexExpiresAt > now) {
        return cachedSearchIndex;
    }

    if (!forceRefresh && pendingSearchIndexPromise) {
        return pendingSearchIndexPromise;
    }

    pendingSearchIndexPromise = buildSearchIndex()
        .then((searchIndex) => {
            cachedSearchIndex = searchIndex;
            cachedSearchIndexExpiresAt = Date.now() + searchIndexCacheDurationMs;
            return searchIndex;
        })
        .finally(() => {
            pendingSearchIndexPromise = null;
        });

    return pendingSearchIndexPromise;
}

function clearSearchIndexCache() {
    cachedSearchIndex = null;
    cachedSearchIndexExpiresAt = 0;
    pendingSearchIndexPromise = null;
}

async function buildSearchIndex() {
    const [
        profiles,
        composites,
        scrapbooks,
        clubHistories,
        oralHistories,
        scrapbookMetadataRows,
    ] = await Promise.all([
        listProfiles(),
        listComposites(),
        listScrapbooks(),
        listHistories(),
        listOralHistories(),
        readScrapbookMetadataRows(),
    ]);

    return {
        generatedAt: new Date().toISOString(),
        sections: {
            member: profiles.map(buildMemberSearchItem).filter(Boolean),
            composite: composites.map(buildCompositeSearchItem).filter(Boolean),
            scrapbook: scrapbooks.map(buildScrapbookSearchItem).filter(Boolean),
            scrapbookPage: buildScrapbookPageSearchItems(scrapbooks, scrapbookMetadataRows),
            oralHistory: buildOralHistorySearchItems(oralHistories),
            oralHistoryEpisode: oralHistories.map(buildOralHistoryEpisodeSearchItem).filter(Boolean),
            clubHistory: clubHistories.map(buildClubHistorySearchItem).filter(Boolean),
        },
    };
}

function buildMemberSearchItem(profile) {
    const label = profile.displayName || "Unnamed member";

    return createSearchItem({
        key: `member-${profile.id}`,
        kind: "member",
        profileId: profile.id,
        label,
        meta: buildMemberMeta(profile),
        to: `/member/${profile.id}`,
        searchFields: [
            label,
            profile.firstName,
            profile.lastName,
            profile.preferredName,
            profile.city,
            profile.stateProvince,
            profile.graduationYear ? String(profile.graduationYear) : "",
        ],
        exactValues: [profile.graduationYear],
        exactBoost: 12,
    });
}

function buildCompositeSearchItem(composite) {
    const year = String(composite.compositeYear || "").trim();
    const label = year ? `${year} Composite` : "Composite";

    return createSearchItem({
        key: `composite-${composite.compositeId}`,
        kind: "composite",
        label,
        meta: "Composite Image",
        year,
        to: buildCompositeLink(year),
        searchFields: [
            label,
            year,
            composite.displayName,
            composite.originalFilename,
            "composite",
            "archive",
        ],
        exactValues: [year],
        exactBoost: 34,
    });
}

function buildScrapbookSearchItem(scrapbook) {
    const year = String(scrapbook.scrapbookYear || "").trim();
    const label = scrapbook.title || (year ? `${year} Scrapbook` : "Scrapbook");

    return createSearchItem({
        key: `scrapbook-${scrapbook.scrapbookId || year || normalizeSearchKey(label)}`,
        kind: "scrapbook",
        label,
        meta: buildScrapbookMeta(scrapbook),
        year,
        to: buildScrapbookLink(year),
        searchFields: [
            label,
            year,
            scrapbook.title,
            scrapbook.originalFilename,
            ...(Array.isArray(scrapbook.pageOriginalFilenames) ? scrapbook.pageOriginalFilenames.slice(0, 12) : []),
            "scrapbook",
            "archive",
        ],
        exactValues: [year],
        exactBoost: 30,
    });
}

function buildClubHistorySearchItem(history) {
    const title = String(history?.title || history?.originalFilename || "").trim();
    const key = String(history?.key || "").trim();
    const years = extractAssociatedYears([
        title,
        key,
        history?.description,
        history?.originalFilename,
    ]);
    const label = title || "Club History";

    return createSearchItem({
        key: `club-history-${history?.historyId || key || normalizeSearchKey(label)}`,
        kind: "clubHistory",
        label,
        meta: buildClubHistoryMeta(years),
        historyKey: key,
        year: years[years.length - 1] || "",
        to: buildClubHistoryLink(key),
        searchFields: [
            label,
            key,
            history?.description,
            history?.originalFilename,
            "club history",
            "history document",
            "written history",
            ...years,
        ],
        exactValues: years,
        exactBoost: 28,
    });
}

function buildOralHistorySearchItems(episodes) {
    const groupsByInterviewee = new Map();

    (Array.isArray(episodes) ? episodes : []).forEach((episode) => {
        const normalizedEpisode = normalizeOralHistorySearchEpisode(episode);
        const interviewee = normalizeSearchText(normalizedEpisode.interviewee);

        if (!interviewee) {
            return;
        }

        const key = interviewee.toLowerCase();
        const existingGroup = groupsByInterviewee.get(key) || {
            interviewee,
            episodes: [],
        };

        existingGroup.episodes.push(normalizedEpisode);
        groupsByInterviewee.set(key, existingGroup);
    });

    return Array.from(groupsByInterviewee.values())
        .map((group) => createSearchItem({
            key: `oral-history-${normalizeSearchKey(group.interviewee)}`,
            kind: "oralHistory",
            label: `${group.interviewee} Oral History`,
            meta: buildOralHistoryMeta(group.episodes),
            interviewee: group.interviewee,
            to: buildOralHistoryLink(group.interviewee),
            searchFields: [
                group.interviewee,
                "oral history",
                "oral histories",
                "interview",
                ...group.episodes.flatMap((episode) => [
                    episode.title,
                    episode.category,
                    episode.key,
                    episode.isFullLength ? "full interview" : "",
                    episode.episodeNumber ? `episode ${episode.episodeNumber}` : "",
                ]),
            ],
            exactValues: [group.interviewee],
            exactBoost: 32,
        }));
}

function buildOralHistoryEpisodeSearchItem(episode) {
    const normalizedEpisode = normalizeOralHistorySearchEpisode(episode);
    const episodeLabel = formatOralHistoryEpisodeLabel(normalizedEpisode);
    const title = formatOralHistoryEpisodeTitle(normalizedEpisode.title);
    const label = [
        normalizedEpisode.interviewee || "Oral History",
        [episodeLabel, title].filter(Boolean).join(": "),
    ].filter(Boolean).join(" - ");

    return createSearchItem({
        key: `oral-history-episode-${normalizedEpisode.oralHistoryId || normalizedEpisode.key || normalizeSearchKey(label)}`,
        kind: "oralHistoryEpisode",
        label,
        meta: normalizedEpisode.isFullLength
            ? "Full Interview | Oral History"
            : `${normalizedEpisode.category || "Episode"} | Oral History Episode`,
        interviewee: normalizedEpisode.interviewee,
        episodeId: normalizedEpisode.oralHistoryId || normalizedEpisode.key,
        to: buildOralHistoryLink(
            normalizedEpisode.interviewee,
            normalizedEpisode.oralHistoryId || normalizedEpisode.key,
        ),
        searchFields: [
            label,
            normalizedEpisode.interviewee,
            normalizedEpisode.title,
            normalizedEpisode.key,
            normalizedEpisode.category,
            normalizedEpisode.isFullLength ? "full interview" : "",
            normalizedEpisode.episodeNumber ? `episode ${normalizedEpisode.episodeNumber}` : "",
            normalizedEpisode.episodeNumber ? String(normalizedEpisode.episodeNumber) : "",
            "oral history episode",
            "oral history",
            "interview episode",
        ],
        exactValues: [normalizedEpisode.episodeNumber],
        exactBoost: 16,
    });
}

function buildScrapbookPageSearchItems(scrapbooks, metadataRows) {
    return dedupeSearchItems([
        ...buildUploadedScrapbookPageSearchItems(scrapbooks),
        ...buildMetadataScrapbookPageSearchItems(scrapbooks, metadataRows),
        ...buildTaggedScrapbookSearchItems(scrapbooks, metadataRows),
    ]);
}

function buildUploadedScrapbookPageSearchItems(scrapbooks) {
    const items = [];

    (Array.isArray(scrapbooks) ? scrapbooks : []).forEach((scrapbook) => {
        const year = String(scrapbook?.scrapbookYear || "").trim();
        const pageEntries = Array.isArray(scrapbook?.pageEntries) ? scrapbook.pageEntries : [];
        const pageOriginalFilenames = Array.isArray(scrapbook?.pageOriginalFilenames)
            ? scrapbook.pageOriginalFilenames
            : [];
        const pageCount = Math.max(
            pageEntries.length,
            pageOriginalFilenames.length,
            Number(scrapbook?.pageCount || scrapbook?.pageImageUrls?.length || 0),
        );

        for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
            const pageEntry = pageEntries[pageIndex] || {};
            const pageNumber = pageIndex + 1;
            const originalFilename = pageEntry.originalFilename || pageOriginalFilenames[pageIndex] || "";
            const label = buildScrapbookPageLabel({
                year,
                pageNumber,
                title: scrapbook?.title,
            });

            items.push(createSearchItem({
                key: `uploaded-scrapbook-page-${scrapbook?.scrapbookId || year || "scrapbook"}-${pageEntry.pageId || pageNumber}`,
                kind: "scrapbookPage",
                label,
                meta: buildUploadedScrapbookPageMeta({ year, pageNumber }),
                year,
                pageIndex,
                pageNumber,
                to: buildScrapbookLink(year, pageIndex),
                searchFields: [
                    label,
                    year,
                    scrapbook?.title,
                    originalFilename,
                    pageEntry.pageId,
                    `page ${pageNumber}`,
                    String(pageNumber),
                    "scrapbook page",
                ],
                exactValues: [year],
                exactBoost: 28,
            }));
        }
    });

    return items;
}

function buildMetadataScrapbookPageSearchItems(scrapbooks, metadataRows) {
    const uploadedPagesByIdentifier = buildUploadedPagesByIdentifier(scrapbooks);

    return (Array.isArray(metadataRows) ? metadataRows : []).map((row) => {
        const year = String(row?.date || "").trim();
        const pageNumber = normalizePositiveInteger(extractPageNumber(row?.identifier));
        const title = String(row?.title || "").trim();
        const linkedUploadedPage = findLinkedUploadedPage(row, uploadedPagesByIdentifier);
        const label = buildScrapbookPageLabel({ year, pageNumber, title });

        return createSearchItem({
            key: `metadata-scrapbook-page-${normalizeSearchKey(row?.identifier || label)}`,
            kind: "scrapbookPage",
            label,
            meta: buildTaggedScrapbookMeta({ year, pageNumber, category: row?.category }),
            year,
            pageIndex: normalizeZeroBasedInteger(linkedUploadedPage?.pageIndex),
            pageNumber,
            to: buildScrapbookLink(year, linkedUploadedPage?.pageIndex, pageNumber),
            searchFields: [
                label,
                year,
                title,
                row?.identifier,
                row?.category,
                row?.description,
                row?.source,
                pageNumber ? `page ${pageNumber}` : "",
                pageNumber ? String(pageNumber) : "",
                "scrapbook page",
                ...(Array.isArray(row?.tags) ? row.tags : []),
            ],
            exactValues: [year],
            exactBoost: 26,
        });
    });
}

function buildTaggedScrapbookSearchItems(scrapbooks, metadataRows) {
    const uploadedPagesByIdentifier = buildUploadedPagesByIdentifier(scrapbooks);
    const items = [];

    (Array.isArray(metadataRows) ? metadataRows : []).forEach((row) => {
        const year = String(row?.date || "").trim();
        const pageNumber = normalizePositiveInteger(extractPageNumber(row?.identifier));
        const linkedUploadedPage = findLinkedUploadedPage(row, uploadedPagesByIdentifier);

        (Array.isArray(row?.tags) ? row.tags : []).forEach((rawName) => {
            const normalizedName = normalizeSearchText(rawName);

            if (!normalizedName) {
                return;
            }

            items.push(createSearchItem({
                key: `tagged-scrapbook-${normalizeSearchKey(normalizedName)}-${normalizeSearchKey(row?.identifier || row?.title || normalizedName)}`,
                kind: "scrapbookPage",
                label: `${normalizedName} in ${row?.title || "scrapbook page"}`,
                meta: buildTaggedScrapbookMeta({ year, pageNumber, category: row?.category }),
                year,
                pageIndex: normalizeZeroBasedInteger(linkedUploadedPage?.pageIndex),
                pageNumber,
                to: buildScrapbookLink(year, linkedUploadedPage?.pageIndex, pageNumber),
                modalIdentifier: row?.identifier || "",
                searchFields: [
                    normalizedName,
                    row?.title,
                    year,
                    row?.identifier,
                    row?.category,
                    pageNumber ? `page ${pageNumber}` : "",
                    pageNumber ? String(pageNumber) : "",
                    "scrapbook page",
                ],
                exactValues: [normalizedName, year],
                exactBoost: 16,
            }));
        });
    });

    return items;
}

function createSearchItem({
    key,
    kind,
    label,
    meta,
    to,
    searchFields,
    exactValues = [],
    exactBoost = 0,
    ...rest
}) {
    return {
        key,
        kind,
        label,
        meta,
        to,
        ...rest,
        exactBoost,
        exactValues: normalizeSearchFields(exactValues),
        searchFields: normalizeSearchFields(searchFields),
    };
}

function normalizeSearchFields(fields) {
    return Array.from(new Set(
        (Array.isArray(fields) ? fields : [fields])
            .flatMap((field) => (Array.isArray(field) ? field : [field]))
            .map((field) => String(field || "").trim().toLowerCase())
            .filter(Boolean),
    ));
}

function dedupeSearchItems(items) {
    const dedupedItems = new Map();

    (Array.isArray(items) ? items : []).forEach((item) => {
        const key = String(item?.key || "").trim();

        if (!key || dedupedItems.has(key)) {
            return;
        }

        dedupedItems.set(key, item);
    });

    return Array.from(dedupedItems.values());
}

function buildUploadedPagesByIdentifier(scrapbooks) {
    const uploadedPagesByIdentifier = new Map();

    (Array.isArray(scrapbooks) ? scrapbooks : []).forEach((scrapbook) => {
        const pageEntries = Array.isArray(scrapbook?.pageEntries) ? scrapbook.pageEntries : [];

        pageEntries.forEach((pageEntry, index) => {
            const uploadedPage = {
                scrapbookYear: scrapbook.scrapbookYear,
                pageIndex: index,
                originalFilename: pageEntry?.originalFilename || "",
            };
            const directKey = normalizeIdentifierKey(pageEntry?.originalFilename);
            const canonicalKey = buildCanonicalScrapbookPageKey(scrapbook.scrapbookYear, pageEntry?.originalFilename);

            if (directKey) {
                uploadedPagesByIdentifier.set(directKey, uploadedPage);
            }

            if (canonicalKey && !uploadedPagesByIdentifier.has(canonicalKey)) {
                uploadedPagesByIdentifier.set(canonicalKey, uploadedPage);
            }
        });
    });

    return uploadedPagesByIdentifier;
}

function findLinkedUploadedPage(row, uploadedPagesByIdentifier) {
    return findUploadedPageByIdentifier(uploadedPagesByIdentifier, row?.identifier, row?.date)
        || findUploadedPageByIdentifier(uploadedPagesByIdentifier, row?.isPartOf, row?.date);
}

function findUploadedPageByIdentifier(uploadedPagesByIdentifier, identifier, year) {
    const directKey = normalizeIdentifierKey(identifier);

    if (directKey && uploadedPagesByIdentifier.has(directKey)) {
        return uploadedPagesByIdentifier.get(directKey);
    }

    const canonicalKey = buildCanonicalScrapbookPageKey(year, identifier);

    if (canonicalKey && uploadedPagesByIdentifier.has(canonicalKey)) {
        return uploadedPagesByIdentifier.get(canonicalKey);
    }

    return null;
}

function buildCanonicalScrapbookPageKey(year, identifier) {
    const normalizedIdentifier = normalizeIdentifierKey(identifier);
    const explicitYearMatch = normalizedIdentifier.match(/((?:19|20)\d{2})\s*scrapb/i);
    const normalizedYear = String(explicitYearMatch?.[1] || year || "").trim();
    const pageNumber = extractPageNumber(identifier);

    if (!normalizedYear || !pageNumber) {
        return "";
    }

    return `${normalizedYear.toLowerCase()}-p${pageNumber}`;
}

function normalizeIdentifierKey(identifier) {
    return String(identifier || "")
        .trim()
        .toLowerCase()
        .replace(/\.[a-z0-9]+$/i, "");
}

function buildMemberMeta(profile) {
    const location = [profile.city, profile.stateProvince].filter(Boolean).join(", ");

    if (location && profile.graduationYear) {
        return `${location} | Class of ${profile.graduationYear}`;
    }

    if (location) {
        return location;
    }

    if (profile.graduationYear) {
        return `Class of ${profile.graduationYear}`;
    }

    return "Member profile";
}

function buildCompositeLink(compositeYear) {
    if (!compositeYear) {
        return "/composites";
    }

    return `/composites?year=${encodeURIComponent(compositeYear)}`;
}

function buildScrapbookMeta(scrapbook) {
    const year = String(scrapbook.scrapbookYear || "").trim();
    const pageCount = Number(scrapbook.pageCount || scrapbook.pageImageUrls?.length || 0);
    const pageLabel = pageCount > 0 ? `${pageCount} page${pageCount === 1 ? "" : "s"}` : "";

    if (year && pageLabel) {
        return `${pageLabel} | Class year ${year}`;
    }

    if (pageLabel) {
        return pageLabel;
    }

    if (year) {
        return `Class year ${year}`;
    }

    return "Scrapbook volume";
}

function buildScrapbookPageLabel({ year, pageNumber, title }) {
    const normalizedTitle = String(title || "").trim();
    const baseTitle = normalizedTitle || (year ? `${year} Scrapbook` : "Scrapbook");

    return pageNumber ? `${baseTitle} Page ${pageNumber}` : `${baseTitle} Page`;
}

function buildUploadedScrapbookPageMeta({ year, pageNumber }) {
    const noteParts = [
        year ? `${year} Scrapbook` : "Scrapbook page",
        pageNumber ? `Page ${pageNumber}` : "",
    ].filter(Boolean);

    return noteParts.join(" | ");
}

function buildTaggedScrapbookMeta(row) {
    const noteParts = [
        row.year ? `${row.year} Scrapbook` : "Scrapbook page",
        row.pageNumber ? `Page ${row.pageNumber}` : "",
        row.category || "",
    ].filter(Boolean);

    return noteParts.join(" | ");
}

function buildScrapbookLink(scrapbookYear, pageIndex, pageNumber) {
    if (!scrapbookYear) {
        return "/scrapbooks";
    }

    const searchParams = new URLSearchParams({ year: String(scrapbookYear) });
    const normalizedPageIndex = Number(pageIndex);
    const normalizedPageNumber = Number(pageNumber);

    if (Number.isInteger(normalizedPageIndex) && normalizedPageIndex >= 0) {
        searchParams.set("page", String(normalizedPageIndex + 1));
    } else if (Number.isInteger(normalizedPageNumber) && normalizedPageNumber > 0) {
        searchParams.set("page", String(normalizedPageNumber));
    }

    return `/scrapbooks?${searchParams.toString()}`;
}

function buildClubHistoryLink(historyKey) {
    if (!historyKey) {
        return "/written-history";
    }

    return `/written-history?history=${encodeURIComponent(historyKey)}`;
}

function buildOralHistoryLink(interviewee, episodeId = "") {
    const searchParams = new URLSearchParams();
    const normalizedInterviewee = normalizeSearchText(interviewee);
    const normalizedEpisodeId = normalizeSearchText(episodeId);

    if (normalizedInterviewee) {
        searchParams.set("interviewee", normalizedInterviewee);
    }

    if (normalizedEpisodeId) {
        searchParams.set("episode", normalizedEpisodeId);
    }

    const serializedParams = searchParams.toString();
    return serializedParams ? `/oral-histories?${serializedParams}` : "/oral-histories";
}

function buildClubHistoryMeta(years) {
    const yearLabel = years.length > 0 ? ` | ${years.join(", ")}` : "";
    return `Club History Document${yearLabel}`;
}

function buildOralHistoryMeta(episodes) {
    const episodeCount = episodes.length;
    const fullInterviewCount = episodes.filter((episode) => episode.isFullLength).length;
    const numberedEpisodeCount = episodeCount - fullInterviewCount;
    const parts = [];

    if (fullInterviewCount > 0) {
        parts.push(`${fullInterviewCount} full interview${fullInterviewCount === 1 ? "" : "s"}`);
    }

    if (numberedEpisodeCount > 0) {
        parts.push(`${numberedEpisodeCount} episode${numberedEpisodeCount === 1 ? "" : "s"}`);
    }

    return parts.length > 0 ? parts.join(" | ") : "Oral History Interview";
}

function normalizeOralHistorySearchEpisode(episode) {
    const isFullLength = Boolean(episode?.isFullLength);

    return {
        oralHistoryId: normalizeSearchText(episode?.oralHistoryId),
        key: normalizeSearchText(episode?.key),
        title: normalizeSearchText(episode?.title),
        interviewee: normalizeSearchText(episode?.interviewee),
        category: normalizeSearchText(episode?.category),
        isFullLength,
        episodeNumber: isFullLength ? null : normalizePositiveInteger(episode?.episodeNumber),
    };
}

function formatOralHistoryEpisodeLabel(episode) {
    return episode?.isFullLength ? "Full Interview" : `Episode ${episode?.episodeNumber || ""}`.trim();
}

function formatOralHistoryEpisodeTitle(title) {
    const normalizedTitle = normalizeSearchText(title);

    if (!normalizedTitle) {
        return "";
    }

    return normalizedTitle.replace(/^episode\s+\d+\s*(?:-|:|\u2013|\u2014)\s*/i, "").trim();
}

function extractAssociatedYears(values) {
    const detectedYears = new Set();

    (Array.isArray(values) ? values : []).forEach((value) => {
        const matches = String(value || "").match(/\b(19|20)\d{2}\b/g) || [];
        matches.forEach((match) => detectedYears.add(match));
    });

    return Array.from(detectedYears).sort((leftYear, rightYear) => Number(leftYear) - Number(rightYear));
}

function extractPageNumber(identifier) {
    const pageMatch = String(identifier || "").match(/-p(\d+)/i);
    return pageMatch ? Number(pageMatch[1]) : null;
}

function normalizeSearchText(value) {
    return String(value || "").trim();
}

function normalizeSearchKey(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function normalizePositiveInteger(value) {
    const normalizedValue = Number(value);

    return Number.isInteger(normalizedValue) && normalizedValue > 0 ? normalizedValue : null;
}

function normalizeZeroBasedInteger(value) {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    const normalizedValue = Number(value);

    return Number.isInteger(normalizedValue) && normalizedValue >= 0 ? normalizedValue : null;
}

module.exports = {
    clearSearchIndexCache,
    getSearchIndex,
};
