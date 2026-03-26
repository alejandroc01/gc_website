const fs = require("fs/promises");
const path = require("path");

const uploadsDirectory = path.join(__dirname, "..", "uploads", "composites");
const extensionByMimeType = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
};
const allowedMimeTypes = new Set(Object.keys(extensionByMimeType));

async function ensureCompositeUploadsDirectory() {
    await fs.mkdir(uploadsDirectory, { recursive: true });
}

function resolveExtensionFromUpload(file) {
    const originalExtension = path.extname(file.originalname || "").toLowerCase();

    if ([".jpg", ".jpeg", ".png", ".webp"].includes(originalExtension)) {
        return originalExtension === ".jpeg" ? ".jpg" : originalExtension;
    }

    return extensionByMimeType[file.mimetype] || ".jpg";
}

module.exports = {
    allowedMimeTypes,
    ensureCompositeUploadsDirectory,
    extensionByMimeType,
    resolveExtensionFromUpload,
    uploadsDirectory,
};
