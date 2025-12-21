// config/routes/autodsIngest.js
const express = require("express");
const multer = require("multer");
const csv = require("csv-parser");
const { Readable } = require("stream");
const redis = require("../redis");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const QUEUE_KEY = process.env.QUEUE_KEY || "engine:queue";

router.post("/ingest", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: "CSV file is required" });
  }

  let count = 0;

  try {
    const stream = Readable.from(req.file.buffer.toString("utf8"));

    stream
      .pipe(
        csv({
          separator: ",",
          mapHeaders: ({ header }) =>
            header.replace(/^\uFEFF/, "").trim().toLowerCase()
        })
      )
      .on("data", async (row) => {
        // Required fields check
        if (!row.sku || !row.title || !row.price) return;

        const job = {
          source: "autods",
          sku: row.sku,
          title: row.title,
          price: Number(row.price),
          supplier: row.supplier || "unknown",
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
