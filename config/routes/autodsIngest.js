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
  const filePath = req.body && req.body.filePath;

  if (!filePath) {
    return res.status(400).json({ ok: false, error: "filePath is required" });
  }

  const resolvedPath = path.resolve(filePath);

  // Optional: basic safety check so someone can’t read random files
  // (You can remove this if you want)
  // if (!resolvedPath.endsWith(".csv")) {
  //   return res.status(400).json({ ok: false, error: "filePath must be a .csv file" });
  // }

  let count = 0;
  let pushed = 0;

  try {
    const stream = fs.createReadStream(resolvedPath).pipe(csv());

    stream.on("data", (row) => {
      const job = {
        source: "autods",
        sku: row.SKU || row.sku || "",
        title: row.Title || row.title || "",
        price: row.Price || row.price || "",
        supplier: row.Supplier || row.supplier || "unknown",
        timestamp: Date.now()
      };

      count++;

      // push to redis without blocking the stream
      redis
        .lpush(QUEUE_KEY, JSON.stringify(job))
        .then(() => {
          pushed++;
        })
        .catch((err) => {
          console.error("Redis LPUSH error:", err.message);
        });
    });

    stream.on("end", () => {
      res.json({
        ok: true,
        message: "AutoDS CSV ingested",
        rowsRead: count,
        jobsAdded: pushed,
        queueKey: QUEUE_KEY
      });
    });

    stream.on("error", (err) => {
      console.error("CSV stream error:", err);
      res.status(500).json({ ok: false, error: "CSV read failed" });
    });
  } catch (err) {
    console.error("AutoDS ingest error:", err);
    res.status(500).json({ ok: false, error: "Ingest failed" });
  }
});

module.exports = router;
