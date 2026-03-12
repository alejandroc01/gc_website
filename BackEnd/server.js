// Starter js file that handles imports and starts the server

// Import express framework and mysql communication package
const express = require("express");
const mysql = require("mysql2");

// Create express app instance
const app = express();

// Parse incoming JSON requests
app.use(express.json());

// Test route for now
app.get("/api/test", (req, res) => {
    res.json({ message: "Hello from the server!" });
});

// Use environment variable or default to 3000
const PORT = process.env.PORT || 3000;

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});