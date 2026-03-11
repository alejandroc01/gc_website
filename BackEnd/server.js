// Starter js file that handles imports and starts the server

//import express framework and mysql communciation package
const express = require("express");
const mysql = require("mysql");

//Create express app instance
const app = express();

// parse incoming JSON requests
app.use(express.json());

//Test route for now
app.get("/api/test", (req, res) => {
    res.json({ message: "Hello from the server!" });
});

//Start server on port 3000
app.listen(3000, () => {
    console.log("Server is running on port 3000");
});