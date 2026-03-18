const { execFile } = require("child_process");
const fs = require("fs/promises");
const path = require("path");

const { linuxOcrCacheVersion, readLinuxOcrWords } = require("./linuxOcr");

const powershellExecutable = "C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
const ocrScriptPath = path.join(__dirname, "..", "scripts", "read-ocr-words.ps1");
const linuxOcrModulePath = path.join(__dirname, "linuxOcr.js");
const ocrWordCache = new Map();
const ocrCacheVersion = "ocr-v2";

async function readOcrWords(imagePath) {
    const implementationMetadata = await getImplementationMetadata();
    const imageStats = await fs.stat(imagePath);
    const cacheKey = [
        ocrCacheVersion,
        process.platform,
        imagePath,
        imageStats.size,
        imageStats.mtimeMs,
        implementationMetadata,
    ].join(":");
    const cachedWords = ocrWordCache.get(cacheKey);

    if (cachedWords) {
        return cachedWords;
    }

    const words = process.platform === "win32"
        ? await readWindowsOcrWords(imagePath)
        : await readPosixOcrWords(imagePath);

    ocrWordCache.clear();
    ocrWordCache.set(cacheKey, words);
    return words;
}

async function getImplementationMetadata() {
    if (process.platform === "win32") {
        const scriptStats = await fs.stat(ocrScriptPath);
        return `windows:${scriptStats.mtimeMs}`;
    }

    if (process.platform === "linux" || process.platform === "darwin") {
        const linuxModuleStats = await fs.stat(linuxOcrModulePath);
        return `linux:${linuxOcrCacheVersion}:${linuxModuleStats.mtimeMs}`;
    }

    return "unsupported";
}

async function readWindowsOcrWords(imagePath) {
    return new Promise((resolve, reject) => {
        execFile(
            powershellExecutable,
            [
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                ocrScriptPath,
                "-ImagePath",
                imagePath,
            ],
            {
                windowsHide: true,
                maxBuffer: 48 * 1024 * 1024,
            },
            (error, stdout, stderr) => {
                if (error) {
                    const ocrError = new Error(
                        stderr?.trim()
                        || error.message
                        || "Windows OCR failed while reading the composite image.",
                    );
                    ocrError.statusCode = 500;
                    reject(ocrError);
                    return;
                }

                try {
                    const parsedOutput = JSON.parse(stdout || "{}");
                    resolve(Array.isArray(parsedOutput.words) ? parsedOutput.words : []);
                } catch (_parseError) {
                    const outputError = new Error("Windows OCR returned an unreadable response.");
                    outputError.statusCode = 500;
                    reject(outputError);
                }
            },
        );
    });
}

async function readPosixOcrWords(imagePath) {
    if (process.platform !== "linux" && process.platform !== "darwin") {
        const error = new Error(`Composite auto-detect is not supported on ${process.platform} hosts in this build.`);
        error.statusCode = 501;
        throw error;
    }

    try {
        return await readLinuxOcrWords(imagePath);
    } catch (error) {
        if (error.statusCode) {
            throw error;
        }

        const linuxOcrError = new Error(
            "Linux OCR is unavailable. Install ImageMagick and Tesseract, or use the backend Docker image that includes them.",
        );
        linuxOcrError.statusCode = 500;
        throw linuxOcrError;
    }
}

module.exports = {
    readOcrWords,
};
