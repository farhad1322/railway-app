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
router.post("/ingest", async (req, res) => {
  const filePath = req.body.filePath;

  if (!filePath) {
    return res.status(400).json({ ok: false, error: "filePath is required" });
  }

  let count = 0;

  try {
    fs.createReadStream(path.resolve(filePath))
      .pipe(csv())
      .on("data", async (row) => {
        const job = {
          source: "autods",
          sku: row.SKU || row.sku,
          title: row.Title || row.title,
          price: row.Price || row.price,
          supplier: row.Supplier || "unknown",
          timestamp: Date.now()
        };

        await redis.lpush(QUEUE_KEY, JSON.stringify(job));
        count++;
      })
      .on("end", () => {
        res.json({
          ok: true,
          message: "AutoDS CSV ingested",
          jobsAdded: count
        });
      });
  } catch (err) {
    console.error("AutoDS ingest error:", err);
    res.status(500).json({ ok: false, error: "Ingest failed" });
  }
});

module.exports = router;
