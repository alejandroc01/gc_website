const fs = require("fs/promises");
const path = require("path");

const defaultUploadsRootDirectory = path.join(__dirname, "..", "uploads");
const configuredUploadsRoot = String(process.env.COMPOSITE_UPLOADS_ROOT || "").trim();
const uploadsRootDirectory = configuredUploadsRoot
    ? path.resolve(configuredUploadsRoot)
    : defaultUploadsRootDirectory;
const uploadsDirectory = path.join(uploadsRootDirectory, "composites");
const legacyUploadsDirectory = path.join(defaultUploadsRootDirectory, "composites");
const extensionByMimeType = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
};
const allowedMimeTypes = new Set(Object.keys(extensionByMimeType));

async function ensureCompositeUploadsDirectory() {
    await fs.mkdir(uploadsDirectory, { recursive: true });
    await migrateBundledCompositeUploads();
}

function resolveExtensionFromUpload(file) {
    const originalExtension = path.extname(file.originalname || "").toLowerCase();

    if ([".jpg", ".jpeg", ".png", ".webp"].includes(originalExtension)) {
        return originalExtension === ".jpeg" ? ".jpg" : originalExtension;
    }

    return extensionByMimeType[file.mimetype] || ".jpg";
}

function buildCompositeStoredFilePath(filename) {
    return path.posix.join("uploads", "composites", String(filename || "").trim());
}

function normalizeStoredFilePath(storedFilePath) {
    const rawPath = String(storedFilePath || "").trim();

    if (!rawPath) {
        const error = new Error("Composite stored file path is missing.");
        error.statusCode = 500;
        throw error;
    }

    let uploadsRelativePath = rawPath.replace(/\\/g, "/");

    if (isAbsoluteFilePath(rawPath)) {
        uploadsRelativePath = path.relative(uploadsRootDirectory, rawPath).replace(/\\/g, "/");
    } else {
        uploadsRelativePath = uploadsRelativePath.replace(/^\/+/, "");

        if (uploadsRelativePath.slice(0, 8).toLowerCase() === "uploads/") {
            uploadsRelativePath = uploadsRelativePath.slice(8);
        }
    }

    const normalizedRelativePath = path.posix.normalize(uploadsRelativePath).replace(/^\/+/, "");

    if (
        !normalizedRelativePath
        || normalizedRelativePath === "."
        || normalizedRelativePath.startsWith("../")
    ) {
        const error = new Error(`Composite stored file path is invalid: ${rawPath}`);
        error.statusCode = 500;
        throw error;
    }

    return path.posix.join("uploads", normalizedRelativePath);
}

function resolveStoredFileAbsolutePath(storedFilePath) {
    const normalizedStoredFilePath = normalizeStoredFilePath(storedFilePath);
    const uploadsRootRelativePath = normalizedStoredFilePath.slice("uploads/".length);

    return path.join(uploadsRootDirectory, ...uploadsRootRelativePath.split("/"));
}

async function migrateBundledCompositeUploads() {
    if (path.resolve(uploadsDirectory) === path.resolve(legacyUploadsDirectory)) {
        return;
    }

    let legacyEntries = [];

    try {
        legacyEntries = await fs.readdir(legacyUploadsDirectory, { withFileTypes: true });
    } catch (error) {
        if (error.code === "ENOENT") {
            return;
        }

        throw error;
    }

    for (const entry of legacyEntries) {
        if (!entry.isFile()) {
            continue;
        }

        const sourcePath = path.join(legacyUploadsDirectory, entry.name);
        const destinationPath = path.join(uploadsDirectory, entry.name);

        try {
            await fs.access(destinationPath);
            continue;
        } catch (error) {
            if (error.code !== "ENOENT") {
                throw error;
            }
        }

        await fs.copyFile(sourcePath, destinationPath);
    }
}

function isAbsoluteFilePath(filePath) {
    return path.isAbsolute(filePath)
        || path.posix.isAbsolute(filePath)
        || path.win32.isAbsolute(filePath);
}

module.exports = {
    allowedMimeTypes,
    buildCompositeStoredFilePath,
    ensureCompositeUploadsDirectory,
    extensionByMimeType,
    normalizeStoredFilePath,
    resolveExtensionFromUpload,
    resolveStoredFileAbsolutePath,
    uploadsDirectory,
    uploadsRootDirectory,
};
