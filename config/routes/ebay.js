const express = require("express");
const { MARKETS, listMarkets, getMarket } = require("./ebayMarkets");

const router = express.Router();

/**
 * Small helpers
 */
function toNumber(value, defaultValue = 0) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : defaultValue;
}

function resolveMarket(rawMarket) {
  const code = (rawMarket || "").toUpperCase();
  return getMarket(code) || getMarket("UK");
}

function buildScores({ demandBase = 25, competitionBase = 15, saturationBase = 10 } = {}) {
  const demandScore = demandBase + Math.floor(Math.random() * 30);       // 25–55
  const competitionScore = competitionBase + Math.floor(Math.random() * 20); // 15–35
  const saturationScore = saturationBase + Math.floor(Math.random() * 20);   // 10–30

  let opportunityScore =
    demandScore + (50 - competitionScore) + (40 - saturationScore);

  if (opportunityScore < 0) opportunityScore = 0;
  if (opportunityScore > 100) opportunityScore = 100;

  return { demandScore, competitionScore, saturationScore, opportunityScore };
}

function buildDecision(opportunityScore) {
  if (opportunityScore >= 80) {
    return {
      rating: "A",
      verdict: "Excellent – strong opportunity, scale aggressively if supply is stable."
    };
  }
  if (opportunityScore >= 65) {
    return {
      rating: "B",
      verdict: "Good – list it with solid pricing and test multiple angles."
    };
  }
  if (opportunityScore >= 50) {
    return {
      rating: "C",
      verdict: "Average – okay as a supporting product, not a main winner."
    };
  }
  return {
    rating: "D",
    verdict: "Poor – avoid this product, look for a different angle."
  };
}

/**
 * Trend helper used by /trends
 */
function buildTrendEntry(keyword, marketCode) {
  const base = buildScores({ demandBase: 30, competitionBase: 10, saturationBase: 8 });

  const growth7d = 10 + Math.floor(Math.random() * 40);    // 10–50%
  const growth30d = 5 + Math.floor(Math.random() * 35);    // 5–40%
  const growth90d = -5 + Math.floor(Math.random() * 30);   // -5–25%

  const momentum =
    growth7d * 0.5 + growth30d * 0.3 + growth90d * 0.2 + (base.opportunityScore - 50) * 0.2;

  let status = "stable";
  if (momentum >= 35) status = "exploding";
  else if (momentum >= 20) status = "rising";
  else if (momentum <= 5) status = "cooling";

  return {
    keyword,
    market: marketCode,
    scores: base,
    growth: {
      last7d: growth7d,
      last30d: growth30d,
      last90d: growth90d
    },
    momentum: Math.round(momentum),
    status
  };
}

/**
 * ----------------------------------------
 * Basic health + market info
 * ----------------------------------------
 */

// Simple ping route
router.get("/ping", (req, res) => {
  res.json({
    ok: true,
    message: "eBay automation backend skeleton is ready (UK + US).",
    supportedMarkets: Object.keys(MARKETS)
  });
});

// List supported markets
router.get("/markets", (req, res) => {
  res.json({
    ok: true,
    markets: listMarkets()
  });
});

/**
 * ----------------------------------------
 * Competition analysis
 * /api/ebay/competition?q=iphone&market=UK
 * ----------------------------------------
 */
router.get("/competition", (req, res) => {
  const query = (req.query.q || "").trim();
  const marketObj = resolveMarket(req.query.market);
  const market = marketObj.code;
  const currency = marketObj.currency;

  if (!query) {
    return res.status(400).json({
      ok: false,
      error: "Missing q parameter. Example: ?q=iphone+case&market=UK"
    });
  }

  const sampleSize = 40 + Math.floor(Math.random() * 80); // 40–120
  const uniqueSellers = Math.max(10, Math.floor(sampleSize * (0.4 + Math.random() * 0.3)));
  const avgPrice = (10 + Math.random() * 40).toFixed(2);
  const minPrice = (avgPrice * 0.5).toFixed(2);
  const maxPrice = (avgPrice * 2).toFixed(2);

  const scores = buildScores();

  res.json({
    ok: true,
    query,
    market,
    currency,
    sampleSize,
    stats: {
      totalItems: sampleSize,
      uniqueSellers,
      avgPrice: Number(avgPrice),
      minPrice: Number(minPrice),
      maxPrice: Number(maxPrice)
    },
    scores
  });
});

/**
 * ----------------------------------------
 * Bestseller style analyser
 * /api/ebay/bestseller?q=hair+dryer&market=US
 * ----------------------------------------
 */
router.get("/bestseller", (req, res) => {
  const query = (req.query.q || "").trim();
  const marketObj = resolveMarket(req.query.market);
  const market = marketObj.code;
  const currency = marketObj.currency;

  if (!query) {
    return res.status(400).json({
      ok: false,
      error: "Missing q parameter. Example: ?q=hair+dryer&market=US"
    });
  }

  const sampleSize = 50 + Math.floor(Math.random() * 70);
  const uniqueSellers = Math.max(10, Math.floor(sampleSize * (0.35 + Math.random() * 0.3)));
  const avgPrice = (15 + Math.random() * 40).toFixed(2);
  const minPrice = (avgPrice * 0.6).toFixed(2);
  const maxPrice = (avgPrice * 1.8).toFixed(2);

  const scores = buildScores({ demandBase: 30, competitionBase: 12, saturationBase: 10 });
  const decision = buildDecision(scores.opportunityScore);

  res.json({
    ok: true,
    query,
    market,
    currency,
    sampleSize,
    stats: {
      totalItems: sampleSize,
      uniqueSellers,
      avgPrice: Number(avgPrice),
      minPrice: Number(minPrice),
      maxPrice: Number(maxPrice)
    },
    scores,
    decision
  });
});

/**
 * ----------------------------------------
 * Profit calculator (Business Seller Model – Option B)
 * /api/ebay/profit?market=UK&buyPrice=10&sellPrice=19.99&shippingCost=2
 * ----------------------------------------
 */
router.get("/profit", (req, res) => {
  const marketObj = resolveMarket(req.query.market);
  const market = marketObj.code;
  const currency = marketObj.currency;

  const buy = toNumber(req.query.buyPrice);
  const sell = toNumber(req.query.sellPrice);
  const shipping = toNumber(req.query.shippingCost, 0);

  if (!buy || !sell || sell <= 0) {
    return res.status(400).json({
      ok: false,
      error:
        "Missing or invalid buyPrice / sellPrice. Example: ?q=iphone&market=UK&buyPrice=10&sellPrice=19.99&shippingCost=2"
    });
  }

  const feePercent =
    typeof marketObj.feePercent === "number" ? marketObj.feePercent : market === "US" ? 13 : 12;

  const feeAmount = (sell * feePercent) / 100;
  const costTotal = buy + shipping;
  const profit = sell - costTotal - feeAmount;
  const marginPercent = (profit / sell) * 100;
  const roi = (profit / costTotal) * 100;

  const breakEvenPrice = costTotal / (1 - feePercent / 100);

  res.json({
    ok: true,
    market,
    currency,
    inputs: {
      buyPrice: buy,
      sellPrice: sell,
      shippingCost: shipping,
      feePercent
    },
    outputs: {
      revenue: sell,
      totalCost: Number(costTotal.toFixed(2)),
      feeAmount: Number(feeAmount.toFixed(2)),
      profit: Number(profit.toFixed(2)),
      marginPercent: Number(marginPercent.toFixed(2)),
      roiPercent: Number(roi.toFixed(2)),
      breakEvenPrice: Number(breakEvenPrice.toFixed(2))
    }
  });
});

/**
 * ----------------------------------------
 * Winner finder
 * /api/ebay/winners?market=UK
 * ----------------------------------------
 */
router.get("/winners", (req, res) => {
  const marketObj = resolveMarket(req.query.market);
  const market = marketObj.code;

  const candidates = [
    "water bottle",
    "usb hub",
    "screwdriver set",
    "portable blender",
    "air fryer",
    "wireless doorbell",
    "car phone holder",
    "led strip lights",
    "gaming mouse",
    "pet grooming kit"
  ];

  const results = candidates.map((keyword) => {
    const scores = buildScores({ demandBase: 30, competitionBase: 10, saturationBase: 10 });
    return {
      keyword,
      demandScore: scores.demandScore,
      competitionScore: scores.competitionScore,
      saturationScore: scores.saturationScore,
      opportunityScore: scores.opportunityScore
    };
  });

  results.sort((a, b) => b.opportunityScore - a.opportunityScore);
  const winners = results.slice(0, 5);

  res.json({
    ok: true,
    market,
    winnersCount: winners.length,
    winners
  });
});

/**
 * ----------------------------------------
 * Pricing suggestion helper
 * /api/ebay/pricing-suggest?market=US&buy=10
 * ----------------------------------------
 */
router.get("/pricing-suggest", (req, res) => {
  const marketObj = resolveMarket(req.query.market);
  const market = marketObj.code;
  const currency = marketObj.currency;

  const buy = toNumber(req.query.buy);
  if (!buy) {
    return res.status(400).json({
      ok: false,
      error: "Missing buy parameter. Example: ?market=US&buy=10"
    });
  }

  const feePercent =
    typeof marketObj.feePercent === "number" ? marketObj.feePercent : market === "US" ? 13 : 12;

  // Simple 270% markup model
  const recommended = buy * 2.7;
  const minSafe = buy * 1.9;
  const highDemandBoost = recommended + 3;

  res.json({
    ok: true,
    market,
    currency,
    buy,
    recommendedPrice: Number(recommended.toFixed(2)),
    highDemandPrice: Number(highDemandBoost.toFixed(2)),
    minimumSafePrice: Number(minSafe.toFixed(2)),
    feePercent
  });
});

/**
 * ----------------------------------------
 * A) AI Title Generator
 * /api/ebay/title-suggest?q=iphone+14+case&market=UK
 * ----------------------------------------
 */
router.get("/title-suggest", (req, res) => {
  const query = (req.query.q || "").trim();
  const style = (req.query.style || "balanced").toLowerCase();
  const marketObj = resolveMarket(req.query.market);
  const market = marketObj.code;

  if (!query) {
    return res.status(400).json({
      ok: false,
      error: "Missing q parameter. Example: ?q=iphone+14+case&market=UK"
    });
  }

  const base = query
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

  const suffixMarket = market === "US" ? "Fast Shipping USA" : "UK Stock";
  const suffixTrust = "Top Rated Seller";
  const suffixValue = "Free & Fast Delivery";

  const suggestions = [];

  if (style === "aggressive" || style === "balanced") {
    suggestions.push({
      style: "keyword_rich",
      title: `${base} – ${suffixMarket} – ${suffixTrust}`
    });
  }

  suggestions.push({
    style: "benefit_focused",
    title: `${base} | Durable, High Quality, ${suffixValue}`
  });

  suggestions.push({
    style: "mobile_friendly",
    title: `${base} ${market === "US" ? "Free Shipping" : "UK Seller"}`
  });

  res.json({
    ok: true,
    query,
    market,
    suggestionsCount: suggestions.length,
    suggestions
  });
});

/**
 * ----------------------------------------
 * B) AI Description Generator
 * /api/ebay/description-suggest?q=wireless+earbuds&market=US
 * ----------------------------------------
 */
router.get("/description-suggest", (req, res) => {
  const query = (req.query.q || "").trim();
  const marketObj = resolveMarket(req.query.market);
  const market = marketObj.code;
  const currency = marketObj.currency;

  if (!query) {
    return res.status(400).json({
      ok: false,
      error: "Missing q parameter. Example: ?q=wireless+earbuds&market=US"
    });
  }

  const niceName = query
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

  const bullets = [
    `✅ Premium quality ${niceName} designed for daily use.`,
    "✅ Fast dispatch from trusted seller, tracking on every order.",
    "✅ Easy returns policy – buy with complete confidence.",
    `✅ Perfect for gifts, home or professional use.`,
    `✅ Compatible with most popular brands / models (see item specifics).`
  ];

  const seoKeywords = [
    query.toLowerCase(),
    `${niceName.toLowerCase()} best price`,
    `${niceName.toLowerCase()} ${market === "US" ? "US" : "UK"} seller`
  ];

  const body = `Upgrade your listing with a clean, benefit-driven description. Focus on how the buyer’s life improves when they use this product. Highlight speed, reliability and trust – especially shipping time and return policy. The goal is to remove fear and make clicking “Buy It Now” feel completely safe.`;

  res.json({
    ok: true,
    query,
    market,
    currency,
    titleSuggestion: `${niceName} – Fast Delivery, Trusted ${market} Seller`,
    bullets,
    body,
    seoKeywords
  });
});

/**
 * ----------------------------------------
 * C) Trend Detector
 * /api/ebay/trends?market=UK&q=air+fryer
 * or
 * /api/ebay/trends?market=US  (no q = list of trending ideas)
 * ----------------------------------------
 */
router.get("/trends", (req, res) => {
  const marketObj = resolveMarket(req.query.market);
  const market = marketObj.code;

  const q = (req.query.q || "").trim();

  // If user provided a specific keyword – return detailed trend for that one
  if (q) {
    const entry = buildTrendEntry(q.toLowerCase(), market);
    return res.json({
      ok: true,
      mode: "single",
      market,
      trend: entry
    });
  }

  // Otherwise return a bundle of trending ideas for this market
  const baseIdeas =
    market === "US"
      ? [
          "wireless earbuds",
          "massage gun",
          "standing desk",
          "pet camera",
          "air fryer",
          "portable power station"
        ]
      : [
          "air fryer liners",
          "reusable water bottle",
          "cordless vacuum",
          "led strip lights",
          "folding treadmill",
          "garden solar lights"
        ];

  const trends = baseIdeas.map((kw) => buildTrendEntry(kw, market));

  trends.sort((a, b) => b.momentum - a.momentum);

  res.json({
    ok: true,
    mode: "list",
    market,
    count: trends.length,
    trends
  });
});

module.exports = router;
