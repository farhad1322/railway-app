// config/routes/autodsIngest.js
const express = require("express");
const multer = require("multer");
const csv = require("csv-parser");
const stream = require("stream");
const redis = require("../redis");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const QUEUE_KEY = process.env.QUEUE_KEY || "engine:queue";

/**
 * POST /api/autods/ingest
 * multipart/form-data
 * key: file  (CSV)
 */
router.post("/ingest", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      ok: false,
      error: "CSV file is required"
    });
  }

  let count = 0;

  try {
    const bufferStream = new stream.PassThrough();
    bufferStream.end(req.file.buffer);

    bufferStream
      .pipe(csv())
      .on("data", async (row) => {
        if (!row.SKU || !row.Title || !row.Price) return;

        const job = {
          source: "autods",
          sku: row.SKU,
          title: row.Title,
          price: Number(row.Price),
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
    console.error("❌ CSV ingest error:", err);
    res.status(500).json({
      ok: false,
      error: "CSV processing failed"
    });
  }
});

module.exports = router;
