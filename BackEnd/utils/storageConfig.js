const fs = require("fs/promises");
const path = require("path");

const defaultStorageDirectory = path.join(__dirname, "..", "storage");
const configuredStorageDirectory = String(process.env.BACKEND_STORAGE_DIR || "").trim()
    ? path.resolve(process.env.BACKEND_STORAGE_DIR)
    : defaultStorageDirectory;

function resolveStoragePath(filename) {
    return path.join(configuredStorageDirectory, filename);
}

async function ensureStorageDirectory() {
    await fs.mkdir(configuredStorageDirectory, { recursive: true });
}

async function copyBundledStorageFileIfMissing(filename) {
    await ensureStorageDirectory();

    if (path.resolve(configuredStorageDirectory) === path.resolve(defaultStorageDirectory)) {
        return false;
    }

    const sourcePath = path.join(defaultStorageDirectory, filename);
    const destinationPath = resolveStoragePath(filename);

    try {
        await fs.access(destinationPath);
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

    await fs.copyFile(sourcePath, destinationPath);
    return true;
}

module.exports = {
    copyBundledStorageFileIfMissing,
    defaultStorageDirectory,
    ensureStorageDirectory,
    resolveStoragePath,
    storageDirectory: configuredStorageDirectory,
};
