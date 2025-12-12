// ----------------------------------------------------
// Main Server File (index.js)
// Fully connected with eBay routes + Auto Engine
// ----------------------------------------------------

const express = require("express");
const cors = require("cors");

// ----------------------------
// Import Routers (Correct Paths)
// ----------------------------
const ebayRouter = require("./config/routes/ebay");
const autoEngineRouter = require("./config/routes/autoEngine");

const app = express();
const PORT = process.env.PORT || 3000;

// ----------------------------
// Middlewares
// ----------------------------
app.use(cors());
app.use(express.json());

// ----------------------------
// Route Connections
// ----------------------------

// eBay main API routes
app.use("/api/ebay", ebayRouter);

// Auto Engine (Market Analyzer) routes
app.use("/api/engine", autoEngineRouter);

// ----------------------------
// Root route
// ----------------------------
app.get("/", (req, res) => {
    res.json({
        ok: true,
        message: "Backend is running. Use /api/ebay or /api/engine",
        endpoints: {
            ebay: "/api/ebay",
            engine: "/api/engine"
        }
    });
});

// ----------------------------
// Start Server
// ----------------------------
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
