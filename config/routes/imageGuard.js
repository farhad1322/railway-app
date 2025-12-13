// config/routes/imageGuard.js
// AutoDS-safe Image Gate (NO images required)

const express = require("express");
const router = express.Router();

/**
 * High-risk signals that cause image rejection
 * (based on eBay policy & dropshipping enforcement)
 */
const BLOCK_KEYWORDS = [
  "amazon",
  "aliexpress",
  "temu",
  "shein",
  "supplier",
  "warehouse",
  "fulfillment",
  "authentic",
  "guaranteed",
  "100%",
  "original",
  "replica",
  "counterfeit"
];

const BRAND_KEYWORDS = [
  "apple",
  "iphone",
  "ipad",
  "airpods",
  "samsung",
  "sony",
  "nike",
  "adidas",
  "lego",
  "dyson",
  "ps5",
  "playstation"
];

/**
 * IMAGE SAFETY CHECK (IMAGE-FREE)
 * Checks only metadata, URL, filename
 */
router.post("/check", (req, res) => {
  const { imageUrl = "", fileName = "", altText = "" } = req.body;

  const text = `${imageUrl} ${fileName} ${altText}`.toLowerCase();

  const keywordHit = BLOCK_KEYWORDS.find(k => text.includes(k));
  const brandHit = BRAND_KEYWORDS.find(k => text.includes(k));

  if (keywordHit || brandHit) {
    return res.json({
      ok: false,
      decision: "BLOCK",
      reason: keywordHit
        ? `High-risk keyword detected: ${keywordHit}`
        : `Brand risk detected: ${brandHit}`,
      action: "Skip image – allow AutoDS to continue without it",
      note: "No image edited or replaced. Safe AutoDS flow."
    });
  }

  return res.json({
    ok: true,
    decision: "ALLOW",
    action: "Image metadata safe",
    note: "AutoDS may proceed normally"
  });
});

module.exports = router;
