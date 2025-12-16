// index.js – main Express app for your eBay automation backend

const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

// Route modules
const ebayRouter = require("./config/routes/ebay");
const engineRouter = require("./config/routes/autoEngine");

const app = express();
const PORT = process.env.PORT || 3000;

// ----------------------
// Rate Limiter (SAFE for 20k/day)
// ----------------------
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // 500 requests per IP per 15 min
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply limiter ONLY to engine routes
app.use("/api/engine", apiLimiter);

// ----------------------
// Middlewares
// ----------------------
app.use(cors());
app.use(express.json({ limit: "5mb" }));

// ----------------------
// Root route
// ----------------------
app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Backend is running",
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

// ----------------------
// Health checks
// ----------------------
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/health/full", (req, res) => {
  res.json({
    ok: true,
    server: "up",
    rateLimiter: "active",
    timestamp: new Date().toISOString(),
  });
});

// ----------------------
// Start server
// ----------------------
app.listen(PORT, () => {
  console.log(`Backend server listening on port ${PORT}`);
});

module.exports = app;
