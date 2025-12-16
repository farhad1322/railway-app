const express = require("express");
const router = express.Router();

/**
 * -----------------------------------
 * SIMPLE IN-MEMORY QUEUE (SAFE)
 * -----------------------------------
 * NOTE:
 * - Temporary (resets on restart)
 * - No DB
 * - No AutoDS
 * - Railway safe
 */
const supplierQueue = [];

/**
 * POST /api/engine/suppliers/import-bulk
 * SAFE bulk import (queued, not processed)
 */
router.post("/suppliers/import-bulk", (req, res) => {
  try {
    const products = req.body;

    // 1️⃣ Basic validation
    if (!Array.isArray(products)) {
      return res.status(400).json({
        ok: false,
        error: "Body must be an array of products"
      });
    }

    // 2️⃣ Safety limit (Railway protection)
    const MAX_BATCH = 1000;
    if (products.length > MAX_BATCH) {
      return res.status(400).json({
        ok: false,
        error: `Batch too large. Max allowed is ${MAX_BATCH}`
      });
    }

    // 3️⃣ Validate & queue products
    let validCount = 0;
    let invalidCount = 0;

    products.forEach((p) => {
      if (
        p &&
        typeof p === "object" &&
        p.sku &&
        p.title &&
        p.price
      ) {
        supplierQueue.push({
          ...p,
          status: "queued",
          importedAt: new Date().toISOString()
        });
        validCount++;
      } else {
        invalidCount++;
      }
    });

    // 4️⃣ Success response
    return res.json({
      ok: true,
      received: products.length,
      valid: validCount,
      invalid: invalidCount,
      queuedTotal: supplierQueue.length,
      status: "Products queued successfully",
      nextStep: "Queue processor will handle this later"
    });

  } catch (error) {
    console.error("Bulk import error:", error);
    return res.status(500).json({
      ok: false,
      error: "Internal server error"
    });
  }
});

/**
 * GET /api/engine/queue/status
 * Check queue size (browser-safe)
 */
router.get("/queue/status", (req, res) => {
  res.json({
    ok: true,
    queuedProducts: supplierQueue.length,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
