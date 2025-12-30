// config/routes/feedback.js

const express = require("express");
const redis = require("../redis");
const winnerMemory = require("../services/winnerMemory");

const router = express.Router();

/**
 * TEST SALES FEEDBACK (SAFE)
 * POST /api/feedback/sale
 */
router.post("/sale", async (req, res) => {
  try {
    const { sku, sold, profit } = req.body;

    if (!sku) {
      return res.status(400).json({
        ok: false,
        error: "SKU is required"
      });
    }

    // Track velocity
    const velocityKey = `sales:velocity:${sku}`;
    if (sold === true) {
      await redis.incr(velocityKey);
      await redis.expire(velocityKey, 60 * 60 * 24 * 7); // 7 days
    }

    // Update winner memory
    if (sold === true) {
      await winnerMemory.markWinner(sku, profit || 0);
    } else {
      await winnerMemory.markLoser(sku);
    }

    res.json({
      ok: true,
      message: "Sales feedback recorded",
      sku,
      sold,
      profit: profit || 0
    });

  } catch (err) {
    console.error("Feedback error:", err);
    res.status(500).json({
      ok: false,
      error: "Feedback processing failed"
    });
  }
});

module.exports = router;
