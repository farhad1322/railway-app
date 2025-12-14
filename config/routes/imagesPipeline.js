// config/routes/imagesPipeline.js
// AutoDS + AI Image Safe Mode Pipeline (backend logic)
// NOTE: This version is "SAFE MODE" without external image processing.
// It creates a compliance + quality plan and returns approved/ordered URLs.
// Later, you can plug real enhancers (upscaler/bg-clean) behind /enhance.

const express = require("express");
const crypto = require("crypto");
const router = express.Router();

function lower(s) {
  return String(s || "").toLowerCase().trim();
}

function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}

// --- Risk signals (focus on dropshipping exposure + policy triggers) ---
const BLOCK_DOMAIN_HINTS = [
  "amazon.", "amzn.", "aliexpress.", "alibaba.", "temu.", "shein."
];

const WATERMARK_HINTS = [
  "amazon", "prime", "aliexpress", "alibaba", "temu", "shein",
  "shop-now", "best-seller", "guaranteed", "100% original", "authentic"
];

const RISKY_PARAMS = ["tag=amazon", "utm_source=amazon", "affiliate=", "affid=", "ref=amazon"];

const BRAND_HINTS = [
  "apple", "iphone", "ipad", "airpods",
  "samsung", "galaxy",
  "sony", "playstation", "ps5",
  "nintendo", "switch",
  "nike", "adidas",
  "lego", "dyson", "rolex", "rayban", "ray-ban"
];

// --- SAFE enhancement actions (do NOT change product) ---
const SAFE_ENHANCE_ACTIONS = [
  "upscale_to_1600",
  "denoise_light",
  "sharpen_mild",
  "normalize_lighting",
  "normalize_white_balance",
  "jpeg_quality_88"
];

// Heuristic scoring: URL/metadata only (image-free)
function analyzeImageMeta({ url = "", fileName = "", altText = "" }) {
  const t = lower(`${url} ${fileName} ${altText}`);

  const hits = {
    blockedDomain: BLOCK_DOMAIN_HINTS.find(d => t.includes(d)) || null,
    watermarkHint: WATERMARK_HINTS.find(w => t.includes(w)) || null,
    riskyParam: RISKY_PARAMS.find(p => t.includes(p)) || null,
    brandHint: BRAND_HINTS.find(b => t.includes(b)) || null
  };

  let riskScore = 0;
  const reasons = [];

  if (hits.blockedDomain) { riskScore += 45; reasons.push(`Blocked domain hint: ${hits.blockedDomain}`); }
  if (hits.watermarkHint) { riskScore += 35; reasons.push(`Branding/watermark hint: ${hits.watermarkHint}`); }
  if (hits.riskyParam) { riskScore += 20; reasons.push(`Risky URL parameter: ${hits.riskyParam}`); }
  if (hits.brandHint) { riskScore += 25; reasons.push(`Brand/VERO hint: ${hits.brandHint}`); }

  // Quality hints (lightweight): prefer cdn-like urls; penalize tiny thumbnails
  if (t.includes("thumb") || t.includes("thumbnail") || t.match(/(\b\d{2,3}x\d{2,3}\b)/)) {
    riskScore += 10;
    reasons.push("Possible low-resolution/thumbnail hint");
  }

  riskScore = clamp(riskScore, 0, 100);

  let verdict = "SAFE";
  if (riskScore >= 70) verdict = "BLOCK";
  else if (riskScore >= 40) verdict = "REVIEW";

  return { riskScore, verdict, reasons, hits };
}

// Deterministic ordering helper: pick “best” first (SAFE + lowest risk + not thumbnail)
function scoreForOrdering(metaResult) {
  // Lower is better for risk; SAFE gets bonus
  const base = metaResult.riskScore;
  const verdictBonus = metaResult.verdict === "SAFE" ? -15 : metaResult.verdict === "REVIEW" ? 5 : 50;
  return base + verdictBonus;
}

// Token signing for approve gate
function signToken(payloadObj) {
  const secret = process.env.IMAGE_GATE_SECRET || "dev_secret_change_me";
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

router.get("/ping", (req, res) => {
  res.json({
    ok: true,
    message: "Images Pipeline is active (SAFE MODE).",
    endpoints: ["/scan", "/enhance", "/select", "/approve"]
  });
});

/**
 * POST /scan
 * Body:
 * {
 *   "market":"UK",
 *   "listingId":"optional",
 *   "sku":"optional",
 *   "title":"optional",
 *   "images":[{"url":"...","fileName":"...","altText":"..."}, ...]
 * }
 */
router.post("/scan", (req, res) => {
  const market = (req.body?.market || "UK").toUpperCase();
  const listingId = req.body?.listingId || null;
  const sku = req.body?.sku || null;
  const title = req.body?.title || "";

  const images = Array.isArray(req.body?.images) ? req.body.images : [];
  if (images.length === 0) {
    return res.status(400).json({
      ok: false,
      error: "Provide images[] with url (and optional fileName/altText)."
    });
  }

  const results = images.map((img) => {
    const meta = analyzeImageMeta(img);
    return {
      input: img,
      ...meta
    };
  });

  const maxRisk = results.reduce((m, r) => Math.max(m, r.riskScore), 0);
  const blocked = results.filter(r => r.verdict === "BLOCK").length;
  const review = results.filter(r => r.verdict === "REVIEW").length;
  const safe = results.filter(r => r.verdict === "SAFE").length;

  res.json({
    ok: true,
    market,
    listingId,
    sku,
    title,
    summary: { total: results.length, safe, review, blocked, maxRisk },
    results,
    note:
      "Scan is metadata-only (image-free). It flags dropshipping exposure + policy/brand hints."
  });
});

/**
 * POST /enhance  (SAFE MODE)
 * This does NOT modify images yet. It returns an enhancement PLAN + recommended actions per image.
 * Body: same as /scan, or can pass `scanResults` directly.
 */
router.post("/enhance", (req, res) => {
  const market = (req.body?.market || "UK").toUpperCase();

  // allow either raw images[] OR results from /scan
  let results = [];
  if (Array.isArray(req.body?.scanResults)) {
    results = req.body.scanResults;
  } else {
    const images = Array.isArray(req.body?.images) ? req.body.images : [];
    if (images.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "Provide images[] or scanResults[]"
      });
    }
    results = images.map((img) => ({ input: img, ...analyzeImageMeta(img) }));
  }

  const enhanced = results.map((r) => {
    const url = r.input?.url || r.url || "";
    if (r.verdict === "BLOCK") {
      return {
        originalUrl: url,
        enhancedUrl: null,
        verdict: "BLOCK",
        riskScore: r.riskScore,
        actions: ["REMOVE_IMAGE"],
        reasons: r.reasons || []
      };
    }

    // SAFE MODE: we keep same URL but return plan/actions
    return {
      originalUrl: url,
      enhancedUrl: url, // placeholder (kept identical in SAFE MODE)
      verdict: r.verdict,
      riskScore: r.riskScore,
      actions: SAFE_ENHANCE_ACTIONS,
      reasons: r.reasons || []
    };
  });

  res.json({
    ok: true,
    market,
    mode: "SAFE_MODE_PLAN",
    enhanced,
    note:
      "SAFE MODE returns a plan (no real processing). Later we can connect real upscaler/bg-clean tools without changing this API."
  });
});

/**
 * POST /select
 * Input:
 * {
 *   "market":"UK",
 *   "enhanced":[{ originalUrl, enhancedUrl, verdict, riskScore, ... }, ...],
 *   "maxImages": 8
 * }
 */
router.post("/select", (req, res) => {
  const market = (req.body?.market || "UK").toUpperCase();
  const maxImages = Number(req.body?.maxImages || 8);

  const enhanced = Array.isArray(req.body?.enhanced) ? req.body.enhanced : [];
  if (enhanced.length === 0) {
    return res.status(400).json({ ok: false, error: "Provide enhanced[] from /enhance" });
  }

  // Remove BLOCK, then order best first
  const usable = enhanced
    .filter((e) => e && e.verdict !== "BLOCK" && e.enhancedUrl)
    .sort((a, b) => scoreForOrdering(a) - scoreForOrdering(b));

  // Limit count
  const ordered = usable.slice(0, clamp(maxImages, 1, 12));

  // Choose main image = first in ordered list
  const mainImage = ordered[0]?.enhancedUrl || null;

  res.json({
    ok: true,
    market,
    maxImages,
    mainImage,
    orderedUrls: ordered.map((x) => x.enhancedUrl),
    droppedCount: enhanced.length - ordered.length,
    note:
      "Selection prioritizes SAFE + lowest riskScore. Keeps 6–8 images recommended."
  });
});

/**
 * POST /approve
 * Input:
 * {
 *   "market":"UK",
 *   "listingId":"AUTO123",
 *   "sku":"SKU-1",
 *   "orderedUrls":[...]
 * }
 * Output:
 * { approved, publishToken }
 */
router.post("/approve", (req, res) => {
  const market = (req.body?.market || "UK").toUpperCase();
  const listingId = req.body?.listingId || null;
  const sku = req.body?.sku || null;
  const orderedUrls = Array.isArray(req.body?.orderedUrls) ? req.body.orderedUrls : [];

  if (!orderedUrls.length) {
    return res.status(400).json({ ok: false, error: "Provide orderedUrls[] from /select" });
  }

  // Minimal approval rules: must have at least 3 images recommended (you can tighten later)
  const approved = orderedUrls.length >= 3;

  const publishToken = approved
    ? signToken({
        market,
        listingId,
        sku,
        approvedAt: new Date().toISOString(),
        imageCount: orderedUrls.length
      })
    : null;

  res.json({
    ok: true,
    market,
    approved,
    publishToken,
    guidance: approved
      ? "Approved for publish. Use orderedUrls as your final image set in AutoDS draft."
      : "Not enough safe images. Replace risky images or choose another product.",
    note:
      "Approval is OFF-platform. eBay cannot see this token. It is for your internal safety workflow only."
  });
});

module.exports = router;
