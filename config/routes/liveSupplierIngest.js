const express = require("express");
const axios = require("axios");
const csv = require("csv-parser");
const stream = require("stream");
const redis = require("../redis");

const router = express.Router();
const QUEUE_KEY = process.env.QUEUE_KEY || "engine:queue";

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
      timeout: 20000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Railway Bot)",
        "Accept": "text/csv,text/plain"
      },
      validateStatus: (status) => status === 200
    });

    const pass = new stream.PassThrough();
    response.data.pipe(pass);

    pass
      .pipe(csv())
      .on("data", async (row) => {
        try {
          const sku = row.SKU || row.sku || row.id;
          const title = row.Title || row.title || row.name;
          const price = Number(row.Price || row.price || 0);

          if (!sku || !title || price <= 0) return;

          const product = {
            source,
            sku,
            title,
            price,
            supplier: source,
            timestamp: Date.now()
          };

          await redis.lpush(QUEUE_KEY, JSON.stringify(product));
          jobsAdded++;
        } catch (e) {
          console.error("⚠️ Row parse error:", e.message);
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
