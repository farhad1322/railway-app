// config/routes/testFeedback.js
const express = require("express");
const redis = require("../redis");

const router = express.Router();

/**
 * TEST SALES FEEDBACK ENDPOINT
 * SAFE — no real money, no eBay API
 */
router.post("/sale", async (req, res) => {
  try {
    const payload = {
      sku: req.body.sku,
      sold: Boolean(req.body.sold),
      profit: Number(req.body.profit || 0),
      at: new Date().toISOString()
    };

    await redis.lpush(
      "engine:sales:feedback",
      JSON.stringify(payload)
    );

    res.json({
      ok: true,
      message: "Feedback pushed to engine",
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
