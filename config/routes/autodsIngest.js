// config/routes/autodsIngest.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const redis = require("../redis");

const router = express.Router();

const QUEUE_KEY = process.env.QUEUE_KEY || "engine:queue";

/**
 * POST /api/autods/ingest
 * Body: { "filePath": "/app/data/autods.csv" }
 */
router.post("/ingest", (req, res) => {
  const filePath = req.body.filePath;

  if (!filePath) {
    return res.status(400).json({
      ok: false,
      error: "filePath is required"
    });
  }

  let count = 0;

  const fullPath = path.resolve(filePath);

  if (!fs.existsSync(fullPath)) {
    return res.status(400).json({
      ok: false,
      error: "CSV file not found"
    });
  }

  fs.createReadStream(fullPath)
    .pipe(csv())
    .on("data", (row) => {
      const job = {
        source: "autods",
        sku: row.SKU || row.sku,
        title: row.Title || row.title,
        price: row.Price || row.price,
        supplier: row.Supplier || "unknown",
        timestamp: Date.now()
      };

      redis.lpush(QUEUE_KEY, JSON.stringify(job));
      count++;
    })
    .on("end", () => {
      res.json({
        ok: true,
        message: "AutoDS CSV ingested successfully",
        jobsAdded: count
      });
    })
    .on("error", (err) => {
      console.error("CSV parse error:", err);
      res.status(500).json({
        ok: false,
        error: "CSV parsing failed"
      });
    });
});

module.exports = router;
