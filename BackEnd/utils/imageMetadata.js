const fs = require("fs/promises");
const imageSizeModule = require("image-size");

const imageSize = imageSizeModule.imageSize || imageSizeModule;

async function getImageMetadata(filePath) {
    const fileBuffer = await fs.readFile(filePath);
    const dimensions = imageSize(fileBuffer);

    if (!dimensions?.width || !dimensions?.height) {
        const error = new Error("Unable to read image dimensions from the uploaded composite.");
        error.statusCode = 400;
        throw error;
    }

    return {
        width: dimensions.width,
        height: dimensions.height,
        type: dimensions.type,
    };
}

module.exports = {
    getImageMetadata,
};
