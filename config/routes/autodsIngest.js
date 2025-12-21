// config/routes/autodsIngest.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const redis = require("../redis");

const { scoreProduct } = require("../scoring");
const { getThreshold, recordResult } = require("../adaptiveThreshold");

const router = express.Router();
const QUEUE_KEY = process.env.QUEUE_KEY || "engine:queue";

/**
 * POST /api/autods/ingest
 * multipart/form-data: file=<csv>
 */
router.post("/ingest", async (req, res) => {
  // IMPORTANT:
  // Your current working version already supports file upload.
  // This code assumes your upload middleware is already in place.
  // If you already have it, keep it. If not, tell me and I’ll give you the exact middleware file.

  // If your existing route uses req.file, keep that behavior:
  const uploaded = req.file; // (works if you already integrated multer earlier)
  if (!uploaded) {
    return res.status(400).json({ ok: false, error: "CSV file is required" });
  }

  const filePath = uploaded.path;

  let total = 0;
  let queued = 0;
  let rejected = 0;

  try {
    const threshold = await getThreshold();

    fs.createReadStream(path.resolve(filePath))
      .pipe(csv())
      .on("data", async (row) => {
        total++;

        const candidate = {
          source: "autods",
          sku: row.SKU || row.sku || "",
          title: row.Title || row.title || "",
          price: row.Price || row.price || "",
          supplier: row.Supplier || row.supplier || "unknown",
          timestamp: Date.now()
        };

        const score = scoreProduct(candidate);
        const pass = score >= threshold;

        // Record adaptive learning
        await recordResult(pass);

        if (!pass) {
          rejected++;
          return;
        }

        candidate.score = score;
        candidate.threshold = threshold;

        await redis.lpush(QUEUE_KEY, JSON.stringify(candidate));
        queued++;
      })
      .on("end", async () => {
        // Threshold may have adjusted, return latest
        const latestThreshold = await getThreshold();

        res.json({
          ok: true,
          message: "CSV uploaded & queued successfully (winners only)",
          stats: {
            totalRows: total,
            queued,
            rejected
          },
          threshold: {
            usedAtStart: threshold,
            current: latestThreshold
          }
        });
      });
  } catch (err) {
    console.error("AutoDS ingest error:", err);
    res.status(500).json({ ok: false, error: "Ingest failed" });
  }
});

module.exports = router;
