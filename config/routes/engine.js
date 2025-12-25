// config/routes/engine.js
const express = require("express");
const router = express.Router();

const { resetStats, getThreshold } = require("../adaptiveThreshold");
const { getThresholdStats, pingRedis } = require("../engineStatus");
const { getCounters } = require("../velocityLock");
const { getTodayRamp, resetRampStart } = require("../dailyRamp");

// health
router.get("/status", async (req, res) => {
  const redisPing = await pingRedis();
  const thresholdStats = await getThresholdStats();
  const counters = await getCounters();
  const ramp = await getTodayRamp();

  res.json({
    ok: true,
    redis: redisPing,
    threshold: thresholdStats,
    velocity: counters,
    ramp,
    timestamp: new Date().toISOString(),
  });
});

// threshold status
router.get("/threshold/status", async (req, res) => {
  const stats = await getThresholdStats();
  res.json({ ok: true, ...stats });
});

// threshold reset (THIS is what you tried before)
router.post("/threshold/reset", async (req, res) => {
  const out = await resetStats();
  res.json(out);
});

// ramp reset (optional)
router.post("/ramp/reset", async (req, res) => {
  const out = await resetRampStart();
  res.json(out);
});

// queue stats (only if you have queue in redis; otherwise keep placeholder)
router.get("/queue/stats", async (req, res) => {
  // If you store queue length key, put it here.
  // Placeholder (won’t crash):
  res.json({ ok: true, note: "queue stats hook ready" });
});

module.exports = router;
