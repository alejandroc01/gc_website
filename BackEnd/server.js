const express = require("express");
const cors = require("cors");

const adminRoutes = require("./routes/admins");
const compositeRoutes = require("./routes/composites");
const historyRoutes = require("./routes/histories");
const homepageRoutes = require("./routes/homepage");
const oralHistoryRoutes = require("./routes/oralHistories");
const profileRoutes = require("./routes/profiles");
const searchRoutes = require("./routes/search");
const scrapbookRoutes = require("./routes/scrapbooks");
const { requireAdminAuth } = require("./utils/adminAuth");
const { ensureAdminStore } = require("./utils/adminStore");
const { ensureCompositeStore } = require("./utils/compositeStore");
const { ensureHistoryStore } = require("./utils/historyStore");
const { ensureHomepageStore } = require("./utils/homepageStore");
const { ensureOralHistoryStore } = require("./utils/oralHistoryStore");
const { ensureProfileStore } = require("./utils/profileStore");
const { ensureScrapbookStore } = require("./utils/scrapbookStore");
const { clearSearchIndexCache } = require("./utils/searchIndexStore");
const {
    ensureCompositeUploadsDirectory,
    scrapbookUploadsDirectory,
    uploadsRootDirectory,
} = require("./utils/uploadConfig");

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use("/uploads/scrapbooks", express.static(scrapbookUploadsDirectory));
app.use("/api/uploads/scrapbooks", express.static(scrapbookUploadsDirectory));
app.use("/uploads", express.static(uploadsRootDirectory));
app.use("/api/uploads", express.static(uploadsRootDirectory));
app.use(clearSearchIndexCacheAfterUnsafeRequests);

app.get("/api/test", (_req, res) => {
    res.json({ message: "Hello from the composite archive server!" });
});

app.use("/api/admin", adminRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/profiles", requireAdminForUnsafeRequests, profileRoutes);
app.use("/api/composites", requireAdminForUnsafeRequests, compositeRoutes);
app.use("/api/histories", requireAdminForUnsafeRequests, historyRoutes);
app.use("/api/scrapbooks", requireAdminForUnsafeRequests, scrapbookRoutes);
app.use("/api/homepage", requireAdminForUnsafeRequests, homepageRoutes);
app.use("/api/oral-histories", requireAdminForUnsafeRequests, oralHistoryRoutes);

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

function requireAdminForUnsafeRequests(req, res, next) {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method) && !isAdminOnlyReadRequest(req)) {
        return next();
    }

    return requireAdminAuth(req, res, next);
}

function isAdminOnlyReadRequest(req) {
    return req.method === "GET"
        && req.baseUrl === "/api/profiles"
        && req.path === "/export";
}

function clearSearchIndexCacheAfterUnsafeRequests(req, res, next) {
    if (!req.path.startsWith("/api/") || ["GET", "HEAD", "OPTIONS"].includes(req.method)) {
        return next();
    }

    res.on("finish", () => {
        if (res.statusCode < 400) {
            clearSearchIndexCache();
        }
    });

    return next();
}

Promise.all([
    ensureAdminStore(),
    ensureCompositeStore(),
    ensureHistoryStore(),
    ensureHomepageStore(),
    ensureCompositeUploadsDirectory(),
    ensureOralHistoryStore(),
    ensureProfileStore(),
    ensureScrapbookStore(),
])
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    })
    .catch((error) => {
        console.error("Failed to initialize composite archive storage:", error);
        process.exit(1);
    });
