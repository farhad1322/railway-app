// config/workers/winnerScoring.js

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function scoreWinner(product) {
  const title = String(product.title || "").toLowerCase();
  const price = Number(product.price || 0);

  let score = 0;

  if (title.length >= 20) score += 20;
  if (title.length >= 35) score += 15;

  const good = ["usb", "charger", "holder", "mount", "wireless", "led", "kit"];
  const bad = ["broken", "used", "repair", "damaged"];

  good.forEach(k => title.includes(k) && (score += 5));
  bad.forEach(k => title.includes(k) && (score -= 15));

  if (price > 5 && price <= 25) score += 25;
  if (price > 25 && price <= 60) score += 10;
  if (price <= 0) score = 0;

  return clamp(score, 0, 100);
}

module.exports = { scoreWinner };
