const crypto = require("crypto");
const path = require("path");

const { readOcrWords } = require("./windowsOcr");

const MIN_CAPTION_HEIGHT = 10;
const MAX_CAPTION_HEIGHT = 22;
const ROW_JOIN_TOLERANCE = 18;
const SEGMENT_GAP_MIN = 8;
const SEGMENT_MERGE_GAP_MIN = 12;
const PARTIAL_NAME_TOKEN_MIN_LENGTH = 4;
const SAME_YEAR_MATCH_BONUS = 0.035;
const STRONG_MATCH_THRESHOLD = 0.78;
const PROFILE_SUGGESTION_THRESHOLD = 0.86;
const PARTIAL_PROFILE_SUGGESTION_THRESHOLD = 0.92;
const PARTIAL_PROFILE_MARGIN = 0.08;
const MIN_PORTRAIT_WIDTH = 96;
const MIN_PORTRAIT_HEIGHT = 128;
const NON_NAME_TOKENS = new Set([
    "AND",
    "BOARD",
    "CLUB",
    "COMMITTEE",
    "EXECUTIVE",
    "FELLOWSHIP",
    "FELLOWSHIP",
    "FOUNDED",
    "FOR",
    "GERMAN",
    "LEADERSHIP",
    "OF",
    "PRESIDENT",
    "SECRETARY",
    "SERVICE",
    "STATE",
    "TREASURER",
    "UNIVERSITY",
    "VICE",
    "VIRGINIA",
    "VIRGINIAN",
    "VIRGINIANPOLYTECHNIC",
    "VIRGINIAPOLYTECHNIC",
    "POLYTECHNIC",
    "INSTITUTE",
]);

async function detectCompositeTextBoxes({ composite, profiles }) {
    const imagePath = path.join(__dirname, "..", composite.storedFilePath);
    const ocrWords = await readOcrWords(imagePath);
    const preparedWords = prepareOcrWords(ocrWords);
    const wordRows = groupWordsIntoRows(preparedWords);
    const profileEntries = buildProfileEntries(profiles, composite.compositeYear);
    const mergedSegments = wordRows
        .flatMap((row, rowIndex) => mergeRowSegments(
            splitRowIntoSegments(row.words, rowIndex),
            profileEntries,
        ))
        .map((segment) => evaluateSegment(segment, profileEntries));
    const textBoxes = buildVisibleTextBoxes(mergedSegments);

    return {
        textBoxes,
        generatedAt: new Date().toISOString(),
    };
}

async function detectCompositeAnnotations({
    composite,
    profiles,
    existingAnnotations = [],
    referenceAnnotation,
}) {
    if (!referenceAnnotation) {
        const error = new Error("Draw and select a reference portrait box before running auto-fill.");
        error.statusCode = 400;
        throw error;
    }

    const { textBoxes, generatedAt } = await detectCompositeTextBoxes({
        composite,
        profiles,
    });
    const normalizedReferenceAnnotation = normalizeReferenceAnnotation(referenceAnnotation, composite);

    if (!normalizedReferenceAnnotation) {
        const error = new Error("The selected reference box is not valid.");
        error.statusCode = 400;
        throw error;
    }

    const anchorCandidates = textBoxes.filter((textBox) => textBox.isAnchorCandidate);
    const placementCandidates = textBoxes.filter((textBox) => textBox.isPlacementCandidate);
    const anchorTextBox = findReferenceAnchorTextBox(normalizedReferenceAnnotation, anchorCandidates)
        || findReferenceAnchorTextBox(normalizedReferenceAnnotation, placementCandidates);

    if (!anchorTextBox) {
        const error = new Error("No OCR name box could be matched under the selected reference portrait.");
        error.statusCode = 400;
        throw error;
    }

    const reservedAnnotations = normalizeExistingAnnotations(existingAnnotations);
    const detectedAnnotations = buildReferenceBasedAnnotations({
        textBoxes: placementCandidates,
        anchorTextBox,
        referenceAnnotation: normalizedReferenceAnnotation,
        composite,
        reservedAnnotations,
    });

    dedupeSuggestedProfileMatches(detectedAnnotations);

    return {
        textBoxes,
        referenceTextBoxId: anchorTextBox.textBoxId,
        detectedAnnotations,
        detectedCount: detectedAnnotations.length,
        reviewCount: detectedAnnotations.filter((annotation) => annotation.needsReview).length,
        generatedAt,
    };
}

function prepareOcrWords(words) {
    return dedupeOcrWords((Array.isArray(words) ? words : [])
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
    ).sort((leftWord, rightWord) => (
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
            Math.round(Math.max(previousWord.height, nextWord.height) * 1.1),
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

function mergeRowSegments(segments, profileEntries) {
    if (!Array.isArray(segments) || segments.length <= 1) {
        return Array.isArray(segments) ? segments : [];
    }

    const mergedSegments = [];
    let segmentIndex = 0;

    while (segmentIndex < segments.length) {
        let bestSegment = segments[segmentIndex];
        let bestSegmentEndIndex = segmentIndex;

        for (
            let candidateEndIndex = segmentIndex + 1;
            candidateEndIndex < Math.min(segments.length, segmentIndex + 3);
            candidateEndIndex += 1
        ) {
            const segmentGroup = segments.slice(segmentIndex, candidateEndIndex + 1);

            if (!canMergeSegmentGroup(segmentGroup)) {
                break;
            }

            const candidateSegment = mergeSegmentGroup(segmentGroup);
            const candidateEvaluation = evaluateSegment(candidateSegment, profileEntries);
            const segmentEvaluations = segmentGroup.map((segment) => evaluateSegment(segment, profileEntries));

            if (!shouldUseMergedSegment(segmentEvaluations, candidateEvaluation)) {
                continue;
            }

            bestSegment = candidateSegment;
            bestSegmentEndIndex = candidateEndIndex;
        }

        mergedSegments.push(bestSegment);
        segmentIndex = bestSegmentEndIndex + 1;
    }

    return mergedSegments;
}

function canMergeSegmentGroup(segments) {
    if (!Array.isArray(segments) || segments.length < 2 || segments.length > 3) {
        return false;
    }

    const mergedSegment = mergeSegmentGroup(segments);
    const mergeGapThreshold = Math.max(
        SEGMENT_MERGE_GAP_MIN,
        Math.round(Math.max(...segments.map((segment) => segment.height)) * 2.35),
    );

    if (mergedSegment.width > 220 || mergedSegment.height > 34) {
        return false;
    }

    for (let index = 1; index < segments.length; index += 1) {
        const previousSegment = segments[index - 1];
        const nextSegment = segments[index];
        const gap = nextSegment.x - (previousSegment.x + previousSegment.width);

        if (gap > mergeGapThreshold) {
            return false;
        }
    }

    return true;
}

function mergeSegmentGroup(segments) {
    return toSegment(
        segments.flatMap((segment) => segment.words),
        segments[0]?.rowIndex ?? 0,
    );
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
    const detectedName = formatDetectedName(segment.text);
    const hasReliableProfileSuggestion = hasReliableProfileSuggestionForTokens(
        normalizedTokens,
        bestProfileMatch,
    );

    return {
        ...segment,
        normalizedText,
        normalizedTokens,
        detectedName,
        matchedProfileDisplayName: bestProfileMatch.displayName || null,
        matchedProfileId: hasReliableProfileSuggestion
            ? bestProfileMatch.profileId
            : null,
        matchConfidence: roundConfidence(bestProfileMatch.score),
        nameLike: looksLikeCaptionName(segment, normalizedTokens),
        partialNameLike: looksLikePartialCaptionName(segment, normalizedTokens),
        strongMatch: normalizedTokens.length >= 2 && bestProfileMatch.score >= STRONG_MATCH_THRESHOLD,
        hasReliableProfileSuggestion,
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
        runnerUpScore: 0,
    };

    if (!normalizedText || normalizedTokens.length === 0) {
        return bestMatch;
    }

    for (const profileEntry of profileEntries) {
        for (const variant of profileEntry.variants) {
            const baseScore = normalizedTokens.length >= 2
                ? scoreNormalizedNames(normalizedText, normalizedTokens, variant)
                : scorePartialNameTokenMatch(normalizedTokens[0], variant);
            const adjustedScore = clamp(
                baseScore + (profileEntry.isSameYear ? SAME_YEAR_MATCH_BONUS : 0),
                0,
                1,
            );

            if (adjustedScore <= bestMatch.score) {
                if (adjustedScore > bestMatch.runnerUpScore) {
                    bestMatch.runnerUpScore = adjustedScore;
                }
                continue;
            }

            bestMatch = {
                profileId: profileEntry.profileId,
                displayName: profileEntry.displayName,
                score: adjustedScore,
                runnerUpScore: bestMatch.score,
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

function buildVisibleTextBoxes(segments) {
    const rowStats = new Map();

    for (const segment of segments) {
        const currentStats = rowStats.get(segment.rowIndex) || {
            strongCount: 0,
            plausibleCount: 0,
        };

        if (segment.strongMatch) {
            currentStats.strongCount += 1;
        }

        if (segment.nameLike || segment.partialNameLike || segment.hasReliableProfileSuggestion) {
            currentStats.plausibleCount += 1;
        }

        rowStats.set(segment.rowIndex, currentStats);
    }

    return segments
        .filter((segment) => (
            segment.text
            && segment.width >= 16
            && segment.width <= 900
            && segment.height >= 8
            && segment.height <= 60
        ))
        .sort((leftSegment, rightSegment) => (
            leftSegment.y - rightSegment.y
            || leftSegment.x - rightSegment.x
        ))
        .map((segment, index) => {
            const row = rowStats.get(segment.rowIndex) || { strongCount: 0, plausibleCount: 0 };
            const rowLooksLikeCaptionBand = row.plausibleCount >= 3 || row.strongCount >= 1;
            const isPlacementCandidate = rowLooksLikeCaptionBand && (
                segment.nameLike
                || segment.partialNameLike
                || segment.strongMatch
                || segment.hasReliableProfileSuggestion
                || segment.matchConfidence >= 0.42
            );
            const isAnchorCandidate = rowLooksLikeCaptionBand && (
                segment.nameLike
                || segment.strongMatch
                || segment.hasReliableProfileSuggestion
                || segment.matchConfidence >= 0.56
            );

            return {
                textBoxId: `text-${segment.rowIndex}-${index}`,
                rowIndex: segment.rowIndex,
                text: segment.detectedName || null,
                rawText: segment.text,
                x: Math.round(segment.x),
                y: Math.round(segment.y),
                width: Math.round(segment.width),
                height: Math.round(segment.height),
                centerX: segment.centerX,
                centerY: segment.centerY,
                isPlacementCandidate,
                isAnchorCandidate,
                matchedProfileId: segment.matchedProfileId,
                matchedProfileDisplayName: segment.matchedProfileDisplayName,
                matchConfidence: segment.matchConfidence || null,
                needsReview: (
                    !segment.matchedProfileId
                    || segment.matchConfidence < 0.94
                    || normalizeForMatch(segment.detectedName) !== normalizeForMatch(segment.matchedProfileDisplayName)
                ),
            };
        });
}

function dedupeOcrWords(words) {
    const dedupedWords = [];
    const sortedWords = [...words].sort((leftWord, rightWord) => (
        getOcrWordQualityScore(rightWord.text) - getOcrWordQualityScore(leftWord.text)
        || rightWord.height - leftWord.height
        || rightWord.width - leftWord.width
        || leftWord.y - rightWord.y
        || leftWord.x - rightWord.x
    ));

    for (const word of sortedWords) {
        const normalizedText = normalizeForMatch(word.text);

        if (!normalizedText) {
            continue;
        }

        const alreadySeen = dedupedWords.some((existingWord) => (
            wordOverlapRatio(existingWord, word) >= 0.55
            && Math.abs(existingWord.centerX - word.centerX) <= Math.max(10, word.width * 0.4)
            && Math.abs(existingWord.centerY - word.centerY) <= Math.max(8, word.height * 0.5)
        ));

        if (alreadySeen) {
            continue;
        }

        dedupedWords.push(word);
    }

    return dedupedWords;
}

function getOcrWordQualityScore(text) {
    const normalizedText = cleanDisplayText(text);
    const letterCount = (normalizedText.match(/[A-Za-z]/g) || []).length;
    const uppercaseCount = (normalizedText.match(/[A-Z]/g) || []).length;
    const lowercaseCount = (normalizedText.match(/[a-z]/g) || []).length;
    const digitCount = (normalizedText.match(/\d/g) || []).length;
    const symbolCount = (normalizedText.match(/[^A-Za-z0-9 .'-]/g) || []).length;
    const punctuationPenalty = (normalizedText.match(/[.](?=[A-Za-z])/g) || []).length;

    return (
        (letterCount * 2)
        + digitCount
        - (symbolCount * 6)
        + (/^[A-Za-z0-9 .'-]+$/.test(normalizedText) ? 6 : 0)
        + (normalizedText.length >= 3 ? 3 : 0)
        + (lowercaseCount === 0 && uppercaseCount >= 2 ? 6 : 0)
        - (uppercaseCount > 0 && lowercaseCount > 0 ? 8 : 0)
        - (punctuationPenalty * 4)
    );
}

function wordOverlapRatio(leftWord, rightWord) {
    const overlapWidth = Math.max(
        0,
        Math.min(leftWord.right, rightWord.right) - Math.max(leftWord.x, rightWord.x),
    );
    const overlapHeight = Math.max(
        0,
        Math.min(leftWord.bottom, rightWord.bottom) - Math.max(leftWord.y, rightWord.y),
    );
    const overlapArea = overlapWidth * overlapHeight;

    if (overlapArea === 0) {
        return 0;
    }

    const leftArea = leftWord.width * leftWord.height;
    const rightArea = rightWord.width * rightWord.height;

    return overlapArea / Math.min(leftArea, rightArea);
}

function looksLikeCaptionName(segment, normalizedTokens) {
    if (segment.height < MIN_CAPTION_HEIGHT || segment.height > MAX_CAPTION_HEIGHT) {
        return false;
    }

    if (segment.width < 48 || segment.width > 300) {
        return false;
    }

    const contentTokens = normalizedTokens.filter((token) => !/^(II|III|IV|V|JR|SR)$/.test(token));

    if (contentTokens.length < 2 || contentTokens.length > 4) {
        return false;
    }

    if (contentTokens.some((token) => /\d/.test(token) || token.length > 18 || NON_NAME_TOKENS.has(token))) {
        return false;
    }

    return contentTokens.every((token) => /^[A-Z]+(?:-[A-Z]+)*$/.test(token));
}

function looksLikePartialCaptionName(segment, normalizedTokens) {
    if (segment.height < MIN_CAPTION_HEIGHT - 3 || segment.height > MAX_CAPTION_HEIGHT + 8) {
        return false;
    }

    if (segment.width < 24 || segment.width > 180) {
        return false;
    }

    if (normalizedTokens.length !== 1) {
        return false;
    }

    const [token] = normalizedTokens;

    if (
        !token
        || token.length < PARTIAL_NAME_TOKEN_MIN_LENGTH
        || token.length > 18
        || NON_NAME_TOKENS.has(token)
        || /\d/.test(token)
    ) {
        return false;
    }

    return /^[A-Z]+(?:-[A-Z]+)*$/.test(token);
}

function normalizeReferenceAnnotation(annotation, composite) {
    const x = toFiniteNumber(annotation?.x);
    const y = toFiniteNumber(annotation?.y);
    const width = toFiniteNumber(annotation?.width);
    const height = toFiniteNumber(annotation?.height);

    if ([x, y, width, height].some((value) => value === null)) {
        return null;
    }

    const normalizedWidth = Math.round(Math.abs(width));
    const normalizedHeight = Math.round(Math.abs(height));

    if (normalizedWidth < 16 || normalizedHeight < 16) {
        return null;
    }

    const clampedWidth = clamp(normalizedWidth, MIN_PORTRAIT_WIDTH, composite.imageWidth);
    const clampedHeight = clamp(normalizedHeight, MIN_PORTRAIT_HEIGHT, composite.imageHeight);

    return {
        annotationId: annotation.annotationId || null,
        x: clamp(Math.round(x), 0, composite.imageWidth - clampedWidth),
        y: clamp(Math.round(y), 0, composite.imageHeight - clampedHeight),
        width: clampedWidth,
        height: clampedHeight,
    };
}

function findReferenceAnchorTextBox(referenceAnnotation, textBoxes) {
    const referenceCenterX = referenceAnnotation.x + (referenceAnnotation.width / 2);
    const referenceBottom = referenceAnnotation.y + referenceAnnotation.height;

    const candidates = textBoxes
        .map((textBox) => {
            const verticalGap = textBox.y - referenceBottom;
            const horizontalOverlap = Math.max(
                0,
                Math.min(referenceAnnotation.x + referenceAnnotation.width, textBox.x + textBox.width) - Math.max(referenceAnnotation.x, textBox.x),
            );
            const centerDistance = Math.abs(textBox.centerX - referenceCenterX);

            return {
                ...textBox,
                verticalGap,
                horizontalOverlap,
                centerDistance,
            };
        })
        .filter((textBox) => (
            textBox.verticalGap >= -8
            && textBox.verticalGap <= Math.max(referenceAnnotation.height * 0.8, 160)
            && (
                textBox.horizontalOverlap >= Math.max(12, textBox.width * 0.25)
                || textBox.centerDistance <= Math.max(referenceAnnotation.width * 0.75, 160)
            )
        ))
        .sort((leftCandidate, rightCandidate) => (
            leftCandidate.verticalGap - rightCandidate.verticalGap
            || leftCandidate.centerDistance - rightCandidate.centerDistance
        ));

    return candidates[0] || null;
}

function buildReferenceBasedAnnotations({
    textBoxes,
    anchorTextBox,
    referenceAnnotation,
    composite,
    reservedAnnotations,
}) {
    const referenceCenterX = referenceAnnotation.x + (referenceAnnotation.width / 2);
    const portraitWidth = clamp(referenceAnnotation.width, MIN_PORTRAIT_WIDTH, composite.imageWidth);
    const portraitHeight = clamp(referenceAnnotation.height, MIN_PORTRAIT_HEIGHT, composite.imageHeight);
    const anchorBottomOffset = referenceAnnotation.y - (anchorTextBox.y + anchorTextBox.height);
    const maxHorizontalShift = Math.max(8, Math.round(portraitWidth * 0.12));
    const rawAnchorCenterOffset = referenceCenterX - anchorTextBox.centerX;
    const anchorCenterOffset = clamp(
        Math.round(rawAnchorCenterOffset * getAnchorCenterOffsetWeight(anchorTextBox)),
        -maxHorizontalShift,
        maxHorizontalShift,
    );
    const detectedAnnotations = [];

    for (const textBox of textBoxes) {
        if (textBox.textBoxId === anchorTextBox.textBoxId) {
            continue;
        }

        const x = clamp(
            Math.round(textBox.centerX + anchorCenterOffset - (portraitWidth / 2)),
            0,
            composite.imageWidth - portraitWidth,
        );
        const y = clamp(
            Math.round(textBox.y + textBox.height + anchorBottomOffset),
            0,
            composite.imageHeight - portraitHeight,
        );
        const nextAnnotation = {
            annotationId: `auto-${crypto.randomUUID()}`,
            compositeId: composite.compositeId,
            profileId: null,
            source: "auto",
            detectedName: textBox.text || null,
            matchedProfileId: textBox.matchedProfileId,
            matchConfidence: textBox.matchConfidence || null,
            needsReview: Boolean(textBox.needsReview),
            captionBox: {
                x: Math.round(textBox.x),
                y: Math.round(textBox.y),
                width: Math.round(textBox.width),
                height: Math.round(textBox.height),
            },
            x,
            y,
            width: portraitWidth,
            height: portraitHeight,
        };

        if (overlapsReservedAnnotation(nextAnnotation, reservedAnnotations)) {
            continue;
        }

        if (overlapsReservedAnnotation(nextAnnotation, detectedAnnotations)) {
            continue;
        }

        detectedAnnotations.push(nextAnnotation);
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

function getAnchorCenterOffsetWeight(anchorTextBox) {
    if (anchorTextBox?.matchedProfileId && (anchorTextBox.matchConfidence || 0) >= 0.95) {
        return 0.65;
    }

    if (anchorTextBox?.isAnchorCandidate) {
        return 0.45;
    }

    return 0.25;
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

function hasReliableProfileSuggestionForTokens(normalizedTokens, bestProfileMatch) {
    if (!bestProfileMatch.profileId) {
        return false;
    }

    if (normalizedTokens.length >= 2) {
        return bestProfileMatch.score >= PROFILE_SUGGESTION_THRESHOLD;
    }

    return (
        normalizedTokens.length === 1
        && bestProfileMatch.score >= PARTIAL_PROFILE_SUGGESTION_THRESHOLD
        && (bestProfileMatch.score - bestProfileMatch.runnerUpScore) >= PARTIAL_PROFILE_MARGIN
    );
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

function shouldUseMergedSegment(segmentEvaluations, mergedEvaluation) {
    const mergedTokenCount = mergedEvaluation.normalizedTokens.length;

    if (mergedTokenCount < 2 || mergedTokenCount > 4 || !mergedEvaluation.nameLike) {
        return false;
    }

    const bestSingleScore = Math.max(...segmentEvaluations.map((segment) => segment.matchConfidence || 0), 0);
    const bestSingleTokenCount = Math.max(...segmentEvaluations.map((segment) => segment.normalizedTokens.length), 0);
    const hasIncompleteSegment = segmentEvaluations.some((segment) => (
        segment.normalizedTokens.length === 1
        || (!segment.nameLike && !segment.strongMatch)
    ));
    const hasStrongStandaloneCaption = segmentEvaluations.every((segment) => (
        segment.nameLike
        && segment.normalizedTokens.length >= 2
        && (segment.matchConfidence || 0) >= Math.max(mergedEvaluation.matchConfidence - 0.06, 0.84)
    ));
    const mergedImprovesConfidence = (mergedEvaluation.matchConfidence || 0) >= (bestSingleScore + 0.08);

    if (hasStrongStandaloneCaption) {
        return false;
    }

    return (
        (
            hasIncompleteSegment
            && mergedTokenCount > bestSingleTokenCount
            && (
                mergedEvaluation.strongMatch
                || mergedEvaluation.hasReliableProfileSuggestion
                || mergedImprovesConfidence
            )
        )
        || mergedEvaluation.strongMatch
        || (mergedEvaluation.matchConfidence || 0) >= (bestSingleScore + 0.14)
    );
}

function scorePartialNameTokenMatch(token, variant) {
    if (!token || token.length < PARTIAL_NAME_TOKEN_MIN_LENGTH) {
        return 0;
    }

    const variantTokens = tokenizeNormalizedText(variant);
    let bestScore = 0;

    for (const variantToken of variantTokens) {
        if (!variantToken || variantToken.length < PARTIAL_NAME_TOKEN_MIN_LENGTH) {
            continue;
        }

        if (token === variantToken) {
            bestScore = Math.max(bestScore, 0.9);
            continue;
        }

        if (variantToken.startsWith(token) || token.startsWith(variantToken)) {
            bestScore = Math.max(bestScore, 0.84);
            continue;
        }

        const maxLength = Math.max(token.length, variantToken.length) || 1;
        const editScore = 1 - (levenshteinDistance(token, variantToken) / maxLength);
        const bigramScore = diceCoefficient(token, variantToken);
        const tokenScore = clamp((editScore * 0.65) + (bigramScore * 0.35), 0, 1);

        if (tokenScore >= 0.8) {
            bestScore = Math.max(bestScore, tokenScore);
        }
    }

    return bestScore;
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

function toFiniteNumber(value) {
    const numericValue = Number(value);

    return Number.isFinite(numericValue) ? numericValue : null;
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

module.exports = {
    detectCompositeAnnotations,
    detectCompositeTextBoxes,
};
