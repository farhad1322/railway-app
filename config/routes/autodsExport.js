// config/routes/autodsExport.js
const express = require("express");
const router = express.Router();

// ✅ Winner store (single source of truth)
const { getWinners, clearWinners } = require("./winnerStore");


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

function csvEscape(v) {
  if (v === null || v === undefined) return "";
  return `"${String(v).replace(/"/g, '""')}"`;
}

// 🔹 Health check
router.get("/ping", (req, res) => {
  res.json({
    ok: true,
    message: "AutoDS BULK export engine is alive",
    timestamp: new Date().toISOString()
  });
});

// 🔹 REAL BULK EXPORT
router.get("/export-winners", (req, res) => {
  const winners = winnerStore.getWinners();

  if (!winners.length) {
    return res.status(400).json({
      ok: false,
      message: "No winners available to export"
    });
  }

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
    `attachment; filename=autods_winners_${Date.now()}.csv`
  );

  // Optional: clear after export
  winnerStore.clearWinners();

  res.send(csv);
});

module.exports = router;
