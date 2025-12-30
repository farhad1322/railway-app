// config/routes/dashboard.js
// LIVE DASHBOARD — Adaptive Threshold Aware

const express = require("express");
const redis = require("../redis");

const router = express.Router();

/**
 * GET /api/dashboard
 */
router.get("/", async (req, res) => {
  try {
    // Read snapshot written by engineWorker
    const snapshotRaw = await redis.get("adaptive:snapshot");
    const snapshot = snapshotRaw ? JSON.parse(snapshotRaw) : null;

    const queueLength = await redis.llen("engine:queue");

    res.json({
      ok: true,
      system: "eBay Automation Engine",
      queue: {
        pending: Number(queueLength || 0)
      },
      adaptiveThreshold: snapshot
        ? {
            threshold: snapshot.threshold,
            seen: snapshot.seen,
            passed: snapshot.passed,
            passRate: snapshot.passRate,
            lastUpdate: snapshot.timestamp
          }
        : {
            threshold: null,
            seen: 0,
            passed: 0,
            passRate: 0,
            note: "Waiting for samples"
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
