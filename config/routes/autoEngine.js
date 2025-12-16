const express = require("express");
const router = express.Router();

/**
 * POST /api/engine/suppliers/import-bulk
 * Temporary SAFE bulk import (no DB, no AutoDS)
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

    // 3️⃣ Validate each product (minimal)
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
        validCount++;
      } else {
        invalidCount++;
      }
    });

    // 4️⃣ Success response (NO processing yet)
    return res.json({
      ok: true,
      received: products.length,
      valid: validCount,
      invalid: invalidCount,
      status: "Supplier bulk import accepted (processing disabled)",
      nextStep: "Queue system will handle this later"
    });

  } catch (error) {
    console.error("Bulk import error:", error);
    return res.status(500).json({
      ok: false,
      error: "Internal server error"
    });
  }
});

module.exports = router;
