const crypto = require("crypto");
const path = require("path");

const { readOcrWords } = require("./windowsOcr");

const MIN_CAPTION_HEIGHT = 10;
const MAX_CAPTION_HEIGHT = 22;
const ROW_JOIN_TOLERANCE = 18;
const SEGMENT_GAP_MIN = 28;
const SAME_YEAR_MATCH_BONUS = 0.035;
const STRONG_MATCH_THRESHOLD = 0.78;
const PROFILE_SUGGESTION_THRESHOLD = 0.86;
const ROW_SPACING_TO_PORTRAIT_HEIGHT = 0.82;
const PORTRAIT_HEIGHT_TO_WIDTH = 1.27;
const GAP_TO_PORTRAIT_WIDTH = 0.94;
const MIN_PORTRAIT_WIDTH = 96;
const MIN_PORTRAIT_HEIGHT = 128;

async function detectCompositeAnnotations({
    composite,
    profiles,
    existingAnnotations = [],
}) {
    const imagePath = path.join(__dirname, "..", composite.storedFilePath);
    const ocrWords = await readOcrWords(imagePath);

    const preparedWords = prepareOcrWords(ocrWords);
    const wordRows = groupWordsIntoRows(preparedWords);
    const profileEntries = buildProfileEntries(profiles, composite.compositeYear);
    const evaluatedSegments = wordRows
        .flatMap((row, rowIndex) => splitRowIntoSegments(row.words, rowIndex))
        .map((segment) => evaluateSegment(segment, profileEntries));

    const keptSegments = selectCaptionSegments(evaluatedSegments);
    const existingManualAnnotations = normalizeExistingAnnotations(existingAnnotations)
        .filter((annotation) => annotation.source !== "auto");
    const portraitSizing = inferPortraitSizing(keptSegments, existingManualAnnotations);
    const detectedAnnotations = buildDetectedAnnotations(
        keptSegments,
        portraitSizing,
        composite,
        existingManualAnnotations,
    );

    dedupeSuggestedProfileMatches(detectedAnnotations);

    return {
        detectedAnnotations,
        detectedCount: detectedAnnotations.length,
        reviewCount: detectedAnnotations.filter((annotation) => annotation.needsReview).length,
        generatedAt: new Date().toISOString(),
    };
}

function prepareOcrWords(words) {
    return (Array.isArray(words) ? words : [])
        .map((word) => ({
            lineIndex: Number(word.lineIndex) || 0,
            text: cleanDisplayText(word.text),
            x: Math.round(Number(word.x) || 0),
            y: Math.round(Number(word.y) || 0),
            width: Math.round(Number(word.width) || 0),
            height: Math.round(Number(word.height) || 0),
        }))
        .filter((word) => (
            word.text
            && word.width > 0
            && word.height > 0
            && word.height <= 90
        ))
        .map((word) => ({
            ...word,
            right: word.x + word.width,
            bottom: word.y + word.height,
            centerX: word.x + (word.width / 2),
            centerY: word.y + (word.height / 2),
        }))
        .sort((leftWord, rightWord) => (
            leftWord.centerY - rightWord.centerY
            || leftWord.x - rightWord.x
        ));
}

function groupWordsIntoRows(words) {
    const rows = [];

    for (const word of words) {
        const previousRow = rows[rows.length - 1];

        if (previousRow && canWordJoinRow(word, previousRow)) {
            previousRow.words.push(word);
            previousRow.top = Math.min(previousRow.top, word.y);
            previousRow.bottom = Math.max(previousRow.bottom, word.bottom);
            previousRow.centerY = average(previousRow.words.map((rowWord) => rowWord.centerY));
            previousRow.averageHeight = average(previousRow.words.map((rowWord) => rowWord.height));
            continue;
        }

        rows.push({
            top: word.y,
            bottom: word.bottom,
            centerY: word.centerY,
            averageHeight: word.height,
            words: [word],
        });
    }

    return rows.map((row) => ({
        ...row,
        words: [...row.words].sort((leftWord, rightWord) => leftWord.x - rightWord.x),
    }));
}

function canWordJoinRow(word, row) {
    return Math.abs(word.centerY - row.centerY) <= Math.max(
        ROW_JOIN_TOLERANCE,
        Math.min(row.averageHeight, word.height),
    );
}

function splitRowIntoSegments(words, rowIndex) {
    if (!Array.isArray(words) || words.length === 0) {
        return [];
    }

    const segments = [];
    let currentWords = [words[0]];

    for (let index = 1; index < words.length; index += 1) {
        const previousWord = currentWords[currentWords.length - 1];
        const nextWord = words[index];
        const gap = nextWord.x - previousWord.right;
        const splitThreshold = Math.max(
            SEGMENT_GAP_MIN,
            Math.round(Math.max(previousWord.height, nextWord.height) * 2.15),
        );

        if (gap > splitThreshold) {
            segments.push(toSegment(currentWords, rowIndex));
            currentWords = [nextWord];
            continue;
        }

        currentWords.push(nextWord);
    }

    if (currentWords.length > 0) {
        segments.push(toSegment(currentWords, rowIndex));
    }

    return segments;
}

function toSegment(words, rowIndex) {
    const left = Math.min(...words.map((word) => word.x));
    const top = Math.min(...words.map((word) => word.y));
    const right = Math.max(...words.map((word) => word.right));
    const bottom = Math.max(...words.map((word) => word.bottom));

    return {
        rowIndex,
        words,
        text: words.map((word) => word.text).join(" ").trim(),
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
        centerX: left + ((right - left) / 2),
        centerY: top + ((bottom - top) / 2),
    };
}

function evaluateSegment(segment, profileEntries) {
    const normalizedText = normalizeForMatch(segment.text);
    const normalizedTokens = tokenizeNormalizedText(normalizedText);
    const bestProfileMatch = findBestProfileMatch(normalizedText, normalizedTokens, profileEntries);
    const nameLike = looksLikeCaptionName(segment, normalizedTokens);
    const detectedName = formatDetectedName(segment.text);

    return {
        ...segment,
        normalizedText,
        normalizedTokens,
        detectedName,
        matchedProfileDisplayName: bestProfileMatch.displayName || null,
        matchedProfileId: bestProfileMatch.score >= PROFILE_SUGGESTION_THRESHOLD
            ? bestProfileMatch.profileId
            : null,
        matchConfidence: roundConfidence(bestProfileMatch.score),
        nameLike,
        strongMatch: bestProfileMatch.score >= STRONG_MATCH_THRESHOLD,
    };
}

function buildProfileEntries(profiles, compositeYear) {
    const targetYear = normalizeYear(compositeYear);

    return (Array.isArray(profiles) ? profiles : []).map((profile) => {
        const variants = new Set();
        const firstName = cleanDisplayText(profile.firstName);
        const lastName = cleanDisplayText(profile.lastName);
        const preferredName = cleanDisplayText(profile.preferredName);
        const displayName = cleanDisplayText(profile.displayName);

        [displayName, [firstName, lastName].filter(Boolean).join(" "), [preferredName, lastName].filter(Boolean).join(" ")]
            .filter(Boolean)
            .forEach((variant) => variants.add(normalizeForMatch(variant)));

        return {
            profileId: String(profile.id),
            displayName: profile.displayName || [profile.firstName, profile.lastName].filter(Boolean).join(" "),
            isSameYear: targetYear !== null && normalizeYear(profile.graduationYear) === targetYear,
            variants: Array.from(variants).filter(Boolean),
        };
    }).filter((entry) => entry.variants.length > 0);
}

function findBestProfileMatch(normalizedText, normalizedTokens, profileEntries) {
    let bestMatch = {
        profileId: null,
        displayName: "",
        score: 0,
    };

    if (!normalizedText || normalizedTokens.length < 2) {
        return bestMatch;
    }

    for (const profileEntry of profileEntries) {
        for (const variant of profileEntry.variants) {
            const baseScore = scoreNormalizedNames(normalizedText, normalizedTokens, variant);
            const adjustedScore = clamp(
                baseScore + (profileEntry.isSameYear ? SAME_YEAR_MATCH_BONUS : 0),
                0,
                1,
            );

            if (adjustedScore <= bestMatch.score) {
                continue;
            }

            bestMatch = {
                profileId: profileEntry.profileId,
                displayName: profileEntry.displayName,
                score: adjustedScore,
            };
        }
    }

    return bestMatch;
}

function scoreNormalizedNames(leftText, leftTokens, rightText) {
    if (!leftText || !rightText) {
        return 0;
    }

    if (leftText === rightText) {
        return 1;
    }

    const rightTokens = tokenizeNormalizedText(rightText);
    const leftCompact = leftText.replace(/\s+/g, "");
    const rightCompact = rightText.replace(/\s+/g, "");
    const maxLength = Math.max(leftCompact.length, rightCompact.length) || 1;
    const editScore = 1 - (levenshteinDistance(leftCompact, rightCompact) / maxLength);
    const tokenScore = multisetDiceCoefficient(leftTokens, rightTokens);
    const bigramScore = diceCoefficient(leftCompact, rightCompact);
    const lastTokenMatches = leftTokens[leftTokens.length - 1] && leftTokens[leftTokens.length - 1] === rightTokens[rightTokens.length - 1];
    const firstTokenMatches = leftTokens[0] && leftTokens[0] === rightTokens[0];
    const lengthPenalty = Math.min(0.12, Math.abs(leftTokens.length - rightTokens.length) * 0.04);

    return clamp(
        (editScore * 0.45)
        + (tokenScore * 0.35)
        + (bigramScore * 0.20)
        + (lastTokenMatches ? 0.08 : 0)
        + (firstTokenMatches ? 0.04 : 0)
        - lengthPenalty,
        0,
        1,
    );
}

function selectCaptionSegments(segments) {
    const rowStats = new Map();

    for (const segment of segments) {
        const currentStats = rowStats.get(segment.rowIndex) || {
            strongCount: 0,
            plausibleCount: 0,
        };

        if (segment.strongMatch) {
            currentStats.strongCount += 1;
        }

        if (segment.nameLike) {
            currentStats.plausibleCount += 1;
        }

        rowStats.set(segment.rowIndex, currentStats);
    }

    return segments
        .filter((segment) => {
            const row = rowStats.get(segment.rowIndex);

            if (!row) {
                return false;
            }

            const rowLooksLikeCaptionBand = row.strongCount >= 3 || (row.strongCount >= 2 && row.plausibleCount >= 4);
            const keepSegment = (
                segment.strongMatch
                || (rowLooksLikeCaptionBand && segment.nameLike && segment.matchConfidence >= 0.56)
            );

            return rowLooksLikeCaptionBand && keepSegment;
        })
        .sort((leftSegment, rightSegment) => (
            leftSegment.y - rightSegment.y
            || leftSegment.x - rightSegment.x
        ));
}

function looksLikeCaptionName(segment, normalizedTokens) {
    if (segment.height < MIN_CAPTION_HEIGHT || segment.height > MAX_CAPTION_HEIGHT) {
        return false;
    }

    if (segment.width < 48 || segment.width > 300) {
        return false;
    }

    if (normalizedTokens.length < 2 || normalizedTokens.length > 4) {
        return false;
    }

    if (normalizedTokens.some((token) => /\d/.test(token) || token.length > 18)) {
        return false;
    }

    return /^[A-Z .'-]+$/i.test(segment.text);
}

function inferPortraitSizing(segments, existingAnnotations) {
    const trustedAnnotations = existingAnnotations.length > 0 ? existingAnnotations : [];
    const existingWidths = trustedAnnotations.map((annotation) => annotation.width).filter((width) => width >= 16);
    const existingHeights = trustedAnnotations.map((annotation) => annotation.height).filter((height) => height >= 16);
    const rowTops = Array.from(new Set(segments.map((segment) => segment.y))).sort((leftValue, rightValue) => leftValue - rightValue);
    const rowSpacings = [];

    for (let index = 1; index < rowTops.length; index += 1) {
        const difference = rowTops[index] - rowTops[index - 1];

        if (difference >= 120) {
            rowSpacings.push(difference);
        }
    }

    const inferredHeightFromRows = rowSpacings.length > 0
        ? Math.round(median(rowSpacings) * ROW_SPACING_TO_PORTRAIT_HEIGHT)
        : null;
    const portraitHeight = Math.max(
        MIN_PORTRAIT_HEIGHT,
        Math.round(median(existingHeights) || inferredHeightFromRows || 300),
    );
    const inferredWidth = Math.round(portraitHeight / PORTRAIT_HEIGHT_TO_WIDTH);
    const portraitWidth = Math.max(
        MIN_PORTRAIT_WIDTH,
        Math.round(median(existingWidths) || inferredWidth || 235),
    );

    return {
        portraitWidth,
        portraitHeight,
    };
}

function buildDetectedAnnotations(segments, sizing, composite, reservedAnnotations) {
    const rowGroups = new Map();

    for (const segment of segments) {
        const currentRow = rowGroups.get(segment.rowIndex) || [];
        currentRow.push(segment);
        rowGroups.set(segment.rowIndex, currentRow);
    }

    const detectedAnnotations = [];

    for (const rowSegments of rowGroups.values()) {
        const orderedSegments = [...rowSegments].sort((leftSegment, rightSegment) => leftSegment.centerX - rightSegment.centerX);

        orderedSegments.forEach((segment, index) => {
            const previousSegment = orderedSegments[index - 1] || null;
            const nextSegment = orderedSegments[index + 1] || null;
            const maxWidthFromNeighbors = [
                previousSegment ? Math.round(segment.centerX - previousSegment.centerX - 10) : null,
                nextSegment ? Math.round(nextSegment.centerX - segment.centerX - 10) : null,
            ]
                .filter((value) => Number.isFinite(value) && value > 0);

            const portraitWidth = clamp(
                Math.min(
                    sizing.portraitWidth,
                    ...(maxWidthFromNeighbors.length > 0 ? maxWidthFromNeighbors : [sizing.portraitWidth]),
                ),
                MIN_PORTRAIT_WIDTH,
                composite.imageWidth,
            );
            const portraitHeight = clamp(sizing.portraitHeight, MIN_PORTRAIT_HEIGHT, composite.imageHeight);
            const captionGap = Math.max(8, Math.round(segment.height * 0.65));
            const x = clamp(
                Math.round(segment.centerX - (portraitWidth / 2)),
                0,
                composite.imageWidth - portraitWidth,
            );
            const y = clamp(
                Math.round(segment.y - captionGap - portraitHeight),
                0,
                composite.imageHeight - portraitHeight,
            );
            const nextAnnotation = {
                annotationId: `auto-${crypto.randomUUID()}`,
                compositeId: composite.compositeId,
                profileId: null,
                source: "auto",
                detectedName: segment.detectedName || null,
                matchedProfileId: segment.matchedProfileId,
                matchConfidence: segment.matchConfidence || null,
                needsReview: (
                    !segment.matchedProfileId
                    || segment.matchConfidence < 0.94
                    || normalizeForMatch(segment.detectedName) !== normalizeForMatch(segment.matchedProfileDisplayName)
                ),
                captionBox: {
                    x: Math.round(segment.x),
                    y: Math.round(segment.y),
                    width: Math.round(segment.width),
                    height: Math.round(segment.height),
                },
                x,
                y,
                width: portraitWidth,
                height: portraitHeight,
            };

            if (overlapsReservedAnnotation(nextAnnotation, reservedAnnotations)) {
                return;
            }

            if (overlapsReservedAnnotation(nextAnnotation, detectedAnnotations)) {
                return;
            }

            detectedAnnotations.push(nextAnnotation);
        });
    }

    return detectedAnnotations;
}

function dedupeSuggestedProfileMatches(annotations) {
    const bestAnnotationByProfileId = new Map();

    for (const annotation of annotations) {
        if (!annotation.matchedProfileId) {
            continue;
        }

        const previousBest = bestAnnotationByProfileId.get(annotation.matchedProfileId);

        if (!previousBest || (annotation.matchConfidence || 0) > (previousBest.matchConfidence || 0)) {
            bestAnnotationByProfileId.set(annotation.matchedProfileId, annotation);
        }
    }

    for (const annotation of annotations) {
        if (!annotation.matchedProfileId) {
            continue;
        }

        if (bestAnnotationByProfileId.get(annotation.matchedProfileId) === annotation) {
            continue;
        }

        annotation.matchedProfileId = null;
        annotation.needsReview = true;
    }
}

function normalizeExistingAnnotations(annotations) {
    return (Array.isArray(annotations) ? annotations : [])
        .map((annotation) => ({
            source: annotation.source === "auto" ? "auto" : "manual",
            x: Math.round(Number(annotation.x) || 0),
            y: Math.round(Number(annotation.y) || 0),
            width: Math.round(Number(annotation.width) || 0),
            height: Math.round(Number(annotation.height) || 0),
        }))
        .filter((annotation) => annotation.width >= 16 && annotation.height >= 16);
}

function overlapsReservedAnnotation(candidate, annotations) {
    return annotations.some((annotation) => overlapRatio(candidate, annotation) >= 0.38);
}

function overlapRatio(leftBox, rightBox) {
    const overlapWidth = Math.max(
        0,
        Math.min(leftBox.x + leftBox.width, rightBox.x + rightBox.width) - Math.max(leftBox.x, rightBox.x),
    );
    const overlapHeight = Math.max(
        0,
        Math.min(leftBox.y + leftBox.height, rightBox.y + rightBox.height) - Math.max(leftBox.y, rightBox.y),
    );
    const overlapArea = overlapWidth * overlapHeight;

    if (overlapArea === 0) {
        return 0;
    }

    const leftArea = leftBox.width * leftBox.height;
    const rightArea = rightBox.width * rightBox.height;

    return overlapArea / Math.min(leftArea, rightArea);
}

function cleanDisplayText(text) {
    return String(text || "")
        .replace(/[“”]/g, "\"")
        .replace(/[‘’]/g, "'")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeForMatch(text) {
    return cleanDisplayText(text)
        .toUpperCase()
        .replace(/\b1LL\b/g, "III")
        .replace(/\bILL\b/g, "III")
        .replace(/\b111\b/g, "III")
        .replace(/\bDR\./g, "DR")
        .replace(/[^A-Z0-9.' -]+/g, " ")
        .replace(/\b(DR|MR|MRS|MS)\b/g, " ")
        .replace(/[.']/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function tokenizeNormalizedText(text) {
    return String(text || "")
        .split(" ")
        .map((token) => token.trim())
        .filter(Boolean);
}

function formatDetectedName(text) {
    const normalizedText = normalizeForMatch(text);
    const tokens = tokenizeNormalizedText(normalizedText);

    return tokens.map((token) => {
        if (/^(II|III|IV|V|JR|SR)$/.test(token)) {
            return token;
        }

        return token
            .split("-")
            .map((part) => (
                part
                    ? `${part.charAt(0)}${part.slice(1).toLowerCase()}`
                    : part
            ))
            .join("-");
    }).join(" ");
}

function roundConfidence(value) {
    return Number.isFinite(value) ? Number(value.toFixed(3)) : null;
}

function average(values) {
    if (!Array.isArray(values) || values.length === 0) {
        return 0;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
    const preparedValues = (Array.isArray(values) ? values : [])
        .filter((value) => Number.isFinite(value))
        .sort((leftValue, rightValue) => leftValue - rightValue);

    if (preparedValues.length === 0) {
        return null;
    }

    const middleIndex = Math.floor(preparedValues.length / 2);

    if (preparedValues.length % 2 === 1) {
        return preparedValues[middleIndex];
    }

    return (preparedValues[middleIndex - 1] + preparedValues[middleIndex]) / 2;
}

function multisetDiceCoefficient(leftTokens, rightTokens) {
    if (leftTokens.length === 0 || rightTokens.length === 0) {
        return 0;
    }

    const rightCounts = new Map();
    let matches = 0;

    for (const token of rightTokens) {
        rightCounts.set(token, (rightCounts.get(token) || 0) + 1);
    }

    for (const token of leftTokens) {
        const remainingCount = rightCounts.get(token) || 0;

        if (remainingCount <= 0) {
            continue;
        }

        matches += 1;
        rightCounts.set(token, remainingCount - 1);
    }

    return (2 * matches) / (leftTokens.length + rightTokens.length);
}

function diceCoefficient(leftText, rightText) {
    if (!leftText || !rightText) {
        return 0;
    }

    if (leftText === rightText) {
        return 1;
    }

    const leftBigrams = buildBigrams(leftText);
    const rightBigrams = buildBigrams(rightText);

    if (leftBigrams.length === 0 || rightBigrams.length === 0) {
        return 0;
    }

    return multisetDiceCoefficient(leftBigrams, rightBigrams);
}

function buildBigrams(text) {
    const compactText = String(text || "").trim();

    if (compactText.length < 2) {
        return [];
    }

    const bigrams = [];

    for (let index = 0; index < compactText.length - 1; index += 1) {
        bigrams.push(compactText.slice(index, index + 2));
    }

    return bigrams;
}

function levenshteinDistance(leftText, rightText) {
    const leftLength = leftText.length;
    const rightLength = rightText.length;

    if (leftLength === 0) {
        return rightLength;
    }

    if (rightLength === 0) {
        return leftLength;
    }

    const previousRow = Array.from({ length: rightLength + 1 }, (_, index) => index);
    const nextRow = new Array(rightLength + 1);

    for (let leftIndex = 1; leftIndex <= leftLength; leftIndex += 1) {
        nextRow[0] = leftIndex;

        for (let rightIndex = 1; rightIndex <= rightLength; rightIndex += 1) {
            const substitutionCost = leftText[leftIndex - 1] === rightText[rightIndex - 1] ? 0 : 1;

            nextRow[rightIndex] = Math.min(
                nextRow[rightIndex - 1] + 1,
                previousRow[rightIndex] + 1,
                previousRow[rightIndex - 1] + substitutionCost,
            );
        }

        for (let rightIndex = 0; rightIndex <= rightLength; rightIndex += 1) {
            previousRow[rightIndex] = nextRow[rightIndex];
        }
    }

    return previousRow[rightLength];
}

function normalizeYear(value) {
    const normalizedValue = String(value || "").trim();

    if (!/^\d{4}$/.test(normalizedValue)) {
        return null;
    }

    return Number(normalizedValue);
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

module.exports = {
    detectCompositeAnnotations,
};
