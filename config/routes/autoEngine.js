const express = require("express");
const router = express.Router();
const { getMarket } = require("./ebayMarkets");

/**
 * ---------------------------------------------------------
 * ULTRA AI AUTO ENGINE (Option C - Master System)
 * Combines:
 *  - Demand Engine
 *  - Competition Engine
 *  - Saturation Engine
 *  - Profit Engine
 *  - Final Verdict AI
 * ---------------------------------------------------------
 * Endpoint:
 * GET /api/ebay/auto?q=iphone&market=UK&buy=10&sell=19.99&ship=2
 * ---------------------------------------------------------
 */

router.get("/auto", (req, res) => {
    const q = (req.query.q || "").toLowerCase();
    const marketCode = req.query.market || "UK";

    const buy = parseFloat(req.query.buy || 0);
    const sell = parseFloat(req.query.sell || 0);
    const ship = parseFloat(req.query.ship || 0);

    const market = getMarket(marketCode);

    if (!q) {
        return res.json({
            ok: false,
            error: "Missing keyword. Example: ?q=iphone&market=UK&buy=8&sell=19.99&ship=2"
        });
    }

    // Fake sample dataset — later connect to eBay API
    const sampleSize = 40;
    const totalSellers = Math.floor(5 + Math.random() * 20);
    const avgPrice = (sell + buy) / 2 || (8 + Math.random() * 20);

    // AI–style scoring
    const demandScore = Math.floor(20 + Math.random() * 40);
    const competitionScore = Math.floor(5 + Math.random() * 30);
    const saturationScore = Math.floor(10 + Math.random() * 40);
    const opportunityScore = demandScore - competitionScore;

    // Profit Logic
    const ebayFeeRate = 0.13; // 13%
    const fee = sell * ebayFeeRate;
    const totalCost = buy + ship + fee;
    const profit = sell - totalCost;

    const profitScore = profit > 0 ? Math.floor(profit * 5) : 0;

    // ⚡ FINAL VERDICT ENGINE
    let rating = "C";
    let verdict = "Average product.";

    if (opportunityScore > 45 && profit > 5) {
        rating = "A";
        verdict = "Excellent opportunity — High profit + strong demand.";
    } else if (opportunityScore > 30 && profit > 2) {
        rating = "B";
        verdict = "Good — possible winning product if listed correctly.";
    } else if (profit <= 0) {
        rating = "D";
        verdict = "Not profitable — avoid this item.";
    } else {
        rating = "C";
        verdict = "Medium. Needs better supplier cost or better angle.";
    }

    // OUTPUT
    res.json({
        ok: true,
        keyword: q,
        market: marketCode,
        currency: market.currency,
        sampleSize,
        metrics: {
            demandScore,
            competitionScore,
            saturationScore,
            opportunityScore,
            profit,
            profitScore,
        },
        decision: {
            rating,
            verdict
        }
    });
});

module.exports = router;
