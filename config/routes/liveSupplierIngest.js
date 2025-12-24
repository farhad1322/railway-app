const express = require("express");
const axios = require("axios");
const csv = require("csv-parser");
const stream = require("stream");
const redis = require("../redis");

const { scoreWinner } = require("../workers/winnerScoring");

const router = express.Router();
const QUEUE_KEY = process.env.QUEUE_KEY || "engine:queue";

router.post("/ingest", async (req, res) => {
  const { source = "supplier", feedUrl } = req.body;

  if (!feedUrl) {
    return res.status(400).json({ ok: false, error: "feedUrl is required" });
  }

  let jobsAdded = 0;

  try {
    const response = await axios.get(feedUrl, {
      responseType: "stream",
      timeout: 30000
    });

    response.data
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
        if (score < 60) return;

        await redis.lpush(QUEUE_KEY, JSON.stringify(product));
        jobsAdded++;
      })
      .on("end", () => {
        res.json({ ok: true, jobsAdded });
      });

  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Supplier ingest failed" });
  }
});

module.exports = router;
