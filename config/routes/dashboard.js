// config/routes/dashboard.js

const express = require("express");
const redis = require("../redis");

const router = express.Router();

/**
 * ✅ ROOT DASHBOARD API
 * GET /api/dashboard
 */
router.get("/", async (req, res) => {
  try {
    const [
      queueLength,
      threshold,
      seen,
      passed
    ] = await Promise.all([
      redis.llen("engine:queue"),
      redis.get("winner:threshold"),
      redis.get("winner:seen"),
      redis.get("winner:passed")
    ]);

    res.json({
      ok: true,
      system: "eBay Automation Engine",
      queue: {
        pending: Number(queueLength || 0)
      },
      adaptiveThreshold: {
        threshold: Number(threshold || 0),
        seen: Number(seen || 0),
        passed: Number(passed || 0),
        passRate: seen ? Number(passed / seen).toFixed(2) : 0
      },
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({
      ok: false,
      error: "Dashboard failed"
    });
  }
});

module.exports = router;
