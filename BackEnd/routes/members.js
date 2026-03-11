// Route to members table
const express = require("express");
const router = express.Router();
const db = require("../DataBase/connection");

// SQL quiery to get all members from members. Defines GET request for front end
router.get("/members", (req, res) => {
    db.query("SELECT * FROM members", (err, results) => {
        if (err) {
            console.error("Error fetching members: ", err);
            res.status(500).json({ error: "Failed to fetch members" });
        } else {
            // Success send results to front end
            res.json(results);
        }
    });
});

// allows front end to import this file and use the routes defined here
module.exports = router;