const express = require("express");
const router = express.Router();

/**
 * In-memory SAFE queue (temporary)
 * No DB, resets on restart (INTENTIONAL)
 */
let queue = [];

/**
 * POST /api/engine/suppliers/import-bulk
 * SAFE bulk import (adds to memory queue)
 */
router.post("/suppliers/import-bulk", (req, res) => {
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
    products.forEach(p => {
      if (p && p.sku && p.title && p.price) {
        queue.push(p);
        added++;
      }
    });

    return res.json({
      ok: true,
      received: products.length,
      addedToQueue: added,
      queuedProducts: queue.length,
      status: "Products queued (SAFE MODE)"
    });

  } catch (err) {
    console.error("Import error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

/**
 * GET /api/engine/queue/status
 * Queue health check
 */
router.get("/queue/status", (req, res) => {
  res.json({
    ok: true,
    queuedProducts: queue.length,
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /api/engine/queue/process
 * SAFE queue processing (simulation only)
 */
router.post("/queue/process", (req, res) => {
  try {
    const MAX_PROCESS = 100;
    const processed = queue.splice(0, MAX_PROCESS);

    return res.json({
      ok: true,
      processedCount: processed.length,
      remainingInQueue: queue.length,
      note: "SAFE processing only — no AutoDS, no DB"
    });

  } catch (err) {
    console.error("Process error:", err);
    return res.status(500).json({ ok: false, error: "Processing failed" });
  }
});

module.exports = router;
