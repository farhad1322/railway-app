// config/routes/throttle.js
const express = require("express");
const throttle = require("../throttle");

const router = express.Router();

// GET /api/throttle/status
router.get("/status", async (req, res) => {
  const s = await throttle.status();
  res.json({ ok: true, ...s });
});

// POST /api/throttle/config
// Body example: { "dailyCap": 250, "hourlyCap": 30, "minDelayMs": 9000, "maxDelayMs": 20000, "enabled": true }
router.post("/config", async (req, res) => {
  const cfg = await throttle.setCfg(req.body || {});
  res.json({ ok: true, cfg });
});

module.exports = router;
