// config/routes/testFeedback.js
const express = require("express");
const router = express.Router();

const winnerMemory = require("../services/winnerMemory");
const redis = require("../redis");

/**
 * TEST FEEDBACK ENDPOINT (SAFE)
 * This simulates a sale or failure signal
 */
router.post("/sale", async (req, res) => {
  try {
    const { sku, sold, profit } = req.body;

    if (!sku) {
      return res.status(400).json({
        ok: false,
        error: "sku is required"
      });
    }

    if (sold === true) {
      await winnerMemory.markWinner(sku, profit || 0);

      await redis.incr(`feedback:wins:${sku}`);

      return res.json({
        ok: true,
        message: "Winner feedback applied",
        sku,
        profit: profit || 0
      });
    }

    // NOT SOLD → penalize
    await winnerMemory.markLoser(sku);
    await redis.incr(`feedback:losses:${sku}`);

    return res.json({
      ok: true,
      message: "Loser feedback applied",
      sku
    });

  } catch (err) {
    console.error("Feedback error:", err.message);
    res.status(500).json({
      ok: false,
      error: "Feedback processing failed"
    });
  }
});

module.exports = router;
