const express = require("express");

const { getSearchIndex } = require("../utils/searchIndexStore");

const router = express.Router();

router.get("/index", async (req, res, next) => {
    try {
        const searchIndex = await getSearchIndex({
            forceRefresh: req.query?.refresh === "1",
        });

        res.setHeader("Cache-Control", "public, max-age=60");
        return res.json(searchIndex);
    } catch (error) {
        return next(error);
    }
});

module.exports = router;
