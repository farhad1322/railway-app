// config/routes/autodsExport.js
const express = require("express");
const router = express.Router();

/**
 * AutoDS BULK CSV Export
 * - Accepts ONLY winner products (A/B)
 * - Exports 50–150 products per CSV
 * - AutoDS-ready format
 */

// ---------- CSV HEADER (AutoDS compatible) ----------
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
function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value).replace(/"/g, '""');
  return `"${s}"`;
}

// ---------- HEALTH CHECK ----------
router.get("/ping", (req, res) => {
  res.json({
    ok: true,
    message: "AutoDS BULK export engine is alive",
    timestamp: new Date().toISOString()
  });
});

// ---------- BULK EXPORT ----------
/**
 * POST /api/engine/autods/export
 * Body: { winners: [ ...products ] }
 */
router.post("/export", (req, res) => {
  const winners = Array.isArray(req.body?.winners) ? req.body.winners : [];

  if (winners.length === 0) {
    return res.status(400).json({
      ok: false,
      error: "No winner products provided"
    });
  }

  if (winners.length > 150) {
    return res.status(400).json({
      ok: false,
      error: "Max 150 products per CSV for safe AutoDS import"
    });
  }

  const rows = winners.map((p, index) => {
    if (!p.title || !p.supplierUrl || !p.cost || !p.price) {
      throw new Error(`Invalid product at index ${index}`);
    }

    return [
      csvEscape(p.title),
      csvEscape(p.supplierUrl),
      p.cost,
      p.price,
      p.quantity || 50,
      p.imagesCount || 3,
      p.shippingDays || 7,
      csvEscape(p.notes || "Winner – Auto approved")
    ].join(",");
  });

  const csv = `${CSV_HEADER}\n${rows.join("\n")}`;

  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=autods_winners_${Date.now()}.csv`
  );

  res.send(csv);
});

// ---------- BROWSER TEST (NO POSTMAN) ----------
router.get("/export-test", (req, res) => {
  const demoWinners = [
    {
      title: "Wireless Bluetooth Headphones Noise Cancelling",
      supplierUrl: "https://www.amazon.com/dp/B0TEST123",
      cost: 18.99,
      price: 39.99,
      quantity: 50,
      imagesCount: 5,
      shippingDays: 6,
      notes: "Tier A – High ROI"
    },
    {
      title: "Smart LED Strip Lights RGB App Control",
      supplierUrl: "https://www.aliexpress.com/item/100500TEST",
      cost: 9.5,
      price: 24.99,
      quantity: 80,
      imagesCount: 4,
      shippingDays: 8,
      notes: "Tier B – Stable seller"
    }
  ];

  const rows = demoWinners.map(p => [
    csvEscape(p.title),
    csvEscape(p.supplierUrl),
    p.cost,
    p.price,
    p.quantity,
    p.imagesCount,
    p.shippingDays,
    csvEscape(p.notes)
  ].join(","));

  const csv = `${CSV_HEADER}\n${rows.join("\n")}`;

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=autods_bulk_test.csv");
  res.send(csv);
});

module.exports = router;
