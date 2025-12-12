const express = require("express");
const { MARKETS, listMarkets, getMarket } = require("./ebayMarkets");

const router = express.Router();

/**
 * --------------------------------------------------------------
 * 0. PING — Check if API is alive
 * --------------------------------------------------------------
 */
router.get("/ping", (req, res) => {
    res.json({
        ok: true,
        message: "eBay automation backend is running (UK + US markets)",
        supportedMarkets: Object.keys(MARKETS),
    });
});

/**
 * --------------------------------------------------------------
 * 1. LIST MARKETS
 * GET /api/ebay/markets
 * --------------------------------------------------------------
 */
router.get("/markets", (req, res) => {
    res.json({
        ok: true,
        markets: listMarkets(),
    });
});

/**
 * --------------------------------------------------------------
 * 2. SEARCH ANALYSIS (Basic Engine)
 * GET /api/ebay/search?q=iphone&market=UK
 * --------------------------------------------------------------
 */
router.get("/search", (req, res) => {
    const q = req.query.q;
    const market = req.query.market || "UK";

    if (!q) {
        return res.json({
            ok: false,
            error: "Missing query ?q=keyword",
        });
    }

    res.json({
        ok: true,
        q,
        market,
        stats: {
            totalItems: 50,
            uniqueSellers: 12,
            avgPrice: 17.5,
            minPrice: 8,
            maxPrice: 28,
        },
        scores: {
            demandScore: 40,
            competitionScore: 22,
            saturationScore: 25,
            opportunityScore: 43,
        }
    });
});

/**
 * --------------------------------------------------------------
 * 3. COMPETITION ANALYSIS
 * GET /api/ebay/competition?q=iphone&market=UK
 * --------------------------------------------------------------
 */
router.get("/competition", (req, res) => {
    const q = req.query.q;
    const market = req.query.market || "UK";

    res.json({
        ok: true,
        query: q,
        market,
        currency: market === "US" ? "USD" : "GBP",
        sampleSize: 50,
        stats: {
            totalItems: 50,
            uniqueSellers: 10,
            avgPrice: 19.6,
            minPrice: 13,
            maxPrice: 27,
        },
        scores: {
            competitionScore: 20,
            demandScore: 25,
            saturationScore: 22,
            opportunityScore: 78
        }
    });
});

/**
 * --------------------------------------------------------------
 * 4. PROFIT CALCULATOR
 * GET /api/ebay/profit?market=UK&buyPrice=10&sellPrice=20&shipping=2
 * --------------------------------------------------------------
 */
router.get("/profit", (req, res) => {
    const marketCode = req.query.market || "UK";
    const buy = parseFloat(req.query.buyPrice);
    const sell = parseFloat(req.query.sellPrice);
    const shippingCost = parseFloat(req.query.shipping || 0);
    const otherCost = parseFloat(req.query.cost || 0);

    if (isNaN(buy) || isNaN(sell)) {
        return res.json({
            ok: false,
            error: "Missing or invalid buyPrice / sellPrice"
        });
    }

    const market = getMarket(marketCode);
    const fee = market.feePercent;
    const currency = market.currency;

    const feeAmount = sell * (fee / 100);
    const profit = sell - buy - feeAmount - shippingCost - otherCost;

    res.json({
        ok: true,
        market: marketCode,
        currency,
        buyPrice: buy,
        sellPrice: sell,
        feePercent: fee,
        feeAmount,
        shippingCost,
        otherCost,
        profit
    });
});

/**
 * --------------------------------------------------------------
 * 5. BESTSELLER (Chance Finder)
 * GET /api/ebay/bestseller?q=hair+dryer&market=US
 * --------------------------------------------------------------
 */
router.get("/bestseller", (req, res) => {
    const q = req.query.q;
    const market = req.query.market;

    res.json({
        ok: true,
        query: q,
        market,
        currency: market === "US" ? "USD" : "GBP",
        sampleSize: 52,
        stats: {
            totalItems: 52,
            uniqueSellers: 20,
            avgPrice: 20,
            minPrice: 17,
            maxPrice: 24,
        },
        scores: {
            demandScore: 26,
            competitionScore: 15,
            saturationScore: 38,
            opportunityScore: 33
        },
        decision: {
            rating: "D",
            verdict: "Poor – avoid this product, look for a different angle."
        }
    });
});

/**
 * --------------------------------------------------------------
 * 6. WINNER PRODUCT FINDER — Top 5 winners
 * GET /api/ebay/winners?market=UK
 * --------------------------------------------------------------
 */
router.get("/winners", (req, res) => {
    const marketCode = req.query.market || "UK";

    const keywords = [
        "water bottle",
        "usb hub",
        "screwdriver set",
        "portable blender",
        "air fryer"
    ];

    // fake scoring system to simulate winner detection
    const results = keywords.map(k => ({
        keyword: k,
        demandScore: Math.floor(Math.random() * 50 + 20),
        competitionScore: Math.floor(Math.random() * 40 + 5),
        saturationScore: Math.floor(Math.random() * 40 + 5),
        opportunityScore: Math.floor(Math.random() * 60 + 20),
    }));

    results.sort((a, b) => b.opportunityScore - a.opportunityScore);

    const winners = results.slice(0, 5);

    res.json({
        ok: true,
        market: marketCode,
        winnersCount: winners.length,
        winners
    });
});

/**
 * --------------------------------------------------------------
 * 7. AUTO-SCAN ENGINE (NEW)
 * GET /api/ebay/auto-scan?market=UK
 * --------------------------------------------------------------
 */
router.get("/auto-scan", (req, res) => {
    const market = req.query.market || "UK";

    const keywords = [
        "power bank",
        "phone stand",
        "tripod",
        "led strip",
        "usb c cable",
        "cat toy",
        "mini heater",
        "makeup organizer"
    ];

    const results = keywords.map(k => ({
        keyword: k,
        demandScore: Math.floor(Math.random() * 50 + 30),
        competitionScore: Math.floor(Math.random() * 40 + 10),
        saturationScore: Math.floor(Math.random() * 30 + 5),
        opportunityScore: Math.floor(Math.random() * 60 + 20),
    }));

    results.sort((a, b) => b.opportunityScore - a.opportunityScore);

    res.json({
        ok: true,
        market,
        top10: results.slice(0, 10)
    });
});

/**
 * --------------------------------------------------------------
 * 8. COMPETITOR WATCHER (NEW)
 * GET /api/ebay/competitors?q=air+fryer
 * --------------------------------------------------------------
 */
router.get("/competitors", (req, res) => {
    const q = req.query.q;

    res.json({
        ok: true,
        query: q,
        competitors: [
            { seller: "BestDealsUK", price: 25.99, sold: 520 },
            { seller: "ProHomeStore", price: 27.49, sold: 310 },
            { seller: "QualityMart", price: 23.99, sold: 440 }
        ]
    });
});

/**
 * --------------------------------------------------------------
 * 9. PRICING SUGGESTION ENGINE (NEW)
 * GET /api/ebay/pricing-suggest?market=US&buy=10
 * --------------------------------------------------------------
 */
router.get("/pricing-suggest", (req, res) => {
    const buy = parseFloat(req.query.buy);
    const market = req.query.market || "US";

    const fee = market === "US" ? 13 : 12;
    const currency = market === "US" ? "USD" : "GBP";

    const recommended = buy * 2.7;   // 270% markup formula
    const minSafe = buy * 1.9;       // do not go below
    const highDemandBoost = recommended + 3;

    res.json({
        ok: true,
        market,
        currency,
        buy,
        recommendedPrice: recommended.toFixed(2),
        highDemandPrice: highDemandBoost.toFixed(2),
        minimumSafePrice: minSafe.toFixed(2),
        feePercent: fee
    });
});

module.exports = router;
