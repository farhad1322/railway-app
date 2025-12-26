const express = require("express");
const Redis = require("ioredis");

const adaptiveThreshold = require("../adaptiveThreshold");
const dailyRamp = require("../dailyRamp");

const router = express.Router();

/**
 * Redis connection
 * Railway injects REDIS_URL automatically
 */
const redis = new Redis(process.env.REDIS_URL);

/**
 * Redis queue key
 */
const QUEUE_KEY = "supplier_queue";

/**
 * ---------------------------------------------------
 * POST /api/engine/suppliers/import-bulk
 * SAFE bulk import → Redis queue (used internally)
 * ---------------------------------------------------
 */
router.post("/suppliers/import-bulk", async (req, res) => {
  try {
    const products = req.body;

    if (!Array.isArray(products)) {
      return res.status(400).json({
        ok: false,
        error: "Body must be an array of products"
      });
    }

    const MAX_BATCH = 1000;
    if (products.length > MAX_BATCH) {
      return res.status(400).json({
        ok: false,
        error: `Batch too large. Max allowed is ${MAX_BATCH}`
      });
    }

    let added = 0;

    for (const p of products) {
      if (p && p.sku && p.title && p.price) {
        await redis.rpush(QUEUE_KEY, JSON.stringify(p));
        added++;
      }
    }

    const queueLength = await redis.llen(QUEUE_KEY);

    res.json({
      ok: true,
      received: products.length,
      addedToQueue: added,
      queuedProducts: queueLength,
      status: "Products queued in Redis"
    });

  } catch (err) {
    console.error("Import error:", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

/**
 * ---------------------------------------------------
 * GET /api/engine/queue/status
 * ---------------------------------------------------
 */
router.get("/queue/status", async (req, res) => {
  const length = await redis.llen(QUEUE_KEY);

  res.json({
    ok: true,
    queuedProducts: length,
    storage: "redis",
    timestamp: new Date().toISOString()
  });
});

/**
 * ---------------------------------------------------
 * POST /api/engine/queue/process
 * SAFE Redis processing (simulation)
 * ---------------------------------------------------
 */
router.post("/queue/process", async (req, res) => {
  try {
    const MAX_PROCESS = 100;
    let processed = 0;

    for (let i = 0; i < MAX_PROCESS; i++) {
      const item = await redis.lpop(QUEUE_KEY);
      if (!item) break;
      processed++;
    }

    const remaining = await redis.llen(QUEUE_KEY);

    res.json({
      ok: true,
      processedCount: processed,
      remainingInQueue: remaining,
      note: "SAFE Redis processing only"
    });

  } catch (err) {
    console.error("Process error:", err);
    res.status(500).json({ ok: false, error: "Processing failed" });
  }
});

/**
 * ---------------------------------------------------
 * POST /api/engine/evaluate
 * FINAL GATE — score → threshold → ramp → queue
 * ---------------------------------------------------
 */
router.post("/evaluate", async (req, res) => {
  try {
    const { products = [], mode = "live" } = req.body;

    if (!Array.isArray(products)) {
      return res.status(400).json({
        ok: false,
        error: "products must be an array"
      });
    }

    let jobsAdded = 0;
    let rejected = 0;
    const inspected = [];

    const threshold = await adaptiveThreshold.getThreshold();

    for (const product of products) {
      const score = Number(product.score || 0);

      const passedThreshold = score >= threshold;
      await adaptiveThreshold.recordResult(passedThreshold);

      if (!passedThreshold) {
        rejected++;
        continue;
      }

      // ⛔ In TEST mode: inspect only
      if (mode === "test") {
        inspected.push({
          ...product,
          score,
          threshold,
          decision: "PASS (TEST)"
        });
        continue;
      }

      // ✅ DAILY RAMP CHECK (LIVE ONLY)
      const ramp = await dailyRamp.canListOne();
      if (!ramp.allowed) {
        rejected++;
        continue;
      }

      // ✅ APPROVED → QUEUE
      await redis.rpush(QUEUE_KEY, JSON.stringify(product));
      jobsAdded++;
    }

    res.json({
      ok: true,
      mode,
      threshold,
      jobsAdded,
      rejected,
      inspected
    });

  } catch (err) {
    console.error("Engine evaluate error:", err);
    res.status(500).json({
      ok: false,
      error: "Engine evaluation failed"
    });
  }
});

/**
 * ---------------------------------------------------
 * POST /api/engine/threshold/reset
 * RUN ONCE when changing threshold logic
 * ---------------------------------------------------
 */
router.post("/threshold/reset", async (req, res) => {
  try {
    const result = await adaptiveThreshold.resetStats();
    res.json(result);
  } catch (err) {
    console.error("Threshold reset failed:", err);
    res.status(500).json({
      ok: false,
      error: "Threshold reset failed"
    });
  }
});

module.exports = router;
