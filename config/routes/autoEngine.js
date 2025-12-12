// config/routes/autoEngine.js
// High-level smart engine for Amazon -> eBay sourcing, pricing, scoring & dashboard

const express = require("express");
const router = express.Router();

/**
 * Small helper: safe numbers
 */
function num(value, fallback = 0) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Clamp value between min / max
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Simple hash from string (for deterministic fake data)
 */
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(h);
}

/**
 * Generate a “score” between 0 and 100 from any number
 */
function scoreFrom(seed, bias = 0.5) {
  const base = (seed % 1000) / 1000; // 0..1
  const adjusted = bias * base + (1 - bias) * (1 - base); // push towards bias
  return Math.round(adjusted * 100);
}

/**
 * Market presets (you can tweak later)
 */
const MARKETS = {
  UK: {
    code: "UK",
    currency: "GBP",
    ebayFeePercent: 12, // example fee %
    shippingBaseline: 2.5
  },
  US: {
    code: "US",
    currency: "USD",
    ebayFeePercent: 13,
    shippingBaseline: 3.0
  }
};

function resolveMarket(raw) {
  const key = String(raw || "").toUpperCase();
  return MARKETS[key] || MARKETS["UK"];
}

/* -------------------------------------------------------------------------- */
/* 0) ENGINE HEALTH CHECK                                                      */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/engine/ping
 * Very simple “alive” check for this engine only.
 */
router.get("/ping", (req, res) => {
  const markets = Object.keys(MARKETS);

  res.json({
    ok: true,
    message: "Auto engine is alive and ready.",
    markets,
    engine: "Amazon -> eBay ultra engine v1.0"
  });
});

/* -------------------------------------------------------------------------- */
/* A) AMAZON -> EBAY REVERSE SOURCING ENGINE                                  */
/* -------------------------------------------------------------------------- */
/**
 * Goal: if you know Amazon price (buy price) + fees, estimate the eBay
 * target selling price range to still hit your target margin.
 *
 * Example:
 *   /api/engine/reverse-sourcing?market=UK&amazonPrice=12.99&amazonFees=15&shipping=2.5
 */
router.get("/reverse-sourcing", (req, res) => {
  const market = resolveMarket(req.query.market);
  const amazonPrice = num(req.query.amazonPrice, 0);
  const amazonFeesPercent = num(req.query.amazonFees, 15); // % of Amazon price
  const shipping = num(req.query.shipping, market.shippingBaseline);
  const desiredMarginPercent = num(req.query.targetMargin, 30); // desired net margin on eBay

  if (amazonPrice <= 0) {
    return res.status(400).json({
      ok: false,
      error: "Missing or invalid amazonPrice. Example: ?amazonPrice=12.99&amazonFees=15&shipping=2.5"
    });
  }

  const amazonFeesAmount = (amazonFeesPercent / 100) * amazonPrice;
  const effectiveCost = amazonPrice + amazonFeesAmount; // what you really pay

  // On eBay: sellingPrice - ebayFees - shipping - cost = profit
  // ebayFees = sellingPrice * ebayFeePercent
  const f = market.ebayFeePercent / 100;
  const c = effectiveCost + shipping;
  const targetMargin = desiredMarginPercent / 100;

  // profit = sellingPrice * (1 - f) - c
  // margin% = profit / sellingPrice = targetMargin
  // => sellingPrice * (1 - f - targetMargin) = c
  const denominator = 1 - f - targetMargin;

  let recommendedSell = null;
  if (denominator > 0) {
    recommendedSell = c / denominator;
  } else {
    // if denominator <= 0, target margin is too aggressive
    recommendedSell = c / (1 - f) * 1.05; // minimal 5% mark-up
  }

  const breakEvenPrice = c / (1 - f);
  const safeLower = breakEvenPrice * 1.05; // 5% margin
  const aggressive = recommendedSell * 1.15; // little higher for testing market

  res.json({
    ok: true,
    market: market.code,
    currency: market.currency,
    inputs: {
      amazonPrice,
      amazonFeesPercent,
      shipping,
      desiredMarginPercent
    },
    calculations: {
      amazonFeesAmount: amazonFeesAmount.toFixed(2),
      effectiveCost: effectiveCost.toFixed(2),
      ebayFeePercent: market.ebayFeePercent
    },
    pricing: {
      breakEvenPrice: breakEvenPrice.toFixed(2),
      recommendedSell: recommendedSell.toFixed(2),
      safeLower: safeLower.toFixed(2),
      aggressiveUpper: aggressive.toFixed(2)
    }
  });
});

/* -------------------------------------------------------------------------- */
/* B) ADVANCED EBAY PRICING & ROI SCENARIOS                                   */
/* -------------------------------------------------------------------------- */
/**
 * GET /api/engine/auto-price
 *
 * Inputs:
 *   market, buyPrice, shippingCost, feePercent?, targetMarginPercent?
 *
 * Example:
 *   /api/engine/auto-price?market=UK&buyPrice=8.5&shippingCost=2.2&targetMarginPercent=25
 */
router.get("/auto-price", (req, res) => {
  const market = resolveMarket(req.query.market);
  const buyPrice = num(req.query.buyPrice, 0);
  const shippingCost = num(req.query.shippingCost, market.shippingBaseline);
  const feePercent = num(req.query.feePercent, market.ebayFeePercent);
  const targetMarginPercent = num(req.query.targetMarginPercent, 25);

  if (buyPrice <= 0) {
    return res.status(400).json({
      ok: false,
      error: "Missing or invalid buyPrice. Example: ?buyPrice=8.5&shippingCost=2.2&targetMarginPercent=25"
    });
  }

  const totalCost = buyPrice + shippingCost;
  const f = feePercent / 100;
  const t = targetMarginPercent / 100;

  const breakEvenPrice = totalCost / (1 - f);
  const targetSell = totalCost / (1 - f - t);

  function calcProfit(sellPrice) {
    const fees = sellPrice * f;
    const profit = sellPrice - fees - totalCost;
    const marginPercent = (profit / sellPrice) * 100;
    const roiPercent = (profit / totalCost) * 100;
    return {
      sellPrice: sellPrice.toFixed(2),
      profit: profit.toFixed(2),
      marginPercent: marginPercent.toFixed(2),
      roiPercent: roiPercent.toFixed(2),
      feeAmount: fees.toFixed(2)
    };
  }

  const scenarios = {
    conservative: calcProfit(breakEvenPrice * 1.08), // 8% margin
    target: calcProfit(targetSell),
    aggressive: calcProfit(targetSell * 1.15)
  };

  res.json({
    ok: true,
    market: market.code,
    currency: market.currency,
    inputs: {
      buyPrice,
      shippingCost,
      feePercent,
      targetMarginPercent
    },
    totals: {
      totalCost: totalCost.toFixed(2),
      breakEvenPrice: breakEvenPrice.toFixed(2),
      targetSell: targetSell.toFixed(2)
    },
    scenarios
  });
});

/* -------------------------------------------------------------------------- */
/* C) PRODUCT / NICHE SCORING ENGINE                                          */
/* -------------------------------------------------------------------------- */
/**
 * This is a “generic” scoring engine. It doesn’t call real eBay yet,
 * but it gives powerful structure:
 *
 * GET /api/engine/product-score?q=iphone+14+case&market=UK
 */
router.get("/product-score", (req, res) => {
  const q = (req.query.q || "").trim();
  const market = resolveMarket(req.query.market);

  if (!q) {
    return res.status(400).json({
      ok: false,
      error: "Missing q (keyword). Example: ?q=iphone+14+case&market=UK"
    });
  }

  const seed = hashString(q + "|" + market.code);

  // Build scores from seed
  const demandScore = clamp(scoreFrom(seed, 0.7), 10, 98);
  const competitionScore = clamp(scoreFrom(seed * 3, 0.4), 5, 95);
  const saturationScore = clamp(scoreFrom(seed * 7, 0.5), 5, 95);

  // Higher opportunity when demand high, competition & saturation low
  const opportunityScore = clamp(
    Math.round(
      demandScore * 0.5 +
      (100 - competitionScore) * 0.25 +
      (100 - saturationScore) * 0.25
    ),
    0,
    100
  );

  // Simple textual suggestion
  let verdict;
  if (opportunityScore >= 80) {
    verdict = "Excellent – strong candidate for a winning product.";
  } else if (opportunityScore >= 60) {
    verdict = "Good – worth testing with 5–10 listings or variations.";
  } else if (opportunityScore >= 40) {
    verdict = "Average – only test if you have unique angle or bundle.";
  } else {
    verdict = "Weak – avoid unless you niche down further.";
  }

  res.json({
    ok: true,
    query: q,
    market: market.code,
    currency: market.currency,
    scores: {
      demandScore,
      competitionScore,
      saturationScore,
      opportunityScore
    },
    verdict
  });
});

/* -------------------------------------------------------------------------- */
/* D) RISK / SATURATION HEATMAP FOR A KEYWORD                                 */
/* -------------------------------------------------------------------------- */
/**
 * GET /api/engine/risk-map?q=iphone+14+case&market=UK
 *
 * Returns “zones” of risk to help you decide how safe this niche is.
 */
router.get("/risk-map", (req, res) => {
  const q = (req.query.q || "").trim();
  const market = resolveMarket(req.query.market);

  if (!q) {
    return res.status(400).json({
      ok: false,
      error: "Missing q (keyword). Example: ?q=iphone+14+case&market=UK"
    });
  }

  const seed = hashString("risk|" + q + "|" + market.code);
  const baseRisk = clamp(scoreFrom(seed, 0.6), 5, 95);

  const riskZones = [
    {
      zone: "pricing",
      riskScore: clamp(baseRisk + (seed % 7) - 3, 0, 100),
      note: "Discount wars & race-to-bottom pricing possible."
    },
    {
      zone: "policy",
      riskScore: clamp(baseRisk + ((seed >> 3) % 9) - 4, 0, 100),
      note: "Watch for brand, copyright, or VERO issues."
    },
    {
      zone: "returns",
      riskScore: clamp(baseRisk + ((seed >> 6) % 11) - 5, 0, 100),
      note: "Higher risk if product fragile or subjective (size, color, fit)."
    },
    {
      zone: "supply-chain",
      riskScore: clamp(baseRisk + ((seed >> 9) % 13) - 6, 0, 100),
      note: "Check stock stability with your suppliers."
    }
  ];

  const avgRisk =
    riskZones.reduce((sum, z) => sum + z.riskScore, 0) / riskZones.length;

  res.json({
    ok: true,
    query: q,
    market: market.code,
    averageRisk: Math.round(avgRisk),
    riskZones
  });
});

/* -------------------------------------------------------------------------- */
/* E) DASHBOARD SUMMARY: WHAT TO WATCH TODAY                                  */
/* -------------------------------------------------------------------------- */
/**
 * GET /api/engine/dashboard?market=UK
 *
 * Simple high-level snapshot of:
 *  - hot keywords
 *  - risky areas
 *  - suggested actions
 */
router.get("/dashboard", (req, res) => {
  const market = resolveMarket(req.query.market);
  const baseSeed = hashString("dashboard|" + market.code);

  const hotKeywords = [
    "water bottle",
    "phone case",
    "led strip lights",
    "car organiser",
    "wireless earbuds"
  ].map((kw, idx) => {
    const seed = baseSeed + idx * 137;
    const opp = clamp(scoreFrom(seed, 0.65), 30, 100);
    const demand = clamp(scoreFrom(seed * 2, 0.7), 30, 100);
    const comp = clamp(scoreFrom(seed * 3, 0.4), 10, 95);

    return {
      keyword: kw,
      demandScore: demand,
      competitionScore: comp,
      opportunityScore: opp
    };
  });

  const overallOpportunity = Math.round(
    hotKeywords.reduce((sum, k) => sum + k.opportunityScore, 0) /
      hotKeywords.length
  );

  const actions = [];

  if (overallOpportunity >= 70) {
    actions.push(
      "Increase testing budget for 3–5 hot products in " + market.code
    );
  } else if (overallOpportunity >= 50) {
    actions.push("Test 2–3 products with small daily budget.");
  } else {
    actions.push("Focus on research – overall market looks crowded.");
  }

  actions.push(
    "Use profit calculator + auto-price to confirm at least 25–35% net ROI before listing."
  );
  actions.push(
    "Use risk-map on each main keyword to avoid policy & return headaches."
  );

  res.json({
    ok: true,
    market: market.code,
    currency: market.currency,
    overallOpportunity,
    hotKeywords,
    actions
  });
});

module.exports = router;
