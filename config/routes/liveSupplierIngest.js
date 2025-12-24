const express = require("express");
const axios = require("axios");
const csv = require("csv-parser");
const stream = require("stream");
const redis = require("../redis");

// ✅ CORRECT IMPORT
const scoreWinner = require("../workers/winnerScoring");


const router = express.Router();
const QUEUE_KEY = process.env.QUEUE_KEY || "engine:queue";

/**
 * POST /api/supplier/ingest
 * Body:
 * {
 *   "source": "supplier-name",
 *   "feedUrl": "https://example.com/feed.csv"
 * }
 */
router.post("/ingest", async (req, res) => {
  const { source = "supplier", feedUrl } = req.body;

  if (!feedUrl) {
    return res.status(400).json({
      ok: false,
      error: "feedUrl is required"
    });
  }

  let jobsAdded = 0;

  try {
    console.log("📥 Fetching supplier feed:", feedUrl);

    const response = await axios.get(feedUrl, {
      responseType: "stream",
      timeout: 30000
    });

    const pass = new stream.PassThrough();
    response.data.pipe(pass);

    pass
      .pipe(csv())
      .on("data", async (row) => {
        try {
          const product = {
            source,
            sku: row.SKU || row.sku || "",
            title: row.Title || row.title || "",
            price: Number(row.Price || row.price || 0),
            supplier: source,
            timestamp: Date.now()
          };

          const score = scoreWinner(product);

          // ❌ Reject weak products (EXPECTED)
          if (score < 60) return;

          await redis.lpush(QUEUE_KEY, JSON.stringify(product));
          jobsAdded++;
        } catch (rowErr) {
          console.error("Row error:", rowErr.message);
        }
      })
      .on("end", () => {
        console.log(`✅ Supplier ingest finished. Jobs added: ${jobsAdded}`);
        res.json({
          ok: true,
          message: "Supplier feed ingested",
          jobsAdded
        });
      });

  } catch (err) {
    console.error("❌ Supplier ingest failed:", err.message);
    res.status(500).json({
      ok: false,
      error: "Supplier ingest failed"
    });
  }
});

module.exports = router;
