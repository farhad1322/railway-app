// config/routes/autodsExport.js
const express = require("express");
const router = express.Router();

/**
 * AutoDS CSV Export
 * Accepts ONLY winner products
 * Returns CSV ready for AutoDS import
 */

// CSV header for AutoDS
const CSV_HEADER = [
  "Title",
  "Supplier URL",
  "Cost",
  "Price",
  "Quantity",
  "Images",
  "Shipping Days",
  "Notes"
].join(",");

// helper
function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value).replace(/"/g, '""');
  return `"${s}"`;
}

// POST /api/engine/autods/export
router.post("/export", (req, res) => {
  const product = req.body || {};

  // 🔐 HARD SAFETY: allow ONLY winners
  if (!product.pass || product.tier !== "A") {
    return res.status(400).json({
      ok: false,
      error: "Only Tier A winners can be exported to AutoDS"
    });
  }

  const row = [
    csvEscape(product.title),
    csvEscape(product.supplierUrl),
    product.itemCost,
    product.sellPrice,
    product.stock || 10,
    csvEscape((product.images || []).join("|")),
    product.shippingDays || 7,
    csvEscape("Auto-selected winner")
  ].join(",");

  const csv = `${CSV_HEADER}\n${row}`;

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=autods_winner.csv");

  res.send(csv);
});

module.exports = router;
