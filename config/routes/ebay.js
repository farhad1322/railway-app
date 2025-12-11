// config/routes/ebay.js

const express = require("express");
const router = express.Router();

// Market configuration helper
const { MARKETS, listMarkets, getMarket } = require("./ebayMarkets");

// ---------------------------
// Helpers
// ---------------------------

// Pick a market, default = UK
function pickMarket(codeFromQuery) {
  const code = (codeFromQuery || "UK").toUpperCase();
  return getMarket(code) || getMarket("UK");
}

// Safe number
function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// ---------------------------
// Simple health check
// GET /api/ebay/ping
// ---------------------------
router.get("/ping", (req, res) => {
  const marketCodes = Object.keys(MARKETS);
  res.json({
    ok: true,
    message: "eBay automation backend skeleton is ready (UK + US).",
    supportedMarkets: marketCodes,
  });
});

// ---------------------------
// List all supported markets
// GET /api/ebay/markets
// ---------------------------
router.get("/markets", (req, res) => {
  res.json({
    ok: true,
    markets: listMarkets(),
  });
});

// =====================================================
// SEARCH API
// GET /api/ebay/search?q=iphone&market=UK
// =====================================================

router.get("/search", async (req, res) => {
  const keyword = (req.query.q || "").trim();
  const market = pickMarket(req.query.market);

  if (!keyword) {
    return res.status(400).json({
      ok: false,
      error: "Missing required query parameter: q (search keyword)",
    });
  }

  try {
    const items = await searchEbayItems({
      keyword,
      market,
      limit: toNumber(req.query.limit, 30),
    });

    res.json({
      ok: true,
      query: keyword,
      market: market.code,
      currency: market.currency,
      totalItems: items.length,
      items,
    });
  } catch (err) {
    console.error("Search route error:", err);
    res.status(500).json({
      ok: false,
      error: "Failed to search eBay items",
      details: err.message,
    });
  }
});

// -----------------------------------------------------
// Helper: real eBay search (if EBAY_APP_ID set)
// or mock data (if not set yet)
// -----------------------------------------------------
async function searchEbayItems({ keyword, market, limit = 30 }) {
  // If you did NOT add EBAY_APP_ID in Railway → Variables,
  // we return mock data so you can still test the system.
  if (!process.env.EBAY_APP_ID) {
    return buildMockResults(keyword, market, limit);
  }

  const params = new URLSearchParams({
    "OPERATION-NAME": "findItemsByKeywords",
    "SERVICE-VERSION": "1.13.0",
    "SECURITY-APPNAME": process.env.EBAY_APP_ID,
    "RESPONSE-DATA-FORMAT": "JSON",
    "REST-PAYLOAD": "true",
    keywords: keyword,
    "paginationInput.entriesPerPage": String(limit),
    "GLOBAL-ID": market.globalId || "EBAY-GB",
  });

  const url =
    "https://svcs.ebay.com/services/search/FindingService/v1?" +
    params.toString();

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`eBay API error: ${response.status}`);
  }

  const data = await response.json();
  const raw =
    data?.findItemsByKeywordsResponse?.[0]?.searchResult?.[0]?.item || [];

  // Normalise items into a simple structure
  const items = raw.map((item, index) => {
    const priceObj =
      item.sellingStatus?.[0]?.currentPrice?.[0] || {};
    const price = toNumber(priceObj.__value__, 0);
    const currency = priceObj["@currencyId"] || market.currency;

    return {
      id: item.itemId?.[0] || `item-${index}`,
      title: item.title?.[0] || "Untitled item",
      price,
      currency,
      seller: item.sellerInfo?.[0]?.sellerUserName?.[0] || "unknown",
      listingUrl: item.viewItemURL?.[0] || null,
    };
  });

  return items;
}

// -----------------------------------------------------
// MOCK results (used when EBAY_APP_ID is not set yet)
// -----------------------------------------------------
function buildMockResults(keyword, market, limit = 30) {
  const items = [];
  const basePrice = 20;

  for (let i = 0; i < limit; i++) {
    const price =
      basePrice +
      Math.round((Math.random() - 0.5) * 15); // ±7.5 variation

    items.push({
      id: `mock-${keyword}-${i + 1}`,
      title: `${keyword} sample item #${i + 1}`,
      price: Math.max(5, price),
      currency: market.currency,
      seller: `seller_${(i % 10) + 1}`,
      listingUrl: null,
    });
  }

  return items;
}

// =====================================================
// COMPETITION SCANNER
// GET /api/ebay/competition?q=iphone&market=UK
// =====================================================

router.get("/competition", async (req, res) => {
  const keyword = (req.query.q || "").trim();
  const market = pickMarket(req.query.market);

  if (!keyword) {
    return res.status(400).json({
      ok: false,
      error: "Missing required query parameter: q (search keyword)",
    });
  }

  try {
    // Re-use the search helper to get items
    const items = await searchEbayItems({
      keyword,
      market,
      limit: toNumber(req.query.limit, 50),
    });

    const analysis = analyzeCompetition(items, market);

    res.json({
      ok: true,
      query: keyword,
      market: market.code,
      currency: market.currency,
      sampleSize: items.length,
      ...analysis,
    });
  } catch (err) {
    console.error("Competition route error:", err);
    res.status(500).json({
      ok: false,
      error: "Failed to analyse competition",
      details: err.message,
    });
  }
});

// -----------------------------------------------------
// Helper: Competition analysis + scores
// -----------------------------------------------------
function analyzeCompetition(items, market) {
  if (!items || items.length === 0) {
    return {
      stats: {
        totalItems: 0,
        uniqueSellers: 0,
        avgPrice: 0,
        minPrice: 0,
        maxPrice: 0,
      },
      scores: {
        competitionScore: 0,
        demandScore: 0,
        saturationScore: 0,
        opportunityScore: 0,
      },
    };
  }

  const prices = items
    .map((i) => toNumber(i.price, 0))
    .filter((p) => p > 0);

  const totalItems = items.length;
  const uniqueSellers = new Set(
    items.map((i) => i.seller || "unknown")
  ).size;

  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;
  const avgPrice = prices.length
    ? prices.reduce((a, b) => a + b, 0) / prices.length
    : 0;

  // Simple scoring model 0–100
  const competitionScore = Math.min(
    100,
    Math.round((uniqueSellers / 50) * 100)
  ); // many sellers → high score
  const demandScore = Math.min(
    100,
    Math.round((totalItems / 200) * 100)
  ); // many listings → high demand
  const saturationScore = Math.round(
    competitionScore * 0.6 + demandScore * 0.4
  );
  const opportunityScore = 100 - saturationScore;

  return {
    stats: {
      totalItems,
      uniqueSellers,
      avgPrice: Number(avgPrice.toFixed(2)),
      minPrice,
      maxPrice,
    },
    scores: {
      competitionScore,
      demandScore,
      saturationScore,
      opportunityScore,
    },
  };
}

// ---------------------------
module.exports = router;
