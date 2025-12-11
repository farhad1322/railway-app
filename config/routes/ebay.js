const express = require("express");
const { MARKETS, listMarkets, getMarket } = require("./ebayMarkets");

const router = express.Router();

// -----------------------
// Simple ping route
// -----------------------
router.get("/ping", (req, res) => {
  res.json({
    ok: true,
    message: "eBay automation backend skeleton is ready (UK + US).",
    supportedMarkets: Object.keys(MARKETS)
  });
});

// -----------------------
// List all supported markets
// -----------------------
router.get("/markets", (req, res) => {
  res.json({
    count: listMarkets().length,
    markets: listMarkets()
  });
});

// -----------------------
// Get details of a specific market
// Example: /api/ebay/market/UK
// -----------------------
router.get("/market/:code", (req, res) => {
  const code = req.params.code.toUpperCase();
  const market = getMarket(code);

  if (!market) {
    return res.status(404).json({
      ok: false,
      error: `Market '${code}' not found.`,
      supportedMarkets: Object.keys(MARKETS)
    });
  }

  res.json({
    ok: true,
    market
  });
});

module.exports = router;
