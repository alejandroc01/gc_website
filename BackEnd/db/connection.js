// MySQL connection to project
const mysql = require("mysql2");

// create connection object called 'db'. This object can run SQL queries
const db = mysql.createConnection({
    // reads env vars for connection info rather than hardcoding
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

// DEBUG: LOGS STATUS ON DEPLOYMENT
db.connect((err) => {
    if (err) {
        console.error("Database connection failed:", err);
        return;
    }
    console.log("Connected to MySQL database");
});


// allows db object to be available to other files that import this one
module.exports = db;