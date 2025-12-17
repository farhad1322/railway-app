const express = require("express");
const router = express.Router();
const winnerScoringRouter = require("./winnerScoring");

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
router.use("/winner-scoring", winnerScoringRouter);
/**
 * POST /api/engine/scan-and-queue
 * CSV/JSON → Winner Scoring → Queue (SAFE MODE)
 */
router.post("/scan-and-queue", (req, res) => {
  try {
    const products = req.body;

    if (!Array.isArray(products)) {
      return res.status(400).json({
        ok: false,
        error: "Body must be an array of products"
      });
    }

    const scorer = require("./winnerScoring");

    let scanned = products.length;
    let passed = 0;
    let rejected = 0;

    products.forEach((product) => {
      try {
        // simulate internal scoring call
        const fastRejects = scorer.fastReject
          ? scorer.fastReject(product)
          : [];

        if (fastRejects.length) {
          rejected++;
          return;
        }

        const result = scorer.scoreProduct
          ? scorer.scoreProduct(product)
          : { pass: false };

        if (result.pass) {
          queue.push(product);
          passed++;
        } else {
          rejected++;
        }
      } catch (e) {
        rejected++;
      }
    });

    return res.json({
      ok: true,
      scanned,
      passedToQueue: passed,
      rejected,
      queuedProducts: queue.length,
      note: "SAFE MODE — scoring + queue only"
    });

  } catch (err) {
    console.error("Scan error:", err);
    return res.status(500).json({ ok: false, error: "Scan failed" });
  }
});

module.exports = router;
