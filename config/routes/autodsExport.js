// config/routes/autodsExport.js
const express = require("express");
const router = express.Router();

// ✅ CONNECT WINNER STORE
const {
  getWinners,
  clearWinners
} = require("./winnerStore");

/* =========================
   CSV HEADER (AutoDS READY)
========================= */
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

/* =========================
   HELPERS
========================= */
function csvEscape(value) {
  if (value === null || value === undefined) return "";
  return `"${String(value).replace(/"/g, '""')}"`;
}

/* =========================
   HEALTH CHECK
========================= */
router.get("/ping", (req, res) => {
  res.json({
    ok: true,
    message: "AutoDS BULK export engine is alive",
    timestamp: new Date().toISOString()
  });
});

/* =========================
   EXPORT REAL WINNERS (CSV)
========================= */
router.get("/export-winners", (req, res) => {
  const winners = getWinners();

  if (!winners.length) {
    return res.status(400).json({
      ok: false,
      message: "No winners available for export"
    });
  }

  // 🔒 AutoDS safe batch size
  const batch = winners.slice(0, 150);

  const rows = batch.map(p => [
    csvEscape(p.title),
    csvEscape(p.supplierUrl || ""),
    p.itemCost,
    p.sellPrice,
    50, // default quantity
    p.imagesCount || 5,
    p.deliveryDays || 7,
    csvEscape(`Winner ${p.tier} | Score ${p.score}`)
  ].join(","));

  const csv = `${CSV_HEADER}\n${rows.join("\n")}`;

  // 🔥 CLEAR winners after export (VERY IMPORTANT)
  clearWinners();

  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=autods_winners_${Date.now()}.csv`
  );

  res.send(csv);
});

/* =========================
   BROWSER DEMO TEST
========================= */
router.get("/export-test", (req, res) => {
  const csv = `${CSV_HEADER}
"Demo Product","https://amazon.com",18.99,39.99,50,5,6,"Demo Winner A"`;

  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=autods_test.csv"
  );

  res.send(csv);
});

module.exports = router;
