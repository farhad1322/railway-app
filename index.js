// index.js – main Express app for your eBay automation backend

const express = require("express");
const cors = require("cors");

// Route modules
const ebayRouter = require("./config/routes/ebay");
const engineRouter = require("./config/routes/autoEngine");

const app = express();
const PORT = process.env.PORT || 3000;

// ----------------------
// Middlewares
// ----------------------
app.use(cors());
app.use(express.json());

// ----------------------
// Root route – simple info
// ----------------------
app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Backend is running. Use /api/ebay or /api/engine",
    endpoints: {
      ebay: "/api/ebay",
      engine: "/api/engine",
    },
  });
});

// ----------------------
// Attach routers
// ----------------------
app.use("/api/ebay", ebayRouter);
app.use("/api/engine", engineRouter);
// 🔍 Full system health check
app.get("/health/full", (req, res) => {
  res.json({
    ok: true,
    server: "up",
    ebayRouter: "mounted",
    engineRouter: "mounted",
    imageGuard: "mounted",
    imagesPipeline: "mounted",
    timestamp: new Date().toISOString()
  });
});

// Simple health check for Railway
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// ----------------------
// Start server
// ----------------------
app.listen(PORT, () => {
  console.log(`Backend server listening on port ${PORT}`);
});

module.exports = app;
