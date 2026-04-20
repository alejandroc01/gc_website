const fs = require("fs/promises");
const path = require("path");

const defaultUploadsRootDirectory = path.join(__dirname, "..", "uploads");
const configuredUploadsRoot = String(process.env.COMPOSITE_UPLOADS_ROOT || "").trim();
const configuredScrapbookUploadsRoot = String(process.env.SCRAPBOOK_UPLOADS_ROOT || "").trim();
const uploadsRootDirectory = configuredUploadsRoot
    ? path.resolve(configuredUploadsRoot)
    : defaultUploadsRootDirectory;
const uploadsDirectory = path.join(uploadsRootDirectory, "composites");
const scrapbookUploadsDirectory = configuredScrapbookUploadsRoot
    ? path.resolve(configuredScrapbookUploadsRoot)
    : path.join(uploadsRootDirectory, "scrapbooks");
const homepageUploadsDirectory = path.join(uploadsRootDirectory, "homepage");
const oralHistoryUploadsDirectory = path.join(uploadsRootDirectory, "oral-histories");
const historyUploadsDirectory = path.join(uploadsRootDirectory, "histories");
const compositeUploadSessionsDirectory = path.join(__dirname, "..", ".composite_upload_sessions");
const scrapbookUploadSessionsDirectory = path.join(__dirname, "..", ".scrapbook_upload_sessions");
const homepageUploadSessionsDirectory = path.join(__dirname, "..", ".homepage_upload_sessions");
const oralHistoryUploadSessionsDirectory = path.join(__dirname, "..", ".oral_history_upload_sessions");
const historyUploadSessionsDirectory = path.join(__dirname, "..", ".history_upload_sessions");
const legacyUploadsDirectory = path.join(defaultUploadsRootDirectory, "composites");
const extensionByMimeType = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
};
const allowedMimeTypes = new Set(Object.keys(extensionByMimeType));
const allowedUploadExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const allowedScrapbookMimeTypes = new Set(Object.keys(extensionByMimeType));
const allowedScrapbookUploadExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const oralHistoryExtensionByMimeType = {
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/x-m4v": ".m4v",
    "video/webm": ".webm",
};
const allowedOralHistoryMimeTypes = new Set(Object.keys(oralHistoryExtensionByMimeType));
const allowedOralHistoryUploadExtensions = new Set([".mp4", ".mov", ".m4v", ".webm"]);
const historyExtensionByMimeType = {
    "application/pdf": ".pdf",
};
const allowedHistoryMimeTypes = new Set(Object.keys(historyExtensionByMimeType));
const allowedHistoryUploadExtensions = new Set([".pdf"]);

async function ensureCompositeUploadsDirectory() {
    await fs.mkdir(uploadsDirectory, { recursive: true });
    await fs.mkdir(scrapbookUploadsDirectory, { recursive: true });
    await fs.mkdir(homepageUploadsDirectory, { recursive: true });
    await fs.mkdir(oralHistoryUploadsDirectory, { recursive: true });
    await fs.mkdir(historyUploadsDirectory, { recursive: true });
    await fs.mkdir(compositeUploadSessionsDirectory, { recursive: true });
    await fs.mkdir(scrapbookUploadSessionsDirectory, { recursive: true });
    await fs.mkdir(homepageUploadSessionsDirectory, { recursive: true });
    await fs.mkdir(oralHistoryUploadSessionsDirectory, { recursive: true });
    await fs.mkdir(historyUploadSessionsDirectory, { recursive: true });
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

function isAllowedScrapbookUpload(file) {
    const mimeType = String(file?.mimetype || "").trim().toLowerCase();
    const originalExtension = path.extname(String(file?.originalname || "")).toLowerCase();

    return allowedScrapbookMimeTypes.has(mimeType) || allowedScrapbookUploadExtensions.has(originalExtension);
}

function resolveExtensionFromScrapbookUpload(file) {
    const originalExtension = path.extname(file.originalname || "").toLowerCase();

    if (allowedScrapbookUploadExtensions.has(originalExtension)) {
        return originalExtension === ".jpeg" ? ".jpg" : originalExtension;
    }

    return extensionByMimeType[file.mimetype] || ".jpg";
}

function buildScrapbookStoredFilePath(...segments) {
    return path.posix.join(
        "uploads",
        "scrapbooks",
        ...segments.map((segment) => String(segment || "").trim()),
    );
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

function isAllowedHistoryUpload(file) {
    const mimeType = String(file?.mimetype || "").trim().toLowerCase();
    const originalExtension = path.extname(String(file?.originalname || "")).toLowerCase();

    return allowedHistoryMimeTypes.has(mimeType) || allowedHistoryUploadExtensions.has(originalExtension);
}

function resolveExtensionFromHistoryUpload(file) {
    const originalExtension = path.extname(file.originalname || "").toLowerCase();

    if (allowedHistoryUploadExtensions.has(originalExtension)) {
        return originalExtension;
    }

    return historyExtensionByMimeType[file.mimetype] || ".pdf";
}

function buildHistoryStoredFilePath(filename) {
    return path.posix.join("uploads", "histories", String(filename || "").trim());
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
        const scrapbookRelativePath = getUploadsRelativePathForAbsoluteFile(rawPath, scrapbookUploadsDirectory, "scrapbooks");

        if (scrapbookRelativePath) {
            uploadsRelativePath = scrapbookRelativePath;
        } else {
            uploadsRelativePath = path.relative(uploadsRootDirectory, rawPath).replace(/\\/g, "/");
        }
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

    if (normalizedStoredFilePath.startsWith("uploads/scrapbooks/")) {
        const scrapbookRelativePath = normalizedStoredFilePath.slice("uploads/scrapbooks/".length);

        return path.join(scrapbookUploadsDirectory, ...scrapbookRelativePath.split("/"));
    }

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

function getUploadsRelativePathForAbsoluteFile(rawPath, baseDirectory, prefix) {
    const relativePath = path.relative(baseDirectory, rawPath).replace(/\\/g, "/");

    if (
        !relativePath
        || relativePath === "."
        || relativePath.startsWith("../")
        || path.isAbsolute(relativePath)
    ) {
        return null;
    }

    return path.posix.join(prefix, relativePath);
}

module.exports = {
    allowedMimeTypes,
    allowedUploadExtensions,
    allowedScrapbookMimeTypes,
    allowedScrapbookUploadExtensions,
    allowedOralHistoryMimeTypes,
    allowedOralHistoryUploadExtensions,
    buildCompositeStoredFilePath,
    buildScrapbookStoredFilePath,
    buildHomepageStoredFilePath,
    buildOralHistoryStoredFilePath,
    buildHistoryStoredFilePath,
    compositeUploadSessionsDirectory,
    scrapbookUploadSessionsDirectory,
    ensureCompositeUploadsDirectory,
    extensionByMimeType,
    historyExtensionByMimeType,
    historyUploadSessionsDirectory,
    historyUploadsDirectory,
    homepageUploadSessionsDirectory,
    homepageUploadsDirectory,
    isAllowedCompositeUpload,
    isAllowedHistoryUpload,
    isAllowedScrapbookUpload,
    isAllowedOralHistoryUpload,
    normalizeStoredFilePath,
    resolveExtensionFromHistoryUpload,
    resolveExtensionFromUpload,
    resolveExtensionFromScrapbookUpload,
    resolveExtensionFromOralHistoryUpload,
    resolveStoredFileAbsolutePath,
    allowedHistoryMimeTypes,
    allowedHistoryUploadExtensions,
    oralHistoryExtensionByMimeType,
    oralHistoryUploadSessionsDirectory,
    oralHistoryUploadsDirectory,
    scrapbookUploadsDirectory,
    uploadsDirectory,
    uploadsRootDirectory,
};
