// config/routes/supplierImport.js
const express = require("express");
const router = express.Router();

/**
 * BULK SUPPLIER IMPORT
 * POST /api/engine/suppliers/import-bulk
 *
 * Body:
 * {
 *   supplier: "amazon",
 *   products: [ {...}, {...} ]
 * }
 */

router.post("/suppliers/import-bulk", (req, res) => {
  const { supplier, products } = req.body || {};

  // Basic validation
  if (!supplier) {
    return res.status(400).json({
      ok: false,
      error: "Missing supplier name"
    });
  }

  if (!Array.isArray(products)) {
    return res.status(400).json({
      ok: false,
      error: "Products must be an array"
    });
  }

  // HARD LIMIT protection
  if (products.length > 5000) {
    return res.status(400).json({
      ok: false,
      error: "Max 5000 products per request"
    });
  }

  // For now: just accept + count
  // (Later we will store in DB)
  return res.json({
    ok: true,
    supplier,
    received: products.length,
    message: "Bulk supplier products accepted"
  });
});

module.exports = router;
