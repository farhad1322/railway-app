const express = require("express");
const axios = require("axios");
const csv = require("csv-parser");
const stream = require("stream");
const redis = require("../redis");

// ✅ CORRECT + ONLY scoring import
const { scoreWinner } = require("../workers/winnerScoring");

const router = express.Router();
const QUEUE_KEY = process.env.QUEUE_KEY || "engine:queue";

/**
 * POST /api/supplier/ingest
 */
router.post("/ingest", async (req, res) => {
  const { source = "supplier", feedUrl, mode } = req.body;

  if (!feedUrl) {
    return res.status(400).json({
      ok: false,
      error: "feedUrl is required"
    });
  }

  let jobsAdded = 0;
  let rejected = 0;
  let preview = [];

  try {
    console.log("📥 Supplier feed:", feedUrl);

    const response = await axios.get(feedUrl, {
      responseType: "stream",
      timeout: 30000
    });

    const pass = new stream.PassThrough();
    response.data.pipe(pass);

    pass
      .pipe(csv())
      .on("data", async (row) => {
        const product = {
          source,
          sku: row.SKU || row.sku || "",
          title: row.Title || row.title || "",
          price: Number(row.Price || row.price || 0),
          supplier: source,
          timestamp: Date.now()
        };

        const score = scoreWinner(product);

        // 🧪 TEST MODE (NO REDIS WRITE)
        if (mode === "test") {
          preview.push({ ...product, score });
          return;
        }

        if (score < 60) {
          rejected++;
          return;
        }

        await redis.lpush(QUEUE_KEY, JSON.stringify(product));
        jobsAdded++;
      })
      .on("end", () => {
        console.log("✅ Supplier ingest done");

        res.json({
          ok: true,
          mode: mode || "live",
          jobsAdded,
          rejected,
          preview: mode === "test" ? preview.slice(0, 10) : undefined
        });
      });

  } catch (err) {
    console.error("❌ Supplier ingest failed:", err.message);
    res.status(500).json({
      ok: false,
      error: "Supplier ingest failed",
      details: err.message
    });
  }
});

module.exports = router;
