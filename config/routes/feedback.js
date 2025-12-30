// config/routes/feedback.js
// Sales feedback + velocity-based repricing (SAFE MODE)

const express = require("express");
const redis = require("../redis");
const winnerMemory = require("../services/winnerMemory");
const { recordSale, recommendPriceAdjustment } = require("../services/salesVelocityService");

const router = express.Router();

/**
 * POST /api/feedback/sale
 * Body:
 * {
 *   "sku": "TEST-SKU-1",
 *   "currentPrice": 12.99,
 *   "hoursToSale": 8,
 *   "profit": 7,
 *   "sold": true
 * }
 */
router.post("/sale", async (req, res) => {
  try {
    const {
      sku,
      currentPrice,
      hoursToSale,
      profit,
      sold
    } = req.body;

    if (!sku || currentPrice == null || hoursToSale == null) {
      return res.status(400).json({
        ok: false,
        error: "sku, currentPrice, and hoursToSale are required"
      });
    }

    /* =========================
       RECORD SALE VELOCITY
    ========================= */
    let velocityInfo = null;
    let repricing = null;

    if (sold === true) {
      velocityInfo = await recordSale({
        sku,
        hoursToSale,
        profit: profit || 0
      });

      // Mark as winner
      await winnerMemory.markWinner(sku, profit || 0);

      // Recommend repricing
      repricing = recommendPriceAdjustment({
        currentPrice: Number(currentPrice),
        velocity: velocityInfo.velocity
      });
    } else {
      // Mark loser if explicitly not sold
      await winnerMemory.markLoser(sku);
    }

    res.json({
      ok: true,
      sku,
      sold,
      velocity: velocityInfo?.velocity || "none",
      repricing,
      profit: profit || 0
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
