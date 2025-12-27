// config/routes/dashboard.js

const express = require("express");
const redis = require("../redis");
const adaptiveThreshold = require("../adaptiveThreshold");

const router = express.Router();

const QUEUE_KEY = process.env.QUEUE_KEY || "engine:queue";

function todayKey(name) {
  const d = new Date().toISOString().slice(0, 10);
  return `${name}:${d}`;
}

router.get("/status", async (req, res) => {
  try {
    const [
      queueSize,
      threshold,
      listingsToday,
      dayCounter
    ] = await Promise.all([
      redis.llen(QUEUE_KEY),
      adaptiveThreshold.getThreshold(),
      redis.get(todayKey("limit:listings")),
      redis.get("system:dayCounter")
    ]);

    res.json({
      ok: true,
      system: {
        phaseDay: Number(dayCounter || 0),
        queueSize: Number(queueSize || 0),
        listingsToday: Number(listingsToday || 0),
        adaptiveThreshold: threshold
      },
      features: {
        repricingEnabled: process.env.REPRICE_ENABLED !== "0",
        aiImagesEnabled: true,
        velocityRampEnabled: true
      },
      safety: {
        killSwitch: process.env.KILL_SWITCH === "1" ? "ON" : "OFF"
      },
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error("Dashboard error:", err.message);
    res.status(500).json({
      ok: false,
      error: "Dashboard failed"
    });
  }
});

module.exports = router;
