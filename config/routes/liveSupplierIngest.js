const express = require("express");
const axios = require("axios");
const csv = require("csv-parser");
const stream = require("stream");
const redis = require("../redis");

const router = express.Router();
const QUEUE_KEY = process.env.QUEUE_KEY || "engine:queue";

/**
 * POST /api/supplier/ingest
 * Body (JSON):
 * {
 *   "source": "supplier-name",
 *   "feedUrl": "https://example.com/products.csv"
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
    console.log("📥 Supplier ingest started:", feedUrl);

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
            sku: row.SKU || row.sku || null,
            title: row.Title || row.title || "",
            price: Number(row.Price || row.price || 0),
            supplier: row.Supplier || source,
            timestamp: Date.now()
          };

          // Basic validation (safe)
          if (!product.sku || !product.title || product.price <= 0) {
            return;
          }

          await redis.lpush(QUEUE_KEY, JSON.stringify(product));
          jobsAdded++;
        } catch (e) {
          console.error("⚠️ Row error:", e.message);
        }
      })
      .on("end", () => {
        console.log(`✅ Supplier ingest finished. Jobs added: ${jobsAdded}`);
        res.json({
          ok: true,
          message: "Live supplier feed ingested",
          jobsAdded
        });
      });

  } catch (err) {
    console.error("❌ Supplier ingest error:", err.message);
    res.status(500).json({
      ok: false,
      error: "Supplier ingest failed"
    });
  }
});

module.exports = router;
