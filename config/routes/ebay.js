const express = require("express");
const { MARKETS, listMarkets, getMarket } = require("./ebayMarkets");

const router = express.Router();

/**
 * Simple ping – confirms eBay engine is alive
 * GET /api/ebay/ping
 */
router.get("/ping", (req, res) => {
  res.json({
    ok: true,
    message: "eBay automation backend skeleton is ready (UK + US).",
    supportedMarkets: Object.keys(MARKETS),
  });
});

/**
 * List all supported markets (UK + US)
 * GET /api/ebay/markets
 */
router.get("/markets", (req, res) => {
  res.json({
    ok: true,
    markets: listMarkets(),
    details: MARKETS,
  });
});

/**
 * Step 1 – SEARCH API (simple prototype)
 *
 * GET /api/ebay/search?q=iphone&market=UK
 *
 * For now this uses MOCK data (no real eBay API yet),
 * but the structure is the same as a real search engine.
 */
router.get("/search", (req, res) => {
  const q = (req.query.q || "").trim();
  const marketCode = (req.query.market || "UK").toUpperCase();

  if (!q) {
    return res.status(400).json({
      ok: false,
      error: "Missing required query parameter ?q=searchTerm",
    });
  }

  const market = getMarket(marketCode);
  if (!market) {
    return res.status(400).json({
      ok: false,
      error: `Unknown market '${marketCode}'. Use one of: ${listMarkets().join(
        ", "
      )}`,
    });
  }

  // ---- MOCK DATA (temporary until we connect real eBay API) ----
  const MOCK_ITEMS = [
    {
      id: "UK-IPHONE-15-128GB",
      title: "Apple iPhone 15 128GB - Unlocked - UK",
      price: 799,
      currency: "GBP",
      market: "UK",
      condition: "New",
      seller: "TopSeller_UK_1000+",
      competitionScore: 0.35, // 0 = no competition, 1 = very saturated
      url: "https://example.com/uk-iphone-15",
    },
    {
      id: "UK-IPHONE-13-64GB",
      title: "Apple iPhone 13 64GB - Refurbished - UK",
      price: 429,
      currency: "GBP",
      market: "UK",
      condition: "Refurbished",
      seller: "RefurbStore_UK",
      competitionScore: 0.55,
      url: "https://example.com/uk-iphone-13",
    },
    {
      id: "US-IPHONE-15-128GB",
      title: "Apple iPhone 15 128GB - Factory Unlocked - US",
      price: 749,
      currency: "USD",
      market: "US",
      condition: "New",
      seller: "US_Super_Store",
      competitionScore: 0.42,
      url: "https://example.com/us-iphone-15",
    },
    {
      id: "US-ANDROID-GAMING",
      title: "Gaming Android Phone 12GB RAM - US Stock",
      price: 299,
      currency: "USD",
      market: "US",
      condition: "New",
      seller: "AndroidKing_US",
      competitionScore: 0.28,
      url: "https://example.com/us-android-gaming",
    },
  ];

  const term = q.toLowerCase();

  // Filter by market + keyword in title
  const matches = MOCK_ITEMS.filter(
    (item) =>
      item.market === market.code &&
      item.title.toLowerCase().includes(term)
  );

  return res.json({
    ok: true,
    query: {
      q,
      market: market.code,
      siteId: market.siteId,
      marketplaceId: market.marketplaceId,
    },
    total: matches.length,
    items: matches,
  });
});

module.exports = router;
