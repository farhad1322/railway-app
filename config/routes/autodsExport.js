// config/routes/autodsExport.js
const express = require("express");
const router = express.Router();

/**
 * AutoDS CSV Export
 * - Accepts ONLY winner products
 * - Returns CSV ready for AutoDS import
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

// ---------- ROUTES ----------

// 🔹 Health check
router.get("/ping", (req, res) => {
  res.json({
    ok: true,
    message: "AutoDS export engine is alive",
    timestamp: new Date().toISOString()
  });
});

// 🔹 Browser test (NO Postman needed)
router.get("/export-test", (req, res) => {
  const demoProduct = {
    title: "Wireless Bluetooth Headphones Noise Cancelling",
    supplierUrl: "https://www.amazon.com/dp/B0TEST123",
    cost: 18.99,
    price: 39.99,
    quantity: 50,
    images: 5,
    shippingDays: 6,
    notes: "Winner A – auto-approved"
  };

  const row = [
    csvEscape(demoProduct.title),
    csvEscape(demoProduct.supplierUrl),
    demoProduct.cost,
    demoProduct.price,
    demoProduct.quantity,
    demoProduct.images,
    demoProduct.shippingDays,
    csvEscape(demoProduct.notes)
  ].join(",");

  const csv = `${CSV_HEADER}\n${row}`;

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=autods_test.csv");
  res.send(csv);
});

module.exports = router;
