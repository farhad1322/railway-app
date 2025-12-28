const express = require("express");
const router = express.Router();
const redis = require("../redis");

const QUEUE_KEY = process.env.QUEUE_KEY || "engine:queue";

/**
 * TEST ENDPOINT — PUSH FAKE PRODUCT TO QUEUE
 * SAFE — does NOT touch eBay or AutoDS
 */
router.post("/push", async (req, res) => {
  try {
    const payload = {
      sku: req.body.sku || "TEST-SKU-001",
      title: req.body.title || "Test Product",
      price: Number(req.body.price || 10),
      cost: Number(req.body.cost || 7),
      score: Number(req.body.score || 80),
      createdAt: new Date().toISOString()
    };

    await redis.lpush(QUEUE_KEY, JSON.stringify(payload));

    res.json({
      ok: true,
      message: "Test product pushed to engine queue",
      payload
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

module.exports = router;
