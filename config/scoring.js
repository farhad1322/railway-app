// config/scoring.js
// Simple winner scoring (0–100). Safe defaults, can be upgraded later.

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function toNumber(x) {
  const n = Number(String(x ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Score a product candidate.
 * Input can be CSV row fields or normalized object.
 */
function scoreProduct(input) {
  const title = String(input.title ?? input.Title ?? "").trim();
  const price = toNumber(input.price ?? input.Price);
  const supplier = String(input.supplier ?? input.Supplier ?? "").toLowerCase();

  let score = 0;

  // 1) Title quality (length + keywords)
  const len = title.length;
  if (len >= 20) score += 15;
  if (len >= 35) score += 10;

  const goodKeywords = ["fast", "charger", "usb", "holder", "mount", "wireless", "led", "kit", "premium"];
  const badKeywords = ["broken", "damaged", "used", "spares", "parts", "for repair"];

  const t = title.toLowerCase();
  const goodHits = goodKeywords.filter(k => t.includes(k)).length;
  const badHits = badKeywords.filter(k => t.includes(k)).length;

  score += clamp(goodHits * 4, 0, 16);
  score -= clamp(badHits * 10, 0, 30);

  // 2) Price band (example logic)
  // You can tune this later by your niche
  if (price > 0 && price <= 8) score += 8;
  if (price > 8 && price <= 25) score += 15;
  if (price > 25 && price <= 60) score += 10;
  if (price > 60) score += 4; // still possible winners, but less safe early

  // 3) Supplier trust hint (optional)
  if (supplier.includes("autods")) score += 5;
  if (supplier.includes("unknown") || supplier === "") score -= 3;

  // 4) Basic anti-junk filters
  if (!title) score = 0;
  if (price <= 0) score -= 25;

  return clamp(Math.round(score), 0, 100);
}

module.exports = { scoreProduct };
