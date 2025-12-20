// config/routes/autodsIngest.js
const express = require("express");
const csv = require("csv-parser");
const multer = require("multer");
const redis = require("../redis");
const { Readable } = require("stream");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const QUEUE_KEY = process.env.QUEUE_KEY || "engine:queue";

/**
 * POST /api/autods/ingest
 * multipart/form-data
 * file: CSV file
 */
router.post("/ingest", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: "CSV file is required" });
  }

  let count = 0;

  try {
    const stream = Readable.from(req.file.buffer);

    stream
      .pipe(csv())
      .on("data", async (row) => {
        const job = {
          source: "autods",
          sku: row.SKU || row.sku,
          title: row.Title || row.title,
          price: row.Price || row.price,
          supplier: row.Supplier || "AutoDS",
          timestamp: Date.now()
        };

        await redis.lpush(QUEUE_KEY, JSON.stringify(job));
        count++;
      })
      .on("end", () => {
        res.json({
          ok: true,
          message: "CSV uploaded & queued successfully",
          jobsAdded: count
        });
      });
  } catch (err) {
    console.error("AutoDS ingest error:", err);
    res.status(500).json({ ok: false, error: "Ingest failed" });
  }
});

module.exports = router;
