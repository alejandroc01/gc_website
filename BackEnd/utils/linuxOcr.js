const { execFile } = require("child_process");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");

const { getImageMetadata } = require("./imageMetadata");

const configuredImageMagickExecutable = process.env.COMPOSITE_OCR_IMAGEMAGICK || "";
const tesseractExecutable = process.env.COMPOSITE_OCR_TESSERACT || "tesseract";
const targetTileLongSide = 2800;
const maxTileScaleFactor = 4.0;
const tesseractLanguage = process.env.COMPOSITE_OCR_LANGUAGE || "eng";
const defaultTesseractPageSegmentationMode = process.env.COMPOSITE_OCR_PSM || "11";
const linuxOcrCacheVersion = "linux-tesseract-v2";

async function readLinuxOcrWords(imagePath) {
    const metadata = await getImageMetadata(imagePath);
    const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "gc-ocr-"));
    const words = [];
    let currentLineIndex = 0;

    try {
        const fullImageScaleFactor = getScaleFactor(metadata.width, metadata.height);

        if (fullImageScaleFactor > 1) {
            const fullImagePath = path.join(tempDirectory, "full-image.png");

            await renderOcrImage({
                sourceImagePath: imagePath,
                outputImagePath: fullImagePath,
                sourceX: 0,
                sourceY: 0,
                sourceWidth: metadata.width,
                sourceHeight: metadata.height,
                scaleFactor: fullImageScaleFactor,
                renderMode: "normal",
            });

            const fullImageResult = await runTesseractTsv({
                imagePath: fullImagePath,
                workingDirectory: tempDirectory,
                sourceX: 0,
                sourceY: 0,
                scaleFactor: fullImageScaleFactor,
                pageSegmentationMode: defaultTesseractPageSegmentationMode,
                lineIndexStart: currentLineIndex,
            });

            words.push(...fullImageResult.words);
            currentLineIndex = fullImageResult.nextLineIndex;
        } else {
            const fullImageResult = await runTesseractTsv({
                imagePath,
                workingDirectory: tempDirectory,
                sourceX: 0,
                sourceY: 0,
                scaleFactor: 1,
                pageSegmentationMode: defaultTesseractPageSegmentationMode,
                lineIndexStart: currentLineIndex,
            });

            words.push(...fullImageResult.words);
            currentLineIndex = fullImageResult.nextLineIndex;
        }

        for (const tile of getTileSpecs(metadata.width, metadata.height)) {
            for (const tesseractPass of getTesseractPasses()) {
                const scaleFactor = getScaleFactor(tile.width, tile.height);
                const tileImagePath = path.join(
                    tempDirectory,
                    `tile-${tile.x}-${tile.y}-${tesseractPass.renderMode}-${tesseractPass.pageSegmentationMode}.png`,
                );

                await renderOcrImage({
                    sourceImagePath: imagePath,
                    outputImagePath: tileImagePath,
                    sourceX: tile.x,
                    sourceY: tile.y,
                    sourceWidth: tile.width,
                    sourceHeight: tile.height,
                    scaleFactor,
                    renderMode: tesseractPass.renderMode,
                });

                const tileResult = await runTesseractTsv({
                    imagePath: tileImagePath,
                    workingDirectory: tempDirectory,
                    sourceX: tile.x,
                    sourceY: tile.y,
                    scaleFactor,
                    pageSegmentationMode: tesseractPass.pageSegmentationMode,
                    lineIndexStart: currentLineIndex,
                });

                words.push(...tileResult.words);
                currentLineIndex = tileResult.nextLineIndex;
            }
        }

        return words;
    } finally {
        await fs.rm(tempDirectory, { recursive: true, force: true });
    }
}

async function renderOcrImage({
    sourceImagePath,
    outputImagePath,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    scaleFactor,
    renderMode,
}) {
    const targetWidth = Math.max(1, Math.round(sourceWidth * scaleFactor));
    const targetHeight = Math.max(1, Math.round(sourceHeight * scaleFactor));
    const convertArguments = [
        sourceImagePath,
        "-crop",
        `${sourceWidth}x${sourceHeight}+${sourceX}+${sourceY}`,
        "+repage",
        "-background",
        "white",
        "-alpha",
        "remove",
    ];

    if (renderMode === "threshold") {
        convertArguments.push(
            "-colorspace",
            "Gray",
            "-contrast-stretch",
            "4%x4%",
            "-threshold",
            "72%",
        );
    }

    if (renderMode === "caption") {
        convertArguments.push(
            "-colorspace",
            "Gray",
            "-normalize",
            "-contrast-stretch",
            "2%x1%",
            "-sharpen",
            "0x1.2",
            "-threshold",
            "66%",
        );
    }

    convertArguments.push(
        "-filter",
        "Lanczos",
        "-resize",
        `${targetWidth}x${targetHeight}!`,
        outputImagePath,
    );

    await runImageMagick(convertArguments);
}

async function runTesseractTsv({
    imagePath,
    workingDirectory,
    sourceX,
    sourceY,
    scaleFactor,
    pageSegmentationMode,
    lineIndexStart,
}) {
    const outputBasePath = path.join(
        workingDirectory,
        `tesseract-${path.basename(imagePath, path.extname(imagePath))}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const outputTsvPath = `${outputBasePath}.tsv`;

    try {
        await execFileAsync(
            tesseractExecutable,
            [
                imagePath,
                outputBasePath,
                "-l",
                tesseractLanguage,
                "--oem",
                "1",
                "--psm",
                String(pageSegmentationMode || defaultTesseractPageSegmentationMode),
                "tsv",
            ],
            {
                maxBuffer: 16 * 1024 * 1024,
            },
        );

        const tsvText = await fs.readFile(outputTsvPath, "utf8");
        return parseTesseractTsv(tsvText, {
            sourceX,
            sourceY,
            scaleFactor,
            lineIndexStart,
        });
    } finally {
        await fs.rm(outputTsvPath, { force: true });
    }
}

function parseTesseractTsv(tsvText, {
    sourceX,
    sourceY,
    scaleFactor,
    lineIndexStart,
}) {
    const rows = String(tsvText || "")
        .split(/\r?\n/)
        .filter(Boolean);

    if (rows.length <= 1) {
        return {
            words: [],
            nextLineIndex: lineIndexStart,
        };
    }

    const headerColumns = rows[0].split("\t");
    const columnIndexes = new Map(headerColumns.map((columnName, index) => [columnName, index]));
    const lineIndexByKey = new Map();
    const words = [];
    let nextLineIndex = lineIndexStart;

    for (const row of rows.slice(1)) {
        const columns = row.split("\t");

        if (columns.length < headerColumns.length) {
            continue;
        }

        const level = Number(columns[columnIndexes.get("level")]);
        const text = String(columns[columnIndexes.get("text")] || "").trim();
        const confidence = Number(columns[columnIndexes.get("conf")]);

        if (level !== 5 || !text || confidence < 0) {
            continue;
        }

        const lineKey = [
            columns[columnIndexes.get("page_num")],
            columns[columnIndexes.get("block_num")],
            columns[columnIndexes.get("par_num")],
            columns[columnIndexes.get("line_num")],
        ].join("|");

        if (!lineIndexByKey.has(lineKey)) {
            lineIndexByKey.set(lineKey, nextLineIndex);
            nextLineIndex += 1;
        }

        const left = Number(columns[columnIndexes.get("left")]) || 0;
        const top = Number(columns[columnIndexes.get("top")]) || 0;
        const width = Number(columns[columnIndexes.get("width")]) || 0;
        const height = Number(columns[columnIndexes.get("height")]) || 0;
        const tightenedBounds = tightenWordBounds({
            text,
            left,
            top,
            width,
            height,
        });

        words.push({
            lineIndex: lineIndexByKey.get(lineKey),
            text,
            confidence,
            x: Math.round(sourceX + (tightenedBounds.left / scaleFactor)),
            y: Math.round(sourceY + (tightenedBounds.top / scaleFactor)),
            width: Math.round(tightenedBounds.width / scaleFactor),
            height: Math.round(tightenedBounds.height / scaleFactor),
            right: Math.round(sourceX + ((tightenedBounds.left + tightenedBounds.width) / scaleFactor)),
            bottom: Math.round(sourceY + ((tightenedBounds.top + tightenedBounds.height) / scaleFactor)),
        });
    }

    return {
        words,
        nextLineIndex,
    };
}

function getScaleFactor(width, height) {
    const longSide = Math.max(width, height) || 1;
    const scaleFactor = targetTileLongSide / longSide;

    if (scaleFactor < 1) {
        return 1;
    }

    return Math.min(maxTileScaleFactor, scaleFactor);
}

function getTileSpecs(imageWidth, imageHeight) {
    const columns = getColumnCount(imageWidth);
    const rows = getRowCount(imageHeight);
    const baseTileWidth = Math.ceil(imageWidth / columns);
    const baseTileHeight = Math.ceil(imageHeight / rows);
    const overlapX = Math.round(baseTileWidth * 0.14);
    const overlapY = Math.round(baseTileHeight * 0.18);
    const specs = [];

    for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
            const x = Math.max(0, (column * baseTileWidth) - overlapX);
            const y = Math.max(0, (row * baseTileHeight) - overlapY);
            const right = Math.min(imageWidth, ((column + 1) * baseTileWidth) + overlapX);
            const bottom = Math.min(imageHeight, ((row + 1) * baseTileHeight) + overlapY);

            specs.push({
                x,
                y,
                width: right - x,
                height: bottom - y,
            });
        }
    }

    return specs;
}

function getColumnCount(width) {
    if (width >= 3600) {
        return 4;
    }

    if (width >= 1800) {
        return 3;
    }

    return 2;
}

function getRowCount(height) {
    if (height >= 3000) {
        return 4;
    }

    if (height >= 1600) {
        return 3;
    }

    return 2;
}

function getTesseractPasses() {
    return [
        {
            renderMode: "normal",
            pageSegmentationMode: defaultTesseractPageSegmentationMode,
        },
        {
            renderMode: "threshold",
            pageSegmentationMode: defaultTesseractPageSegmentationMode,
        },
        {
            renderMode: "caption",
            pageSegmentationMode: "6",
        },
    ];
}

function tightenWordBounds({
    text,
    left,
    top,
    width,
    height,
}) {
    const normalizedText = String(text || "").trim();

    if (!normalizedText || height < 12) {
        return {
            left,
            top,
            width,
            height,
        };
    }

    const hasOnlyUppercaseLetters = /[A-Z]/.test(normalizedText) && normalizedText === normalizedText.toUpperCase();
    const targetHeightRatio = hasOnlyUppercaseLetters ? 0.78 : 0.84;
    const tightenedHeight = Math.max(8, Math.round(height * targetHeightRatio));
    const trimAmount = Math.max(0, height - tightenedHeight);

    if (trimAmount <= 1) {
        return {
            left,
            top,
            width,
            height,
        };
    }

    const topTrim = Math.round(trimAmount * 0.38);
    const bottomTrim = trimAmount - topTrim;

    return {
        left,
        top: top + topTrim,
        width,
        height: Math.max(8, height - topTrim - bottomTrim),
    };
}

function execFileAsync(command, arguments_, options = {}) {
    return new Promise((resolve, reject) => {
        execFile(command, arguments_, options, (error, stdout, stderr) => {
            if (error) {
                const wrappedError = new Error(
                    stderr?.trim()
                    || stdout?.trim()
                    || error.message
                    || `OCR command failed: ${command}`,
                );
                wrappedError.code = error.code;
                wrappedError.statusCode = 500;
                reject(wrappedError);
                return;
            }

            resolve({
                stdout,
                stderr,
            });
        });
    });
}

async function runImageMagick(arguments_) {
    const executableCandidates = configuredImageMagickExecutable
        ? [configuredImageMagickExecutable]
        : ["magick", "convert"];
    let lastError = null;

    for (const executable of executableCandidates) {
        try {
            await execFileAsync(executable, arguments_, {
                maxBuffer: 16 * 1024 * 1024,
            });
            return;
        } catch (error) {
            lastError = error;

            if (!isMissingExecutableError(error)) {
                throw error;
            }
        }
    }

    throw lastError || new Error("ImageMagick is unavailable for Linux OCR.");
}

function isMissingExecutableError(error) {
    return error?.code === "ENOENT"
        || /not recognized/i.test(String(error?.message || ""))
        || /not found/i.test(String(error?.message || ""));
}

module.exports = {
    linuxOcrCacheVersion,
    readLinuxOcrWords,
};
