// config/routes/queue.js
const express = require("express");
const router = express.Router();

// Temporary in-memory queue (safe starter)
const queue = [];

// =========================
// GET queue status
// =========================
router.get("/status", (req, res) => {
  res.json({
    ok: true,
    queueLength: queue.length,
    queue
  });
});

// =========================
// POST add job to queue
// =========================
router.post("/add", (req, res) => {
  const job = req.body;

  if (!job || Object.keys(job).length === 0) {
    return res.status(400).json({
      ok: false,
      error: "Job data required"
    });
  }

  queue.push({
    id: Date.now(),
    job
  });

  res.json({
    ok: true,
    message: "Job added to queue",
    queueLength: queue.length
  });
});

module.exports = router;
