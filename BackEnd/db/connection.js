// MySQL connection to project
const mysql = require("mysql");

// create conenction object called 'db'. This object can run SQL quieries
const db = mysql.createConnection({
    //reads env vars for connection info rather than hardcoding
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

// allows db object to be available to other files that import this one
module.exports = db;