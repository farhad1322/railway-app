// config/routes/autodsExport.js
const express = require("express");
const router = express.Router();

/**
 * AutoDS BULK CSV Export
 * - Accepts ONLY winner products
 * - Exports 50–150 products at once
 * - AutoDS-ready CSV
 */

// ---------- CSV HEADER ----------
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

// ---------- HELPERS ----------
function csvEscape(v) {
  if (v === null || v === undefined) return "";
  return `"${String(v).replace(/"/g, '""')}"`;
}

// ---------- HEALTH ----------
router.get("/ping", (req, res) => {
  res.json({
    ok: true,
    message: "AutoDS BULK export engine is alive",
    timestamp: new Date().toISOString()
  });
});

// ---------- BULK EXPORT (Browser test) ----------
router.get("/export-test", (req, res) => {
  // Simulated WINNER batch (normally comes from DB / scoring engine)
  const winners = Array.from({ length: 50 }).map((_, i) => ({
    title: `Winner Product ${i + 1}`,
    supplierUrl: "https://www.amazon.com/dp/TEST123",
    cost: 18.99,
    price: 39.99,
    quantity: 50,
    images: 5,
    shippingDays: 6,
    notes: "Winner A – approved"
  }));

  const rows = winners.map(p =>
    [
      csvEscape(p.title),
      csvEscape(p.supplierUrl),
      p.cost,
      p.price,
      p.quantity,
      p.images,
      p.shippingDays,
      csvEscape(p.notes)
    ].join(",")
  );

  const csv = `${CSV_HEADER}\n${rows.join("\n")}`;

  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=autods_bulk_winners.csv"
  );
  res.send(csv);
});

module.exports = router;
