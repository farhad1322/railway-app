const express = require("express");
const axios = require("axios");
const csv = require("csv-parser");
const stream = require("stream");
const redis = require("../redis");
const scoreWinner = require("../workers/winnerScoring");

const router = express.Router();
const QUEUE_KEY = process.env.QUEUE_KEY || "engine:queue";

/**
 * POST /api/supplier/ingest
 * Body:
 * {
 *   "source": "autods",
 *   "feedUrl": "https://supplier-feed-url.csv"
 * }
 */
router.post("/ingest", async (req, res) => {
  const { source, feedUrl } = req.body;

  if (!feedUrl) {
    return res.status(400).json({ ok: false, error: "feedUrl required" });
  }

  let jobsAdded = 0;

  try {
    const response = await axios.get(feedUrl, { responseType: "stream" });
    const pass = new stream.PassThrough();
    response.data.pipe(pass);

    pass
      .pipe(csv())
      .on("data", async (row) => {
        const product = {
          source,
          sku: row.SKU || row.sku,
          title: row.Title || row.title,
          price: Number(row.Price || row.price || 0),
          supplier: row.Supplier || source,
          timestamp: Date.now()
        };

        const score = scoreWinner(product);
        if (score < 60) return; // reject weak products

        await redis.lpush(QUEUE_KEY, JSON.stringify(product));
        jobsAdded++;
      })
      .on("end", () => {
        res.json({
          ok: true,
          message: "Live supplier feed ingested",
          jobsAdded
        });
      });

  } catch (err) {
    console.error("Supplier ingest error:", err.message);
    res.status(500).json({ ok: false, error: "Supplier ingest failed" });
  }
});

module.exports = router;
