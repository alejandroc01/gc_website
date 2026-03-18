const { execFile } = require("child_process");
const fs = require("fs/promises");
const path = require("path");

const powershellExecutable = "C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
const ocrScriptPath = path.join(__dirname, "..", "scripts", "read-ocr-words.ps1");
const ocrWordCache = new Map();

async function readOcrWords(imagePath) {
    if (process.platform !== "win32") {
        const error = new Error("Composite auto-detect is only available on Windows hosts in this build.");
        error.statusCode = 501;
        throw error;
    }

    const [imageStats, scriptStats] = await Promise.all([
        fs.stat(imagePath),
        fs.stat(ocrScriptPath),
    ]);
    const cacheKey = `${imagePath}:${imageStats.size}:${imageStats.mtimeMs}:${scriptStats.mtimeMs}`;
    const cachedWords = ocrWordCache.get(cacheKey);

    if (cachedWords) {
        return cachedWords;
    }

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
                    const words = Array.isArray(parsedOutput.words) ? parsedOutput.words : [];
                    ocrWordCache.clear();
                    ocrWordCache.set(cacheKey, words);
                    resolve(words);
                } catch (parseError) {
                    const outputError = new Error("Windows OCR returned an unreadable response.");
                    outputError.statusCode = 500;
                    reject(outputError);
                }
            },
        );
    });
}

module.exports = {
    readOcrWords,
};
