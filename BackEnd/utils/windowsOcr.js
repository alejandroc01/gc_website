const { execFile } = require("child_process");
const path = require("path");

const powershellExecutable = "C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
const ocrScriptPath = path.join(__dirname, "..", "scripts", "read-ocr-words.ps1");

async function readOcrWords(imagePath) {
    if (process.platform !== "win32") {
        const error = new Error("Composite auto-detect is only available on Windows hosts in this build.");
        error.statusCode = 501;
        throw error;
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
                maxBuffer: 12 * 1024 * 1024,
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
