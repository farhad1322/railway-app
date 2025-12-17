const express = require("express");
const Redis = require("ioredis");
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
 * POST /api/engine/suppliers/import-bulk
 * SAFE bulk import → Redis queue
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
 * GET /api/engine/queue/status
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
 * POST /api/engine/queue/process
 * SAFE Redis processing (simulation)
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

module.exports = router;
