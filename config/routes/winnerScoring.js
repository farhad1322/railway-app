// config/routes/winnerScoring.js
const express = require("express");
const router = express.Router();

/* =======================
   HEALTH / TEST ENDPOINT
======================= */
router.get("/test", (req, res) => {
  res.json({
    ok: true,
    message: "Winner scoring engine is alive",
    timestamp: new Date().toISOString()
  });
});

/* =======================
   DEFAULT CONFIG
======================= */
const DEFAULTS = {
  market: "UK",
  currency: "GBP",

  minNetProfit: 4.0,
  minROI: 0.15,
  feeRate: 0.14,
  bufferRate: 0.03,

  maxDeliveryDays: 10,
  preferDeliveryDays: 7,

  minRating: 4.2,
  minReviews: 50,

  maxCompetition: 0.85,

  riskKeywords: [
    "nike","adidas","apple","sony","samsung","dyson",
    "gucci","louis vuitton","rolex",
    "authentic","genuine","replica","counterfeit",
    "vape","nicotine","cbd","thc","weapon","gun","knife"
  ]
};

/* =======================
   HELPERS
======================= */
const toNumber = (x, f = 0) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : f;
};

const safeLower = (s) => String(s || "").toLowerCase();
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function calcProfit({ sellPrice, itemCost, shipCost, feeRate, bufferRate }) {
  const sell = toNumber(sellPrice);
  const cost = toNumber(itemCost) + toNumber(shipCost);
  const buffered = cost * (1 + bufferRate);
  const fees = sell * feeRate;
  const netProfit = sell - fees - buffered;
  const roi = buffered > 0 ? netProfit / buffered : 0;
  return { netProfit, roi };
}

/* =======================
   FAST REJECT
======================= */
function fastReject(product, cfg) {
  const reasons = [];

  if (!product.title || product.title.length < 6) reasons.push("Missing/weak title");
  if (!product.supplier) reasons.push("Missing supplier");
  if (product.inStock === false) reasons.push("Out of stock");

  if (product.deliveryDays && product.deliveryDays > cfg.maxDeliveryDays)
    reasons.push(`Delivery too slow (${product.deliveryDays}d)`);

  const hay = `${product.title} ${product.brand || ""} ${product.category || ""}`.toLowerCase();
  for (const kw of cfg.riskKeywords) {
    if (hay.includes(kw)) {
      reasons.push(`Risk keyword detected: "${kw}"`);
      break;
    }
  }

  if (!product.itemCost || product.itemCost <= 0)
    reasons.push("Missing/invalid itemCost");

  if (!Array.isArray(product.images) || product.images.length < 2)
    reasons.push("Not enough images (<2)");

  return reasons;
}

/* =======================
   SCORING
======================= */
function scoreProduct(product, cfg) {
  const reasons = [];

  const { netProfit, roi } = calcProfit({
    sellPrice: product.sellPrice,
    itemCost: product.itemCost,
    shipCost: product.shippingCost,
    feeRate: cfg.feeRate,
    bufferRate: cfg.bufferRate
  });

  if (netProfit < cfg.minNetProfit) reasons.push("Low net profit");
  if (roi < cfg.minROI) reasons.push("Low ROI");

  if (product.rating && product.rating < cfg.minRating) reasons.push("Low rating");
  if (product.reviews && product.reviews < cfg.minReviews) reasons.push("Low reviews");

  const profitScore = clamp((netProfit / (cfg.minNetProfit * 2)) * 100, 0, 100);
  const roiScore = clamp((roi / (cfg.minROI * 2)) * 100, 0, 100);
  const deliveryScore = product.deliveryDays <= cfg.preferDeliveryDays ? 100 : 70;
  const qualityScore = clamp(((product.rating || 4) - 3.5) * 60, 0, 100);

  const finalScore = Math.round(
    profitScore * 0.4 +
    roiScore * 0.2 +
    deliveryScore * 0.2 +
    qualityScore * 0.2
  );

  const tier = finalScore >= 85 ? "A" : finalScore >= 75 ? "B" : "C";
  const pass = reasons.length === 0 && (tier === "A" || tier === "B");

  return {
    pass,
    tier,
    score: finalScore,
    reasons,
    metrics: {
      netProfit: Number(netProfit.toFixed(2)),
      roi: Number((roi * 100).toFixed(1))
    }
  };
}

/* =======================
   POST (REAL USE)
======================= */
router.post("/score", (req, res) => {
  const cfg = { ...DEFAULTS };
  const product = req.body || {};

  const fast = fastReject(product, cfg);
  if (fast.length) {
    return res.json({ ok: true, pass: false, tier: "REJECT", score: 0, reasons: fast });
  }

  const result = scoreProduct(product, cfg);
  res.json({ ok: true, ...result });
});

/* =======================
   GET TEST (BROWSER SAFE)
======================= */
router.get("/score-test", (req, res) => {
  const product = {
    title: req.query.title || "Wireless Bluetooth Headphones Noise Cancelling",
    supplier: req.query.supplier || "amazon",
    itemCost: toNumber(req.query.itemCost || 18.99),
    sellPrice: toNumber(req.query.sellPrice || 39.99),
    shippingCost: toNumber(req.query.shippingCost || 3.5),
    rating: toNumber(req.query.rating || 4.6),
    reviews: toNumber(req.query.reviews || 1500),
    deliveryDays: toNumber(req.query.shippingDays || 6),
    stock: toNumber(req.query.stock || 80),
    images: new Array(toNumber(req.query.imagesCount || 5)).fill("img")
  };

  const fast = fastReject(product, DEFAULTS);
  if (fast.length) {
    return res.json({ ok: true, pass: false, tier: "REJECT", score: 0, reasons: fast });
  }

  const result = scoreProduct(product, DEFAULTS);
  res.json({ ok: true, ...result });
});

module.exports = router;
