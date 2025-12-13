// config/routes/autoEngine.js
// Version: 1.6 (v1.5 + Seller Safety Guard API)

const express = require("express");
const router = express.Router();

/* ------------------------- Helpers ------------------------- */
function num(value, fallback = 0) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function hashToSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h) + 1;
}

function makeScore(seed, offset, min = 10, max = 90) {
  const v = (seed * (offset + 3)) % 9973;
  const normalized = v / 9973;
  return Math.round(min + normalized * (max - min));
}

function baseCurrency(market) {
  return market === "US" ? "USD" : "GBP";
}

function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}

function normalizeText(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim();
}

function lower(s) {
  return normalizeText(s).toLowerCase();
}

/* ------------------------- Markets ------------------------- */
const markets = ["UK", "US"];

/* ===========================================================
   0) Engine ping
   =========================================================== */
router.get("/ping", (req, res) => {
  res.json({
    ok: true,
    message: "Auto engine is alive and ready.",
    markets,
    engine: "Amazon -> eBay ultra engine v1.6 (with Seller Safety Guard)",
  });
});

/* ===========================================================
   1) Reverse Sourcing (Amazon -> eBay)
   =========================================================== */
router.get("/reverse-sourcing", (req, res) => {
  const market = (req.query.market || "UK").toUpperCase();
  const currency = baseCurrency(market);

  const amazonPrice = num(req.query.amazonPrice, 0);
  const amazonFeesPercent = num(req.query.amazonFeesPercent, 15);
  const shipping = num(req.query.shipping, 0);
  const desiredMarginPercent = num(req.query.desiredMarginPercent, 30);

  if (amazonPrice <= 0) {
    return res.status(400).json({
      ok: false,
      error:
        "Missing or invalid amazonPrice. Example: ?market=UK&amazonPrice=12.99&amazonFeesPercent=15&shipping=2.5&desiredMarginPercent=30",
    });
  }

  const amazonFeesAmount = (amazonPrice * amazonFeesPercent) / 100;
  const effectiveCost = amazonPrice + amazonFeesAmount + shipping;

  const ebayFeePercent = 12;
  const breakEvenPrice = effectiveCost / (1 - ebayFeePercent / 100);

  const targetSell = effectiveCost * (1 + desiredMarginPercent / 100);
  const safeLower = targetSell * 0.69;
  const aggressiveUpper = targetSell * 1.15;

  res.json({
    ok: true,
    market,
    currency,
    inputs: { amazonPrice, amazonFeesPercent, shipping, desiredMarginPercent },
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

/* ===========================================================
   2) Auto Price (scenarios)
   =========================================================== */
router.get("/auto-price", (req, res) => {
  const market = (req.query.market || "US").toUpperCase();
  const currency = baseCurrency(market);

  const buyPrice = num(req.query.buyPrice, 0);
  const shippingCost = num(req.query.shippingCost, 0);
  const targetMarginPercent = num(req.query.targetMarginPercent, 30);
  const feePercent = num(req.query.feePercent, 12);

  if (buyPrice <= 0) {
    return res.status(400).json({
      ok: false,
      error:
        "Missing or invalid buyPrice. Example: ?market=US&buyPrice=8.5&shippingCost=3&targetMarginPercent=30&feePercent=13",
    });
  }

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
    inputs: { buyPrice, shippingCost, feePercent, targetMarginPercent },
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

/* ===========================================================
   3) Product score
   =========================================================== */
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

  const opportunityScore = Math.round(
    demandScore * 0.5 + (100 - competitionScore) * 0.3 + (100 - saturationScore) * 0.2
  );

  let verdict = "Average – only test if you have unique angle or bundle.";
  if (opportunityScore >= 70) verdict = "Strong – promising winner candidate.";
  else if (opportunityScore >= 55) verdict = "Decent – good to test with tight risk control.";
  else if (opportunityScore <= 35) verdict = "Weak – avoid unless you have something extremely unique.";

  res.json({
    ok: true,
    query: rawQuery,
    market,
    currency,
    scores: { demandScore, competitionScore, saturationScore, opportunityScore },
    verdict,
  });
});

/* ===========================================================
   4) Risk map
   =========================================================== */
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

  const averageRisk = Math.round((pricingRisk + policyRisk + returnsRisk + supplyRisk) / 4);

  res.json({
    ok: true,
    query: rawQuery,
    market,
    averageRisk,
    riskZones: [
      { zone: "pricing", riskScore: pricingRisk, note: "Discount wars & race-to-bottom pricing possible." },
      { zone: "policy", riskScore: policyRisk, note: "Watch for brand, copyright, or VERO issues." },
      { zone: "returns", riskScore: returnsRisk, note: "Higher risk if product fragile or subjective (size, color, fit)." },
      { zone: "supply-chain", riskScore: supplyRisk, note: "Check stock stability with your suppliers." },
    ],
  });
});

/* ===========================================================
   5) Dashboard
   =========================================================== */
router.get("/dashboard", (req, res) => {
  const market = (req.query.market || "UK").toUpperCase();
  const currency = baseCurrency(market);

  const baseKeywords =
    market === "US"
      ? ["wireless earbuds", "air fryer", "phone case", "massage gun"]
      : ["water bottle", "phone case", "led strip lights", "car organiser"];

  const hotKeywords = baseKeywords.map((k) => {
    const seed = hashToSeed(k + "|" + market);
    const demandScore = makeScore(seed, 8, 25, 95);
    const competitionScore = makeScore(seed, 9, 10, 90);
    const opportunityScore = Math.round(demandScore * 0.55 + (100 - competitionScore) * 0.45);

    return { keyword: k, demandScore, competitionScore, opportunityScore };
  });

  const overallOpportunity = Math.round(
    hotKeywords.reduce((acc, k) => acc + k.opportunityScore, 0) / hotKeywords.length
  );

  res.json({
    ok: true,
    market,
    currency,
    overallOpportunity,
    hotKeywords,
    actions: [
      "Use profit calculator + auto-price to confirm at least 25–35% net ROI before listing.",
      "Use risk-map on each main keyword to avoid policy & return headaches.",
      "Scale Tier A products slowly and monitor metrics.",
    ],
  });
});

/* ===========================================================
   6) Sweep
   =========================================================== */
router.get("/sweep", (req, res) => {
  const market = (req.query.market || "UK").toUpperCase();
  const currency = baseCurrency(market);

  let keywords = [];
  if (req.query.keywords) {
    keywords = req.query.keywords.split(",").map((k) => k.trim()).filter(Boolean);
  }

  if (keywords.length === 0) {
    keywords =
      market === "US"
        ? ["wireless earbuds", "air fryer", "portable blender", "iphone case", "gaming mouse", "rgb keyboard"]
        : ["water bottle", "phone holder", "car organiser", "led strip lights", "desk lamp", "usb hub"];
  }

  const results = keywords.map((kw) => {
    const seed = hashToSeed(kw + "|" + market);
    const demandScore = makeScore(seed, 11, 20, 95);
    const competitionScore = makeScore(seed, 12, 10, 90);
    const saturationScore = makeScore(seed, 13, 10, 90);
    const opportunityScore = Math.round(
      demandScore * 0.5 + (100 - competitionScore) * 0.3 + (100 - saturationScore) * 0.2
    );

    let tier = "C";
    if (opportunityScore >= 75) tier = "A";
    else if (opportunityScore >= 55) tier = "B";

    return { keyword: kw, demandScore, competitionScore, saturationScore, opportunityScore, tier };
  });

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

/* ===========================================================
   7) Daily plan
   =========================================================== */
router.get("/daily-plan", (req, res) => {
  const market = (req.query.market || "UK").toUpperCase();
  const currency = baseCurrency(market);
  const budget = num(req.query.budget, 200);

  const keywords =
    market === "US"
      ? ["wireless earbuds", "air fryer", "portable blender", "iphone case", "gaming mouse", "rgb keyboard"]
      : ["water bottle", "phone holder", "car organiser", "led strip lights", "desk lamp", "usb hub"];

  const items = keywords.map((kw) => {
    const seed = hashToSeed(kw + "|" + market);
    const demandScore = makeScore(seed, 21, 20, 95);
    const competitionScore = makeScore(seed, 22, 10, 90);
    const saturationScore = makeScore(seed, 23, 10, 90);
    const opportunityScore = Math.round(
      demandScore * 0.5 + (100 - competitionScore) * 0.3 + (100 - saturationScore) * 0.2
    );
    return { keyword: kw, demandScore, competitionScore, saturationScore, opportunityScore };
  });

  items.sort((a, b) => b.opportunityScore - a.opportunityScore);

  const tierA = items.filter((i) => i.opportunityScore >= 75).slice(0, 3);
  const tierB = items.filter((i) => i.opportunityScore >= 55 && i.opportunityScore < 75);

  const budgetPerA = tierA.length ? (budget * 0.7) / tierA.length : 0;
  const budgetPerB = tierB.length ? (budget * 0.3) / tierB.length : 0;

  res.json({
    ok: true,
    market,
    currency,
    dailyBudget: budget,
    listingTargets: {
      highPriority: tierA.map((i) => i.keyword),
      testBucket: tierB.slice(0, 5).map((i) => i.keyword),
    },
    budgetPlan: {
      total: budget,
      tierAAllocated: +(budget * 0.7).toFixed(2),
      tierBAllocated: +(budget * 0.3).toFixed(2),
      approxBudgetPerTierA: +budgetPerA.toFixed(2),
      approxBudgetPerTierB: +budgetPerB.toFixed(2),
    },
    rawScores: items,
    actions: [
      "Safety scan every product BEFORE listing: /api/engine/safety/scan",
      "Use reverse-sourcing to ensure margin and avoid low-profit traps.",
      "Scale Tier A slowly, watch defects / returns.",
    ],
  });
});

/* ===========================================================
   8) Alerts
   =========================================================== */
router.get("/alerts", (req, res) => {
  const market = (req.query.market || "UK").toUpperCase();
  const currency = baseCurrency(market);

  const today = new Date().toISOString().slice(0, 10);
  const seed = hashToSeed(today + "|" + market);

  const saturationPressure = makeScore(seed, 31, 10, 95);
  const marginPressure = makeScore(seed, 32, 10, 95);
  const policyPressure = makeScore(seed, 33, 10, 95);

  const alerts = [];
  if (saturationPressure > 70) alerts.push("Saturation warning: focus on bundles/accessories and unique angles.");
  if (marginPressure > 65) alerts.push("Margin pressure: review pricing + protect minimum margin.");
  if (policyPressure > 60) alerts.push("Policy attention: run Safety Guard on new listings before scaling.");
  if (alerts.length === 0) alerts.push("No critical alerts – continue scaling Tier A winners and testing Tier B.");

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

/* ===========================================================
   9) SELLER SAFETY GUARD API (NEW)
   =========================================================== */

/**
 * Blacklists / red-flag patterns
 * Note: This is a conservative first version; you can expand later.
 */

// High-risk brand / trademark keywords (not all are forbidden, but they trigger caution)
const BRAND_KEYWORDS = [
  "apple", "iphone", "ipad", "airpods",
  "samsung", "galaxy",
  "sony", "ps5", "playstation",
  "nintendo", "switch",
  "nike", "adidas",
  "lego",
  "dyson",
  "rolex",
  "ray-ban", "rayban",
];

// Strong policy red flags (medical/guarantees/illegal claims)
const POLICY_RED_FLAGS = [
  "cure", "treat", "heals", "healing", "medical grade", "clinically proven",
  "fda approved", "approved by fda",
  "guaranteed", "100% guarantee", "no risk",
  "authentic guaranteed", "genuine guaranteed",
  "replica", "counterfeit", "fake",
  "wholesale price", "dropship", "drop ship",
];

// Dangerous categories / wording (examples)
const DANGEROUS_FLAGS = [
  "weapon", "stun gun", "taser", "pepper spray",
  "explosive", "firework",
];

// Returns risk triggers (common pain points)
const RETURNS_RISK_FLAGS = [
  "one size fits all", "fits all", "universal fit",
  "no returns", "final sale",
  "battery included", "lithium battery",
];

// Dropshipping “signals” in text (remove from description)
const DROPSHIP_SIGNALS = [
  "ships from amazon", "amazon", "aliexpress", "temu", "shein",
  "supplier", "warehouse partner", "fulfillment center",
];

function findMatches(text, list) {
  const t = lower(text);
  const hits = [];
  for (const w of list) {
    if (t.includes(w)) hits.push(w);
  }
  return hits;
}

function scoreSafety({ title, description }) {
  const t = lower(title);
  const d = lower(description);

  const brandHits = findMatches(t + " " + d, BRAND_KEYWORDS);
  const policyHits = findMatches(t + " " + d, POLICY_RED_FLAGS);
  const dangerHits = findMatches(t + " " + d, DANGEROUS_FLAGS);
  const returnsHits = findMatches(t + " " + d, RETURNS_RISK_FLAGS);
  const dropshipHits = findMatches(t + " " + d, DROPSHIP_SIGNALS);

  // Risk scoring model (simple, fast, conservative)
  let risk = 0;

  risk += brandHits.length * 12;     // brand/trademark risk
  risk += policyHits.length * 18;    // strong policy claims
  risk += dangerHits.length * 40;    // dangerous items
  risk += returnsHits.length * 10;   // return risks
  risk += dropshipHits.length * 15;  // dropship signals in text

  // Clamp 0..100
  risk = clamp(risk, 0, 100);

  // Verdict logic
  let verdict = "SAFE_TO_LIST";
  if (risk >= 75) verdict = "DO_NOT_LIST";
  else if (risk >= 45) verdict = "LIST_WITH_CAUTION";

  // Recommended actions
  const actions = [];
  if (dropshipHits.length) actions.push("Remove supplier / marketplace words from listing text (Amazon/AliExpress/etc).");
  if (policyHits.length) actions.push("Remove medical/guarantee claims. Use safe, factual wording only.");
  if (brandHits.length) actions.push("Check VERO/trademark risk. Avoid using brand name unless you are authorized.");
  if (dangerHits.length) actions.push("Avoid restricted/weapon/explosive items on eBay.");
  if (returnsHits.length) actions.push("Clarify sizing/specs and avoid risky wording like 'fits all'.");

  // Scale guidance
  let scaleLimit = "OK_TO_SCALE";
  if (verdict === "LIST_WITH_CAUTION") scaleLimit = "TEST_ONLY_1_TO_3_PER_DAY";
  if (verdict === "DO_NOT_LIST") scaleLimit = "DO_NOT_SCALE";

  return {
    riskScore: risk,
    verdict,
    scaleLimit,
    matches: {
      brandHits,
      policyHits,
      dangerHits,
      returnsHits,
      dropshipHits,
    },
    actions,
  };
}

function sanitizeText(input) {
  let out = normalizeText(input);

  // remove obvious dropship signals
  for (const sig of DROPSHIP_SIGNALS) {
    const re = new RegExp(sig.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    out = out.replace(re, "");
  }

  // soften medical/guarantee claims
  const replacements = [
    [/clinically proven/gi, "designed for everyday use"],
    [/medical grade/gi, "high quality"],
    [/fda approved/gi, "quality tested"],
    [/cure|treat|heals|healing/gi, "helps support comfort"],
    [/100% guarantee|guaranteed/gi, "reliable performance"],
    [/no risk/gi, "buy with confidence"],
    [/replica|counterfeit|fake/gi, ""],
  ];

  for (const [re, rep] of replacements) out = out.replace(re, rep);

  // tidy spaces
  out = out.replace(/\s{2,}/g, " ").trim();

  return out;
}

// 9.1 Safety ping
router.get("/safety/ping", (req, res) => {
  res.json({
    ok: true,
    message: "Seller Safety Guard is active.",
    endpoints: [
      "/api/engine/safety/scan?title=...&description=...&market=UK",
      "/api/engine/safety/sanitize?title=...&description=...&market=UK",
      "/api/engine/safety/blacklist",
    ],
  });
});

// 9.2 Show blacklist (for transparency)
router.get("/safety/blacklist", (req, res) => {
  res.json({
    ok: true,
    lists: {
      brandKeywords: BRAND_KEYWORDS,
      policyRedFlags: POLICY_RED_FLAGS,
      dangerousFlags: DANGEROUS_FLAGS,
      returnsRiskFlags: RETURNS_RISK_FLAGS,
      dropshipSignals: DROPSHIP_SIGNALS,
    },
  });
});

// 9.3 Scan listing text (pre-listing safety check)
router.get("/safety/scan", (req, res) => {
  const market = (req.query.market || "UK").toUpperCase();
  const currency = baseCurrency(market);

  const title = normalizeText(req.query.title || "");
  const description = normalizeText(req.query.description || "");

  if (!title && !description) {
    return res.status(400).json({
      ok: false,
      error: "Provide title or description. Example: /api/engine/safety/scan?title=...&description=...&market=UK",
    });
  }

  const result = scoreSafety({ title, description });

  res.json({
    ok: true,
    market,
    currency,
    input: { title, description },
    safety: result,
    note:
      "This safety scan runs OFF-platform (not visible to eBay). It is designed to reduce policy/trademark/returns risk before listing.",
  });
});

// 9.4 Sanitize listing text (safe rewrite)
router.get("/safety/sanitize", (req, res) => {
  const market = (req.query.market || "UK").toUpperCase();
  const currency = baseCurrency(market);

  const title = normalizeText(req.query.title || "");
  const description = normalizeText(req.query.description || "");

  if (!title && !description) {
    return res.status(400).json({
      ok: false,
      error: "Provide title or description. Example: /api/engine/safety/sanitize?title=...&description=...&market=UK",
    });
  }

  const safeTitle = sanitizeText(title);
  const safeDescription = sanitizeText(description);

  const before = scoreSafety({ title, description });
  const after = scoreSafety({ title: safeTitle, description: safeDescription });

  res.json({
    ok: true,
    market,
    currency,
    before: {
      title,
      description,
      safety: before,
    },
    after: {
      safeTitle,
      safeDescription,
      safety: after,
    },
    guidance:
      "If verdict is still DO_NOT_LIST after sanitizing, avoid the item/category or remove brand/claims completely.",
  });
});

/* ------------------------- Export ------------------------- */
module.exports = router;
