// index.js - main Express app for eBay automation backend

const express = require("express");
const cors = require("cors");

// =========================
// Route modules (ONLY existing files)
// =========================
const ebayRouter = require("./config/routes/ebay");
const engineRouter = require("./config/routes/autoEngine");

// =========================
// App setup
// =========================
const app = express();
const PORT = process.env.PORT || 3000;

// =========================
// Middlewares
// =========================
app.use(cors());
app.use(express.json());

// =========================
// Root health check
// =========================
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

// =========================
// API Routes
// =========================
app.use("/api/ebay", ebayRouter);
app.use("/api/engine", engineRouter);

// =========================
// 404 Handler
// =========================
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Route not found"
  });
});

// =========================
// Server start
// =========================
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
