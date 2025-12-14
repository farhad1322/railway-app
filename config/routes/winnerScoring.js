// config/routes/winnerScoring.js
const express = require("express");
const router = express.Router();
// TEST endpoint (health check for winner engine)
router.get("/test", (req, res) => {
  res.json({
    ok: true,
    message: "Winner scoring engine is alive",
    timestamp: new Date().toISOString()
  });
});

/**
 * Winner Scoring Engine (fast reject + scoring)
 * Goal: take a normalized product object and return pass/fail + score + reasons
 *
 * This is profit-first and "fail-open":
 * - It NEVER blocks your system; it simply rejects low-quality candidates.
 */

// ---------- DEFAULT CONFIG (you can tweak later) ----------
const DEFAULTS = {
  market: "UK",
  currency: "GBP",

  // Profit rules
  minNetProfit: 4.0,      // £
  minROI: 0.15,           // 15%
  feeRate: 0.14,          // eBay + payments rough blended rate (tune later)
  bufferRate: 0.03,       // safety buffer for price fluctuations (3%)

  // Shipping rules
  maxDeliveryDays: 10,
  preferDeliveryDays: 7,

  // Quality rules
  minRating: 4.2,
  minReviews: 50,

  // Competition/saturation (optional inputs)
  maxCompetition: 0.85,   // 0..1 (1 is worst). If missing, we ignore.

  // Risk rules (simple keyword flags)
  riskKeywords: [
    "nike", "adidas", "apple", "sony", "samsung", "dyson",
    "gucci", "louis vuitton", "rolex",
    "authentic", "genuine", "replica", "counterfeit",
    "vape", "nicotine", "cbd", "thc", "weapon", "gun", "knife"
  ]
};

// ---------- HELPERS ----------
function toNumber(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function safeLower(s) {
  return String(s || "").toLowerCase();
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

/**
 * Compute net profit estimate:
 * - cost = item + shipping
 * - buffer added
 * - fees removed from sell price
 */
function calcProfit({ sellPrice, itemCost, shipCost, feeRate, bufferRate }) {
  const sell = toNumber(sellPrice, 0);
  const cost = toNumber(itemCost, 0) + toNumber(shipCost, 0);
  const bufferedCost = cost * (1 + bufferRate);
  const fees = sell * feeRate;
  const netProfit = sell - fees - bufferedCost;
  const roi = bufferedCost > 0 ? netProfit / bufferedCost : 0;
  return { netProfit, roi, bufferedCost, fees };
}

/**
 * Fast Reject (cheap checks first)
 */
function fastReject(product, cfg) {
  const reasons = [];

  const title = safeLower(product.title);
  const supplier = safeLower(product.supplier);
  const inStock = product.inStock !== false; // default true unless explicitly false

  if (!title || title.length < 6) reasons.push("Missing/weak title");
  if (!supplier) reasons.push("Missing supplier");
  if (!inStock) reasons.push("Out of stock");

  // Delivery check
  const deliveryDays = toNumber(product.deliveryDays, null);
  if (deliveryDays !== null && deliveryDays > cfg.maxDeliveryDays) {
    reasons.push(`Delivery too slow (${deliveryDays}d > ${cfg.maxDeliveryDays}d)`);
  }

  // Risk keyword scan (basic)
  const hay = `${title} ${safeLower(product.brand)} ${safeLower(product.category)}`;
  for (const kw of cfg.riskKeywords) {
    if (hay.includes(kw)) {
      reasons.push(`Risk keyword detected: "${kw}"`);
      break;
    }
  }

  // Price sanity
  const itemCost = toNumber(product.itemCost, null);
  if (itemCost === null || itemCost <= 0) reasons.push("Missing/invalid itemCost");

  // Image sanity (optional)
  const imgs = Array.isArray(product.images) ? product.images : [];
  if (imgs.length < 2) reasons.push("Not enough images (<2)");

  return reasons;
}

/**
 * Deep Scoring (only if fast reject passes)
 */
function scoreProduct(product, cfg) {
  const reasons = [];

  // Inputs
  const sellPrice = toNumber(product.sellPrice, 0);
  const itemCost = toNumber(product.itemCost, 0);
  const shipCost = toNumber(product.shippingCost, 0);
  const deliveryDays = toNumber(product.deliveryDays, null);

  const rating = toNumber(product.rating, null);
  const reviews = toNumber(product.reviews, null);

  const competition = product.competition !== undefined ? toNumber(product.competition, null) : null;

  // Profit calc
  const { netProfit, roi } = calcProfit({
    sellPrice,
    itemCost,
    shipCost,
    feeRate: cfg.feeRate,
    bufferRate: cfg.bufferRate
  });

  // Profit rules (hard)
  if (netProfit < cfg.minNetProfit) reasons.push(`Low net profit (${netProfit.toFixed(2)} < ${cfg.minNetProfit})`);
  if (roi < cfg.minROI) reasons.push(`Low ROI (${Math.round(roi * 100)}% < ${Math.round(cfg.minROI * 100)}%)`);

  // Quality rules (soft/hard depending on presence)
  if (rating !== null && rating < cfg.minRating) reasons.push(`Low rating (${rating} < ${cfg.minRating})`);
  if (reviews !== null && reviews < cfg.minReviews) reasons.push(`Low reviews (${reviews} < ${cfg.minReviews})`);

  // Competition penalty (optional)
  if (competition !== null && competition > cfg.maxCompetition) {
    reasons.push(`High competition (${competition} > ${cfg.maxCompetition})`);
  }

  // --- Scoring components (0..100 each) ---
  // Profit score: strong weight
  const profitScore = clamp((netProfit / (cfg.minNetProfit * 2)) * 100, 0, 100);

  // ROI score
  const roiScore = clamp((roi / (cfg.minROI * 2)) * 100, 0, 100);

  // Delivery score (fast is better)
  let deliveryScore = 60; // neutral
  if (deliveryDays !== null) {
    deliveryScore = deliveryDays <= cfg.preferDeliveryDays
      ? 100
      : clamp(100 - (deliveryDays - cfg.preferDeliveryDays) * 12, 0, 100);
  }

  // Quality score
  let qualityScore = 60; // neutral if missing
  if (rating !== null && reviews !== null) {
    const ratingPart = clamp(((rating - 3.5) / 1.5) * 100, 0, 100);
    const reviewPart = clamp((Math.log10(reviews + 1) / Math.log10(cfg.minReviews * 10 + 1)) * 100, 0, 100);
    qualityScore = clamp((ratingPart * 0.7) + (reviewPart * 0.3), 0, 100);
  }

  // Competition score (lower competition better)
  let competitionScore = 70; // neutral if missing
  if (competition !== null) {
    competitionScore = clamp(100 - competition * 100, 0, 100);
  }

  // Final score (weighted)
  const finalScore = Math.round(
    profitScore * 0.40 +
    roiScore * 0.20 +
    deliveryScore * 0.20 +
    qualityScore * 0.15 +
    competitionScore * 0.05
  );

  // Tiering
  const tier =
    finalScore >= 85 ? "A" :
    finalScore >= 75 ? "B" :
    finalScore >= 65 ? "C" : "D";

  const pass = (reasons.length === 0) && (tier === "A" || tier === "B");

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

// ---------- ROUTES ----------

router.get("/ping", (req, res) => {
  res.json({
    ok: true,
    message: "Winner Scoring Engine is active",
    defaults: {
      minNetProfit: DEFAULTS.minNetProfit,
      minROI: DEFAULTS.minROI,
      maxDeliveryDays: DEFAULTS.maxDeliveryDays
    }
  });
});

/**
 * POST /api/engine/winners/score
 * Body: normalized product
 */
router.post("/score", (req, res) => {
  const cfg = { ...DEFAULTS, ...(req.body && req.body._cfg ? req.body._cfg : {}) };

  const product = req.body || {};
  const fastReasons = fastReject(product, cfg);

  if (fastReasons.length > 0) {
    return res.json({
      ok: true,
      pass: false,
      tier: "REJECT",
      score: 0,
      reasons: fastReasons,
      note: "Fast reject (cheap checks). Not sent to AutoDS."
    });
  }

  const result = scoreProduct(product, cfg);
  return res.json({
    ok: true,
    ...result,
    note: result.pass ? "Winner ✅ (send to AutoDS queue)" : "Not a winner (keep scanning)"
  });
});

module.exports = router;
