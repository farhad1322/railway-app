// config/routes/autoEngine.js
// High-level smart engine for Amazon→eBay sourcing, autopricing & dashboard

const express = require("express");
const router = express.Router();

/**
 * Small helper to safely convert query values into numbers
 */
function num(value, fallback = 0) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

/* ------------------------------------------------------------------ */
/* A) AMAZON → EBAY REVERSE SOURCING ENGINE                           */
/* ------------------------------------------------------------------ */
/**
 * GET /api/engine/source/amazon-ebay
 *
 * Example:
 *   /api/engine/source/amazon-ebay?q=iphone+case&market=UK&amazonPrice=5.99&amazonShipping=0
 *
 * Required:
 *   q             -> keyword
 *   amazonPrice   -> Amazon product price
 *
 * Optional:
 *   amazonShipping -> Amazon shipping cost
 *   market         -> "UK" or "US" (default "UK")
 */
router.get("/source/amazon-ebay", (req, res) => {
  const q = (req.query.q || "").trim();
  const market = (req.query.market || "UK").toUpperCase();
  const amazonPrice = num(req.query.amazonPrice);
  const amazonShipping = num(req.query.amazonShipping);

  if (!q || !amazonPrice) {
    return res.status(400).json({
      ok: false,
      error:
        "Missing q or amazonPrice. Example: ?q=iphone+case&market=UK&amazonPrice=5.99&amazonShipping=0",
    });
  }

  const currency = market === "US" ? "USD" : "GBP";

  // Base markup & fee assumptions – you can tweak these later
  const baseMarkup = market === "US" ? 1.6 : 1.7; // Sell for ~60–70% above Amazon cost
  const feePercent = market === "US" ? 12 : 13; // eBay + payment + other

  const totalCost = amazonPrice + amazonShipping;
  const recommendedSellPrice = +(totalCost * baseMarkup).toFixed(2);
  const feeAmount = +((recommendedSellPrice * feePercent) / 100).toFixed(2);
  const estimatedProfit = +(recommendedSellPrice - totalCost - feeAmount).toFixed(2);

  const roiPercent =
    totalCost > 0 ? +((estimatedProfit / totalCost) * 100).toFixed(2) : 0;

  // Build an overall opportunity score & verdict
  let rating = "C";
  let verdict = "Average – might be OK with good optimisation.";

  if (estimatedProfit <= 0 || roiPercent < 10) {
    rating = "D";
    verdict = "Weak – low or negative profit. Look for another angle or product.";
  } else if (roiPercent >= 40 && estimatedProfit >= 10) {
    rating = "A";
    verdict = "Strong – excellent margin, high-priority sourcing candidate.";
  } else if (roiPercent >= 25) {
    rating = "B";
    verdict = "Good – profitable, keep under monitoring.";
  }

  const opportunityScore = Math.max(
    0,
    Math.min(100, Math.round(roiPercent + estimatedProfit))
  );

  res.json({
    ok: true,
    engine: "amazon-ebay-reverse-sourcing",
    query: q,
    market,
    currency,
    inputs: {
      amazonPrice,
      amazonShipping,
      baseMarkup,
      feePercent,
    },
    outputs: {
      recommendedEbayPrice: recommendedSellPrice,
      feeAmount,
      estimatedProfit,
      roiPercent,
      opportunityScore,
      rating,
      verdict,
    },
  });
});

/* ------------------------------------------------------------------ */
/* B) SMART AUTOPRICING ENGINE                                        */
/* ------------------------------------------------------------------ */
/**
 * GET /api/engine/pricing/auto
 *
 * Example:
 *   /api/engine/pricing/auto?market=UK&currentPrice=19.99&cost=8&demandLevel=70&competitionLevel=30
 *
 * Required:
 *   currentPrice       -> your current listing price
 *
 * Optional:
 *   cost               -> your total cost (buy + shipping + fees you know)
 *   demandLevel        -> 0–100 (how strong is demand)
 *   competitionLevel   -> 0–100 (how strong is competition)
 *   minMarginPercent   -> minimum profit margin you accept (default 18)
 *   maxChangePercent   -> max % up/down we allow (default 20%)
 */
router.get("/pricing/auto", (req, res) => {
  const market = (req.query.market || "UK").toUpperCase();
  const currentPrice = num(req.query.currentPrice);
  const cost = num(req.query.cost);
  const demandLevel = num(req.query.demandLevel, 50); // 0–100
  const competitionLevel = num(req.query.competitionLevel, 50); // 0–100
  const minMarginPercent = num(req.query.minMarginPercent, 18);
  const maxChangePercent = num(req.query.maxChangePercent, 20); // cap move

  if (!currentPrice) {
    return res.status(400).json({
      ok: false,
      error:
        "Missing currentPrice. Example: ?market=UK&currentPrice=19.99&cost=8&demandLevel=70&competitionLevel=30",
    });
  }

  // Pressure > 0  => demand > competition => we can increase price
  // Pressure < 0  => competition > demand => we should reduce price
  const pressure = demandLevel - competitionLevel; // -100 .. +100
  let rawAdjustment = pressure / 200; // -0.5 .. +0.5 ( -50% .. +50% )

  const maxAdj = maxChangePercent / 100;
  if (rawAdjustment > maxAdj) rawAdjustment = maxAdj;
  if (rawAdjustment < -maxAdj) rawAdjustment = -maxAdj;

  const suggestedPrice = +(currentPrice * (1 + rawAdjustment)).toFixed(2);
  const changePercent = +(
    ((suggestedPrice - currentPrice) / currentPrice) *
    100
  ).toFixed(2);

  let strategy = "hold";
  if (changePercent > 1) strategy = "increase";
  else if (changePercent < -1) strategy = "decrease";

  // Margin based on cost if provided
  let currentMarginPercent = null;
  let suggestedMarginPercent = null;

  if (cost > 0) {
    currentMarginPercent = +(
      ((currentPrice - cost) / currentPrice) *
      100
    ).toFixed(2);
    suggestedMarginPercent = +(
      ((suggestedPrice - cost) / suggestedPrice) *
      100
    ).toFixed(2);
  }

  const marginOK =
    suggestedMarginPercent === null ||
    suggestedMarginPercent >= minMarginPercent;

  res.json({
    ok: true,
    engine: "smart-autopricer",
    market,
    inputs: {
      currentPrice,
      cost,
      demandLevel,
      competitionLevel,
      minMarginPercent,
      maxChangePercent,
    },
    outputs: {
      suggestedPrice,
      changePercent,
      strategy,
      currentMarginPercent,
      suggestedMarginPercent,
      marginOK,
      notes: [
        strategy === "increase"
          ? "Demand is stronger than competition – system recommends a price increase."
          : strategy === "decrease"
          ? "Competition is strong vs demand – system recommends a price decrease to stay competitive."
          : "Price is balanced – hold and monitor.",
        !marginOK
          ? "Warning: suggested price would break your minimum margin."
          : "Margin is within your minimum target.",
      ],
    },
  });
});

/* ------------------------------------------------------------------ */
/* E) MASTER DASHBOARD & PREMIUM ANALYTICS                            */
/* ------------------------------------------------------------------ */
/**
 * GET /api/engine/dashboard/summary
 *
 * Example:
 *   /api/engine/dashboard/summary?market=UK&revenue7d=500&profit7d=130&orders7d=40&activeListings=80&winningListings=12
 *
 * Optional metrics (you can pass what you have):
 *   revenue7d        -> total sales last 7 days
 *   profit7d         -> total profit last 7 days
 *   orders7d         -> number of orders last 7 days
 *   activeListings   -> how many active listings you have
 *   winningListings  -> how many listings are real “winners”
 */
router.get("/dashboard/summary", (req, res) => {
  const market = (req.query.market || "UK").toUpperCase();

  const revenue7d = num(req.query.revenue7d);
  const profit7d = num(req.query.profit7d);
  const orders7d = num(req.query.orders7d);
  const activeListings = num(req.query.activeListings);
  const winningListings = num(req.query.winningListings);

  const avgOrderValue =
    orders7d > 0 ? +(revenue7d / orders7d).toFixed(2) : 0;
  const profitMarginPercent =
    revenue7d > 0 ? +((profit7d / revenue7d) * 100).toFixed(2) : 0;
  const winRatePercent =
    activeListings > 0
      ? +((winningListings / activeListings) * 100).toFixed(2)
      : 0;

  // Seller health score 0–100 (simple but effective)
  let healthScore = 50;
  healthScore += (profitMarginPercent - 15) * 0.8;
  healthScore += (winRatePercent - 10) * 0.6;
  healthScore = Math.max(0, Math.min(100, Math.round(healthScore)));

  let stage = "Building";
  if (healthScore >= 80) stage = "Elite seller";
  else if (healthScore >= 60) stage = "Scaling";
  else if (healthScore >= 40) stage = "Early growth";

  const suggestions = [];

  if (profitMarginPercent < 15) {
    suggestions.push(
      "Increase prices on best sellers or reduce sourcing / shipping cost – margin is below 15%."
    );
  } else if (profitMarginPercent < 25) {
    suggestions.push(
      "Good margin, but you can push a bit higher on strong items (test +5–10% price increases)."
    );
  } else {
    suggestions.push(
      "Excellent margin. Focus on scaling traffic and stock, keep an eye on competition."
    );
  }

  if (winRatePercent < 10) {
    suggestions.push(
      "Very low winner rate. Use your /api/ebay/winners endpoint more to trim bad listings."
    );
  } else if (winRatePercent < 25) {
    suggestions.push(
      "OK winner rate, but you can still cut the bottom 20% worst performers."
    );
  } else {
    suggestions.push(
      "Strong winner rate. Consider increasing ad spend / traffic to these products."
    );
  }

  suggestions.push(
    "Reinvest a portion of your monthly profit into new product testing (5–10 new SKUs / week)."
  );

  res.json({
    ok: true,
    engine: "master-dashboard",
    market,
    inputs: {
      revenue7d,
      profit7d,
      orders7d,
      activeListings,
      winningListings,
    },
    metrics: {
      avgOrderValue,
      profitMarginPercent,
      winRatePercent,
      healthScore,
      stage,
    },
    suggestions,
  });
});

module.exports = router;
