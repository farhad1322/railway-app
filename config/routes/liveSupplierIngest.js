const express = require("express");
const axios = require("axios");
const csv = require("csv-parser");
const stream = require("stream");
const redis = require("../redis");
const { scoreWinner } = require("../workers/winnerScoring");

const router = express.Router();
const QUEUE_KEY = process.env.QUEUE_KEY || "engine:queue";

/**
 * POST /api/supplier/ingest
 * Modes:
 *  - mode=test  → dry run (no Redis)
 *  - mode=live  → push to Redis (default)
 *
 * Body:
 * {
 *   "source": "supplier-name",
 *   "feedUrl": "https://example.com/feed.csv",
 *   "mode": "test"
 * }
 */
router.post("/ingest", async (req, res) => {
  const { source = "supplier", feedUrl, mode = "live" } = req.body;

  if (!feedUrl) {
    return res.status(400).json({ ok: false, error: "feedUrl is required" });
  }

  const report = {
    totalRows: 0,
    accepted: 0,
    rejected: 0,
    pushed: 0,
    rejectedSamples: [],
    acceptedSamples: []
  };

  try {
    const response = await axios.get(feedUrl, {
      responseType: "stream",
      timeout: 30000
    });

    const pass = new stream.PassThrough();
    response.data.pipe(pass);

    pass
      .pipe(csv())
      .on("data", async (row) => {
        report.totalRows++;

        const product = {
          source,
          sku: row.SKU || row.sku || "",
          title: row.Title || row.title || "",
          price: Number(row.Price || row.price || 0),
          supplier: source
        };

        const score = scoreWinner(product);

        if (!product.sku || !product.title || product.price <= 0 || score < 60) {
          report.rejected++;
          if (report.rejectedSamples.length < 5) {
            report.rejectedSamples.push({ product, score });
          }
          return;
        }

        report.accepted++;
        if (report.acceptedSamples.length < 5) {
          report.acceptedSamples.push({ product, score });
        }

        if (mode === "live") {
          await redis.lpush(QUEUE_KEY, JSON.stringify(product));
          report.pushed++;
        }
      })
      .on("end", () => {
        res.json({
          ok: true,
          mode,
          message:
            mode === "test"
              ? "TEST MODE – no data pushed"
              : "LIVE MODE – data pushed to queue",
          report
        });
      });
  } catch (err) {
    console.error("Supplier ingest failed:", err.message);
    res.status(500).json({ ok: false, error: "Supplier ingest failed" });
  }
});

module.exports = router;
