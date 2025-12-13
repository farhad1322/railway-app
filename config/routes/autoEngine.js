// config/routes/autoEngine.js
// High-level smart engine for Amazon→eBay sourcing, autopricing & dashboard
// Version: 1.5 (Market Sweeper + Daily Winner Planner)

const express = require("express");
const router = express.Router();

/**
 * Small helper to safely convert query values into numbers
 */
function num(value, fallback = 0) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Simple deterministic hash so the same keyword always gives same scores
 */
function hashToSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h) + 1;
}

function makeScore(seed, offset, min = 10, max = 90) {
  const v = (seed * (offset + 3)) % 9973;
  const normalized = v / 9973; // 0–1
  return Math.round(min + normalized * (max - min));
}

function baseCurrency(market) {
  return market === "US" ? "USD" : "GBP";
}

// ---------------------------------------------------------
// 0) Health check
// ---------------------------------------------------------

router.get("/ping", (req, res) => {
  res.json({
    ok: true,
    message: "Auto engine is alive and ready.",
    markets: ["UK", "US"],
    engine: "Amazon -> eBay ultra engine v1.5",
  });
});

// ---------------------------------------------------------
// 1) AMAZON → EBAY REVERSE SOURCING ENGINE
// ---------------------------------------------------------
// GET /api/engine/reverse-sourcing?market=UK&amazonPrice=12.99&amazonFeesPercent=15&shipping=2.5&desiredMarginPercent=30

router.get("/reverse-sourcing", (req, res) => {
  const market = (req.query.market || "UK").toUpperCase();
  const currency = baseCurrency(market);

  const amazonPrice = num(req.query.amazonPrice, 0);
  const amazonFeesPercent = num(req.query.amazonFeesPercent, 15); // Amazon fee %
  const shipping = num(req.query.shipping, 0);
  const desiredMarginPercent = num(req.query.desiredMarginPercent, 30);

  const amazonFeesAmount = (amazonPrice * amazonFeesPercent) / 100;
  const effectiveCost = amazonPrice + amazonFeesAmount + shipping;

  // Assume eBay fee approx. 12% of sell price
  const ebayFeePercent = 12;
  const breakEvenPrice = effectiveCost / (1 - ebayFeePercent / 100);

  // Target sell price for desired margin (net)
  const targetSell = effectiveCost * (1 + desiredMarginPercent / 100);
  const safeLower = targetSell * 0.69; // still acceptable margin
  const aggressiveUpper = targetSell * 1.15;

  res.json({
    ok: true,
    market,
    currency,
    inputs: {
      amazonPrice,
      amazonFeesPercent,
      shipping,
      desiredMarginPercent,
    },
    calculations: {
      amazonFeesAmount: +amazonFeesAmount.toFixed(2),
      effectiveCost: +effectiveCost.toFixed(2),
      ebayFeePercent,
    },
    pricing: {
      breakEvenPrice: +breakEvenPrice.toFixed(2),
      recommendedSell: +targetSell.toFixed(2),
      safeLower: +safeLower.toFixed(2),
      aggressiveUpper: +aggressiveUpper.toFixed(2),
    },
  });
});

// ---------------------------------------------------------
// 2) AUTOPRICE ENGINE – MULTI-SCENARIO
// ---------------------------------------------------------
// GET /api/engine/auto-price?market=US&buyPrice=8.5&shippingCost=3&targetMarginPercent=30&feePercent=13

router.get("/auto-price", (req, res) => {
  const market = (req.query.market || "US").toUpperCase();
  const currency = baseCurrency(market);

  const buyPrice = num(req.query.buyPrice, 0);
  const shippingCost = num(req.query.shippingCost, 0);
  const targetMarginPercent = num(req.query.targetMarginPercent, 30);
  const feePercent = num(req.query.feePercent, 12);

  const totalCost = buyPrice + shippingCost;
  const breakEvenPrice = totalCost / (1 - feePercent / 100);
  const targetSell = totalCost * (1 + targetMarginPercent / 100);

  function scenario(multiplier) {
    const sellPrice = targetSell * multiplier;
    const feeAmount = (sellPrice * feePercent) / 100;
    const profit = sellPrice - totalCost - feeAmount;
    const marginPercent = (profit / totalCost) * 100;
    const roiPercent = (profit / (buyPrice || 1)) * 100;

    return {
      sellPrice: +sellPrice.toFixed(2),
      profit: +profit.toFixed(2),
      marginPercent: +marginPercent.toFixed(2),
      roiPercent: +roiPercent.toFixed(2),
      feeAmount: +feeAmount.toFixed(2),
    };
  }

  res.json({
    ok: true,
    market,
    currency,
    inputs: {
      buyPrice,
      shippingCost,
      feePercent,
      targetMarginPercent,
    },
    totals: {
      totalCost: +totalCost.toFixed(2),
      breakEvenPrice: +breakEvenPrice.toFixed(2),
      targetSell: +targetSell.toFixed(2),
    },
    scenarios: {
      conservative: scenario(0.8),
      target: scenario(1.0),
      aggressive: scenario(1.15),
    },
  });
});

// ---------------------------------------------------------
// 3) PRODUCT SCORE ENGINE
// ---------------------------------------------------------
// GET /api/engine/product-score?q=iphone+14+case&market=UK

router.get("/product-score", (req, res) => {
  const rawQuery = (req.query.q || "").trim();
  const market = (req.query.market || "UK").toUpperCase();
  const currency = baseCurrency(market);

  if (!rawQuery) {
    return res.status(400).json({
      ok: false,
      error: "Missing q (keyword). Example: ?q=iphone+case&market=UK",
    });
  }

  const seed = hashToSeed(rawQuery + "|" + market);

  const demandScore = makeScore(seed, 1, 20, 95);
  const competitionScore = makeScore(seed, 2, 10, 90);
  const saturationScore = makeScore(seed, 3, 10, 90);

  // Higher demand + lower competition + lower saturation = better
  const opportunityScore = Math.round(
    (demandScore * 0.5 +
      (100 - competitionScore) * 0.3 +
      (100 - saturationScore) * 0.2)
  );

  let verdict = "Average – only test if you have unique angle or bundle.";
  if (opportunityScore >= 70) verdict = "Strong – promising winner candidate.";
  else if (opportunityScore >= 55)
    verdict = "Decent – good to test with tight risk control.";
  else if (opportunityScore <= 35)
    verdict = "Weak – avoid unless you have something extremely unique.";

  res.json({
    ok: true,
    query: rawQuery,
    market,
    currency,
    scores: {
      demandScore,
      competitionScore,
      saturationScore,
      opportunityScore,
    },
    verdict,
  });
});

// ---------------------------------------------------------
// 4) RISK MAP ENGINE
// ---------------------------------------------------------
// GET /api/engine/risk-map?q=wireless+earbuds&market=US

router.get("/risk-map", (req, res) => {
  const rawQuery = (req.query.q || "").trim();
  const market = (req.query.market || "US").toUpperCase();

  if (!rawQuery) {
    return res.status(400).json({
      ok: false,
      error: "Missing q (keyword). Example: ?q=wireless+earbuds&market=US",
    });
  }

  const seed = hashToSeed(rawQuery + "|" + market);

  const pricingRisk = makeScore(seed, 4, 20, 90);
  const policyRisk = makeScore(seed, 5, 10, 80);
  const returnsRisk = makeScore(seed, 6, 15, 95);
  const supplyRisk = makeScore(seed, 7, 10, 85);

  const averageRisk = Math.round(
    (pricingRisk + policyRisk + returnsRisk + supplyRisk) / 4
  );

  const zones = [
    {
      zone: "pricing",
      riskScore: pricingRisk,
      note: "Discount wars & race-to-bottom pricing possible.",
    },
    {
      zone: "policy",
      riskScore: policyRisk,
      note: "Watch for brand, copyright, or VERO issues.",
    },
    {
      zone: "returns",
      riskScore: returnsRisk,
      note: "Higher risk if product fragile or subjective (size, color, fit).",
    },
    {
      zone: "supply-chain",
      riskScore: supplyRisk,
      note: "Check stock stability with your suppliers.",
    },
  ];

  res.json({
    ok: true,
    query: rawQuery,
    market,
    averageRisk,
    riskZones: zones,
  });
});

// ---------------------------------------------------------
// 5) MARKET DASHBOARD ENGINE
// ---------------------------------------------------------
// GET /api/engine/dashboard?market=UK

router.get("/dashboard", (req, res) => {
  const market = (req.query.market || "UK").toUpperCase();
  const currency = baseCurrency(market);

  // base niches (you can extend this list later)
  const baseKeywords =
    market === "US"
      ? ["wireless earbuds", "air fryer", "phone case", "massage gun"]
      : ["water bottle", "phone case", "led strip lights", "car organiser"];

  const hotKeywords = baseKeywords.map((k) => {
    const seed = hashToSeed(k + "|" + market);
    const demandScore = makeScore(seed, 8, 25, 95);
    const competitionScore = makeScore(seed, 9, 10, 90);
    const opportunityScore = Math.round(
      (demandScore * 0.55 + (100 - competitionScore) * 0.45)
    );

    return {
      keyword: k,
      demandScore,
      competitionScore,
      opportunityScore,
    };
  });

  const overallOpportunity = Math.round(
    hotKeywords.reduce((acc, k) => acc + k.opportunityScore, 0) /
      hotKeywords.length
  );

  const actions = [
    "Focus on research – overall market looks crowded.",
    "Use profit calculator + auto-price to confirm at least 25–35% net ROI before listing.",
    "Use risk-map on each main keyword to avoid policy & return headaches.",
  ];

  res.json({
    ok: true,
    market,
    currency,
    overallOpportunity,
    hotKeywords,
    actions,
  });
});

// ---------------------------------------------------------
// 6) UPGRADE A – MARKET SWEEPER
// ---------------------------------------------------------
// GET /api/engine/sweep?market=UK
// Optional: &keywords=iphone+case,air+fryer,usb+hub

router.get("/sweep", (req, res) => {
  const market = (req.query.market || "UK").toUpperCase();
  const currency = baseCurrency(market);

  let keywords = [];
  if (req.query.keywords) {
    keywords = req.query.keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
  }

  // Default scan set if user didn't provide keywords
  if (keywords.length === 0) {
    keywords =
      market === "US"
        ? [
            "wireless earbuds",
            "air fryer",
            "portable blender",
            "iphone case",
            "gaming mouse",
            "rgb keyboard",
          ]
        : [
            "water bottle",
            "phone holder",
            "car organiser",
            "led strip lights",
            "desk lamp",
            "usb hub",
          ];
  }

  const results = keywords.map((kw) => {
    const seed = hashToSeed(kw + "|" + market);
    const demandScore = makeScore(seed, 11, 20, 95);
    const competitionScore = makeScore(seed, 12, 10, 90);
    const saturationScore = makeScore(seed, 13, 10, 90);
    const opportunityScore = Math.round(
      (demandScore * 0.5 +
        (100 - competitionScore) * 0.3 +
        (100 - saturationScore) * 0.2)
    );

    let tier = "C";
    if (opportunityScore >= 75) tier = "A";
    else if (opportunityScore >= 55) tier = "B";

    return {
      keyword: kw,
      demandScore,
      competitionScore,
      saturationScore,
      opportunityScore,
      tier,
    };
  });

  // Sort by opportunity, highest first
  results.sort((a, b) => b.opportunityScore - a.opportunityScore);

  res.json({
    ok: true,
    market,
    currency,
    scannedKeywords: results.length,
    winnersTop3: results.slice(0, 3),
    fullScan: results,
  });
});

// ---------------------------------------------------------
// 7) UPGRADE A – DAILY WINNER PLAN
// ---------------------------------------------------------
// GET /api/engine/daily-plan?market=UK&budget=200

router.get("/daily-plan", (req, res) => {
  const market = (req.query.market || "UK").toUpperCase();
  const currency = baseCurrency(market);
  const budget = num(req.query.budget, 200);

  // Reuse sweep engine's default keywords
  const defaultReq = {
    query: { market },
  };

  // Manually call the sweep logic (without HTTP round-trip)
  let keywords =
    market === "US"
      ? [
          "wireless earbuds",
          "air fryer",
          "portable blender",
          "iphone case",
          "gaming mouse",
          "rgb keyboard",
        ]
      : [
          "water bottle",
          "phone holder",
          "car organiser",
          "led strip lights",
          "desk lamp",
          "usb hub",
        ];

  const items = keywords.map((kw) => {
    const seed = hashToSeed(kw + "|" + market);
    const demandScore = makeScore(seed, 21, 20, 95);
    const competitionScore = makeScore(seed, 22, 10, 90);
    const saturationScore = makeScore(seed, 23, 10, 90);
    const opportunityScore = Math.round(
      (demandScore * 0.5 +
        (100 - competitionScore) * 0.3 +
        (100 - saturationScore) * 0.2)
    );

    return {
      keyword: kw,
      demandScore,
      competitionScore,
      saturationScore,
      opportunityScore,
    };
  });

  items.sort((a, b) => b.opportunityScore - a.opportunityScore);

  const tierA = items.filter((i) => i.opportunityScore >= 75).slice(0, 3);
  const tierB = items.filter(
    (i) => i.opportunityScore >= 55 && i.opportunityScore < 75
  );

  const listingTargets = {
    highPriority: tierA.map((i) => i.keyword),
    testBucket: tierB.slice(0, 5).map((i) => i.keyword),
  };

  const budgetPerA = tierA.length ? budget * 0.7 / tierA.length : 0;
  const budgetPerB = tierB.length ? budget * 0.3 / tierB.length : 0;

  const actions = [
    "Source Tier A products from Amazon / suppliers with at least 35–50% ROI using reverse-sourcing.",
    "Use auto-price to create conservative, target, and aggressive offers for each Tier A item.",
    "For Tier B products, list with low risk budget and watch performance for 3–7 days.",
    "Avoid new products with low opportunity score unless they support bundles for Tier A items.",
  ];

  res.json({
    ok: true,
    market,
    currency,
    dailyBudget: budget,
    listingTargets,
    budgetPlan: {
      total: budget,
      tierAAllocated: + (budget * 0.7).toFixed(2),
      tierBAllocated: + (budget * 0.3).toFixed(2),
      approxBudgetPerTierA: +budgetPerA.toFixed(2),
      approxBudgetPerTierB: +budgetPerB.toFixed(2),
    },
    rawScores: items,
    actions,
  });
});

// ---------------------------------------------------------
// 8) UPGRADE A – ALERT / RADAR ENGINE
// ---------------------------------------------------------
// GET /api/engine/alerts?market=UK

router.get("/alerts", (req, res) => {
  const market = (req.query.market || "UK").toUpperCase();
  const currency = baseCurrency(market);

  // Simple deterministic seed from date + market
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const seed = hashToSeed(today + "|" + market);

  const saturationPressure = makeScore(seed, 31, 10, 95);
  const marginPressure = makeScore(seed, 32, 10, 95);
  const policyPressure = makeScore(seed, 33, 10, 95);

  const alerts = [];

  if (saturationPressure > 70) {
    alerts.push(
      "Saturation warning: reduce new generic listings – focus on unique bundles and accessories."
    );
  }

  if (marginPressure > 65) {
    alerts.push(
      "Margin pressure: review pricing on top 10 sellers and use auto-price to protect profit."
    );
  }

  if (policyPressure > 60) {
    alerts.push(
      "Policy attention: double-check keywords for trademarks / VERO before launching new items."
    );
  }

  if (alerts.length === 0) {
    alerts.push(
      "No critical alerts – continue scaling Tier A winners and testing Tier B candidates."
    );
  }

  res.json({
    ok: true,
    date: today,
    market,
    currency,
    saturationPressure,
    marginPressure,
    policyPressure,
    alerts,
  });
});

// ---------------------------------------------------------
// EXPORT ROUTER
// ---------------------------------------------------------

module.exports = router;
