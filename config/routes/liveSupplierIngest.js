const express = require("express");
const axios = require("axios");
const csv = require("csv-parser");
const stream = require("stream");
const redis = require("../redis");
const { scoreWinner } = require("../workers/winnerScoring");

const router = express.Router();
const QUEUE_KEY = process.env.QUEUE_KEY || "engine:queue";

router.post("/ingest", async (req, res) => {
  const { source = "supplier", feedUrl, mode = "live" } = req.body;

  if (!feedUrl) {
    return res.status(400).json({ ok: false, error: "feedUrl is required" });
  }

  let jobsAdded = 0;
  let rejected = 0;
  const inspected = [];

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
        const product = {
          source,
          sku: row.SKU || "",
          title: row.Title || "",
          price: Number(row.Price || 0),
          supplier: row.Supplier || source,
          timestamp: Date.now()
        };

        const score = scoreWinner(product);

        if (mode === "test") {
          inspected.push({ ...product, score });
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
        res.json({
          ok: true,
          mode,
          jobsAdded,
          rejected,
          inspected: mode === "test" ? inspected : undefined
        });
      });

  } catch (err) {
    res.status(500).json({
      ok: false,
      error: "Supplier ingest failed",
      details: err.message
    });
  }
});

module.exports = router;
