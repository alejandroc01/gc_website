const express = require("express");
const cors = require("cors");

const compositeRoutes = require("./routes/composites");
const profileRoutes = require("./routes/profiles");
const { ensureCompositeStore } = require("./utils/compositeStore");
const { ensureProfileStore } = require("./utils/profileStore");
const {
    ensureCompositeUploadsDirectory,
    uploadsRootDirectory,
} = require("./utils/uploadConfig");

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(uploadsRootDirectory));
app.use("/api/uploads", express.static(uploadsRootDirectory));

app.get("/api/test", (_req, res) => {
    res.json({ message: "Hello from the composite archive server!" });
});

app.use("/api/profiles", profileRoutes);
app.use("/api/composites", compositeRoutes);

app.use((error, _req, res, _next) => {
    if (error && error.type === "entity.parse.failed") {
        return res.status(400).json({ error: "Invalid JSON request body." });
    }

    if (error && error.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
            error: "The uploaded file exceeded the server size limit for a single request.",
        });
    }

    const statusCode = error.statusCode || error.status || 500;
    const message = error.message || "Unexpected server error.";

    if (statusCode >= 500) {
        console.error(error);
    }

    return res.status(statusCode).json({ error: message });
});

const PORT = process.env.PORT || 3000;

Promise.all([ensureCompositeStore(), ensureCompositeUploadsDirectory(), ensureProfileStore()])
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    })
    .catch((error) => {
        console.error("Failed to initialize composite archive storage:", error);
        process.exit(1);
    });
