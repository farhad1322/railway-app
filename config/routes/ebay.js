// config/routes/ebay.js

const express = require("express");
const { MARKETS, listMarkets, getMarket } = require("./ebayMarkets");
const { calculateProfit } = require("./profitCalculator");

const router = express.Router();

/**
 * Helper to safely resolve market info
 */
function resolveMarket(rawMarket) {
  const key = (rawMarket || "UK").toUpperCase();
  const info = typeof getMarket === "function" ? getMarket(key) : MARKETS[key];
  return info || MARKETS.UK || Object.values(MARKETS)[0];
}

// -----------------------------------------------------
// 1) Simple ping route  → GET /api/ebay/ping
// -----------------------------------------------------
router.get("/ping", (req, res) => {
  const supported =
    typeof listMarkets === "function"
      ? listMarkets().map((m) => m.code || m.id)
      : Object.keys(MARKETS);

  res.json({
    ok: true,
    message: "eBay automation backend skeleton is ready (UK + US).",
    supportedMarkets: supported,
  });
});

// -----------------------------------------------------
// 2) List all supported markets  → GET /api/ebay/markets
// -----------------------------------------------------
router.get("/markets", (req, res) => {
  if (typeof listMarkets === "function") {
    return res.json({ ok: true, markets: listMarkets() });
  }

  const markets = Object.keys(MARKETS).map((key) => ({
    id: key,
    ...(MARKETS[key] || {}),
  }));

  res.json({ ok: true, markets });
});

// -----------------------------------------------------
// 3) Competition summary  → GET /api/ebay/competition
//    Example:
//    /api/ebay/competition?q=iphone&market=UK
// -----------------------------------------------------
router.get("/competition", (req, res) => {
  const { q, market } = req.query;

  if (!q) {
    return res.status(400).json({
      ok: false,
      error: "Missing required query parameter ?q (search keyword).",
    });
  }

  const info = resolveMarket(market);
  const marketCode = info.code || info.id || market || "UK";

  const sampleSize = 50;
  const base = q.length + (marketCode === "US" ? 5 : 0);

  const totalItems = sampleSize + base;
  const uniqueSellers = Math.max(6, Math.round(sampleSize / 5));
  const avgPrice = Number((10 + base * 0.8).toFixed(2));
  const minPrice = Number((avgPrice * 0.6).toFixed(2));
  const maxPrice = Number((avgPrice * 1.4).toFixed(2));

  const competitionScore = Math.min(30, base + 5);
  const demandScore = Math.min(30, base + 8);
  const saturationScore = Math.min(
    30,
    Math.round((competitionScore + demandScore) / 2)
  );
  const opportunityScore = Math.max(
    0,
    100 - Math.round((competitionScore * 1.2 + saturationScore) / 2)
  );

  res.json({
    ok: true,
    query: q,
    market: marketCode,
    currency: info.currency || (marketCode === "US" ? "USD" : "GBP"),
    sampleSize,
    stats: {
      totalItems,
      uniqueSellers,
      avgPrice,
      minPrice,
      maxPrice,
    },
    scores: {
      competitionScore,
      demandScore,
      saturationScore,
      opportunityScore,
    },
  });
});

// -----------------------------------------------------
// 4) Profit calculator  → GET /api/ebay/profit
//
// Example:
// /api/ebay/profit?q=iphone&market=UK&buyPrice=10
//                   &sellPrice=19.99&shippingCost=2
// -----------------------------------------------------
router.get("/profit", (req, res) => {
  const { q, market, buyPrice, sellPrice, shippingCost, otherCost } = req.query;

  const buy = Number(buyPrice);
  const sell = Number(sellPrice);

  if (!Number.isFinite(buy) || !Number.isFinite(sell)) {
    return res.status(400).json({
      ok: false,
      error:
        "Missing or invalid buyPrice / sellPrice. Example: ?q=iphone&market=UK&buyPrice=10&sellPrice=19.99&shippingCost=2",
    });
  }

  const result = calculateProfit({
    query: q || "",
    market: market || "UK",
    buyPrice: buy,
    sellPrice: sell,
    shippingCost: shippingCost ? Number(shippingCost) : 0,
    otherCost: otherCost ? Number(otherCost) : 0,
  });

  res.json(result);
  /**
 * -----------------------------------------------------
 * Profit Calculator (Business Seller Model - Option B)
 * -----------------------------------------------------
 * Example:
 * GET /api/ebay/profit?market=UK&price=19.99&cost=8&shipping=2.50
 */

router.get("/profit", (req, res) => {
    const marketCode = req.query.market || "UK";
    const price = parseFloat(req.query.price || 0);
    const cost = parseFloat(req.query.cost || 0);
    const shipping = parseFloat(req.query.shipping || 0);

    const market = getMarket(marketCode);

    if (!market) {
        return res.status(400).json({
            ok: false,
            error: "Invalid market. Use UK or US.",
        });
    }

    // -----------------------------------------------------
    // BUSINESS SELLER FEES (OPTION B)
    // -----------------------------------------------------
    const ebayFeeRate = 0.128;   // 12.8%
    const fixedFee = market.currency === "GBP" ? 0.30 : 0.30; // £0.30 or $0.30

    // Calculate eBay fees
    const ebayFee = price * ebayFeeRate + fixedFee;

    // Profit formula
    const profit = price - cost - shipping - ebayFee;

    // Profit margin (%)
    const margin = (profit / price) * 100;

    res.json({
        ok: true,
        market: market.code,
        currency: market.currency,
        input: {
            price,
            cost,
            shipping,
        },
        fees: {
            ebayFeeRate: ebayFeeRate * 100 + "%",
            fixedFee,
            totalFees: ebayFee.toFixed(2),
        },
        result: {
            profit: profit.toFixed(2),
            margin: margin.toFixed(2) + "%",
        },
    });
});

});

module.exports = router;
