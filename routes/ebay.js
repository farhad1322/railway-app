const express = require("express");
const { MARKETS, listMarkets, getMarket } = require("../config/ebayMarkets");

const router = express.Router();

router.get("/ping", (req, res) => {
  res.json({
    ok: true,
    message: "eBay automation backend skeleton is ready (UK + US).",
    supportedMarkets: Object.keys(MARKETS)
  });
});

router.get("/markets", (req, res) => {
  res.json({
    count: listMarkets().length,
    markets: listMarkets()
  });
});

router.get("/markets/:code", (req, res) => {
  const market = getMarket(req.params.code);

  if (!market) {
    return res.status(404).json({
      ok: false,
      error: "Unknown market code. Use 'UK' or 'US'."
    });
  }

  res.json({
    ok: true,
    market
  });
});

router.get("/todo", (req, res) => {
  res.json({
    ok: true,
    message: "Here we will add product research, listing, pricing, and orders APIs."
  });
});

module.exports = router;
