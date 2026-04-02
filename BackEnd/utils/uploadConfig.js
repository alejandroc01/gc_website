const fs = require("fs/promises");
const path = require("path");

const defaultUploadsRootDirectory = path.join(__dirname, "..", "uploads");
const configuredUploadsRoot = String(process.env.COMPOSITE_UPLOADS_ROOT || "").trim();
const uploadsRootDirectory = configuredUploadsRoot
    ? path.resolve(configuredUploadsRoot)
    : defaultUploadsRootDirectory;
const uploadsDirectory = path.join(uploadsRootDirectory, "composites");
const homepageUploadsDirectory = path.join(uploadsRootDirectory, "homepage");
const oralHistoryUploadsDirectory = path.join(uploadsRootDirectory, "oral-histories");
const compositeUploadSessionsDirectory = path.join(__dirname, "..", ".composite_upload_sessions");
const homepageUploadSessionsDirectory = path.join(__dirname, "..", ".homepage_upload_sessions");
const legacyUploadsDirectory = path.join(defaultUploadsRootDirectory, "composites");
const extensionByMimeType = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
};
const allowedMimeTypes = new Set(Object.keys(extensionByMimeType));
const allowedUploadExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const oralHistoryExtensionByMimeType = {
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/x-m4v": ".m4v",
    "video/webm": ".webm",
};
const allowedOralHistoryMimeTypes = new Set(Object.keys(oralHistoryExtensionByMimeType));
const allowedOralHistoryUploadExtensions = new Set([".mp4", ".mov", ".m4v", ".webm"]);

async function ensureCompositeUploadsDirectory() {
    await fs.mkdir(uploadsDirectory, { recursive: true });
    await fs.mkdir(homepageUploadsDirectory, { recursive: true });
    await fs.mkdir(oralHistoryUploadsDirectory, { recursive: true });
    await fs.mkdir(compositeUploadSessionsDirectory, { recursive: true });
    await fs.mkdir(homepageUploadSessionsDirectory, { recursive: true });
    await migrateBundledCompositeUploads();
}

function isAllowedCompositeUpload(file) {
    const mimeType = String(file?.mimetype || "").trim().toLowerCase();
    const originalExtension = path.extname(String(file?.originalname || "")).toLowerCase();

    return allowedMimeTypes.has(mimeType) || allowedUploadExtensions.has(originalExtension);
}

function resolveExtensionFromUpload(file) {
    const originalExtension = path.extname(file.originalname || "").toLowerCase();

    if (allowedUploadExtensions.has(originalExtension)) {
        return originalExtension === ".jpeg" ? ".jpg" : originalExtension;
    }

    return extensionByMimeType[file.mimetype] || ".jpg";
}

function buildCompositeStoredFilePath(filename) {
    return path.posix.join("uploads", "composites", String(filename || "").trim());
}

function buildHomepageStoredFilePath(filename) {
    return path.posix.join("uploads", "homepage", String(filename || "").trim());
}

function isAllowedOralHistoryUpload(file) {
    const mimeType = String(file?.mimetype || "").trim().toLowerCase();
    const originalExtension = path.extname(String(file?.originalname || "")).toLowerCase();

    return allowedOralHistoryMimeTypes.has(mimeType) || allowedOralHistoryUploadExtensions.has(originalExtension);
}

function resolveExtensionFromOralHistoryUpload(file) {
    const originalExtension = path.extname(file.originalname || "").toLowerCase();

    if (allowedOralHistoryUploadExtensions.has(originalExtension)) {
        return originalExtension;
    }

    return oralHistoryExtensionByMimeType[file.mimetype] || ".mp4";
}

function buildOralHistoryStoredFilePath(filename) {
    return path.posix.join("uploads", "oral-histories", String(filename || "").trim());
}

function normalizeStoredFilePath(storedFilePath) {
    const rawPath = String(storedFilePath || "").trim();

    if (!rawPath) {
        const error = new Error("Stored file path is missing.");
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
        const error = new Error(`Stored file path is invalid: ${rawPath}`);
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
    allowedUploadExtensions,
    allowedOralHistoryMimeTypes,
    allowedOralHistoryUploadExtensions,
    buildCompositeStoredFilePath,
    buildHomepageStoredFilePath,
    buildOralHistoryStoredFilePath,
    compositeUploadSessionsDirectory,
    ensureCompositeUploadsDirectory,
    extensionByMimeType,
    homepageUploadSessionsDirectory,
    homepageUploadsDirectory,
    isAllowedCompositeUpload,
    isAllowedOralHistoryUpload,
    normalizeStoredFilePath,
    resolveExtensionFromUpload,
    resolveExtensionFromOralHistoryUpload,
    resolveStoredFileAbsolutePath,
    oralHistoryExtensionByMimeType,
    oralHistoryUploadsDirectory,
    uploadsDirectory,
    uploadsRootDirectory,
};
