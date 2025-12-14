// config/routes/autodsExport.js
const express = require("express");
const router = express.Router();

/**
 * AutoDS BULK CSV Export
 * - Accepts ONLY winner products
 * - Exports 50–150 items per CSV safely
 */

// ---------------- CSV HEADER ----------------
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

// ---------------- HELPERS ----------------
function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value).replace(/"/g, '""');
  return `"${s}"`;
}

function buildRow(p) {
  return [
    csvEscape(p.title),
    csvEscape(p.supplierUrl),
    p.cost,
    p.price,
    p.quantity || 10,
    p.images || 3,
    p.shippingDays || 7,
    csvEscape(p.notes || "Winner product")
  ].join(",");
}

// ---------------- ROUTES ----------------

// 🔹 Health check
router.get("/ping", (req, res) => {
  res.json({
    ok: true,
    message: "AutoDS BULK export engine is alive",
    timestamp: new Date().toISOString()
  });
});

// 🔹 BULK CSV EXPORT (MAIN)
router.post("/export-bulk", (req, res) => {
  const winners = Array.isArray(req.body) ? req.body : [];

  if (winners.length === 0) {
    return res.status(400).json({
      ok: false,
      error: "No winners provided"
    });
  }

  if (winners.length > 150) {
    return res.status(400).json({
      ok: false,
      error: "Max 150 products per export (safety limit)"
    });
  }

  const rows = winners.map(buildRow);
  const csv = `${CSV_HEADER}\n${rows.join("\n")}`;

  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=autods_winners_${Date.now()}.csv`
  );
  res.send(csv);
});

// 🔹 Browser test (NO Postman needed)
router.get("/export-test", (req, res) => {
  const demo = Array.from({ length: 5 }).map((_, i) => ({
    title: `Winner Product ${i + 1}`,
    supplierUrl: "https://www.amazon.com/dp/B0TEST123",
    cost: 19.99,
    price: 39.99,
    quantity: 50,
    images: 5,
    shippingDays: 6,
    notes: "Winner A"
  }));

  const rows = demo.map(buildRow);
  const csv = `${CSV_HEADER}\n${rows.join("\n")}`;

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=autods_test.csv");
  res.send(csv);
});

module.exports = router;
