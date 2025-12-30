// config/services/salesVelocityService.js
// Sales velocity–based repricing intelligence (SAFE MODE)

const redis = require("../redis");

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Record a sale event for a SKU
 */
async function recordSale({ sku, hoursToSale, profit }) {
  const now = Date.now();

  const firstSeenKey = `sales:firstSeen:${sku}`;
  const countKey = `sales:count:${sku}`;
  const lastSoldKey = `sales:lastSold:${sku}`;

  // Track first seen time
  const firstSeen = await redis.get(firstSeenKey);
  if (!firstSeen) {
    await redis.set(firstSeenKey, String(now));
  }

  // Increment sale count
  await redis.incr(countKey);

  // Track last sale time
  await redis.set(lastSoldKey, String(now));

  // Determine velocity bucket
  let velocity = "slow";
  if (hoursToSale <= 24) velocity = "fast";
  else if (hoursToSale <= 72) velocity = "medium";

  return {
    sku,
    velocity,
    hoursToSale,
    profit
  };
}

/**
 * Recommend price adjustment based on velocity
 */
function recommendPriceAdjustment({ currentPrice, velocity }) {
  let percent = 0;

  if (velocity === "fast") percent = 0.06;      // +6%
  else if (velocity === "medium") percent = 0.03; // +3%
  else percent = -0.07;                          // -7%

  const newPrice = clamp(
    currentPrice * (1 + percent),
    currentPrice * 0.85,
    currentPrice * 1.15
  );

  return {
    velocity,
    percentChange: percent,
    recommendedPrice: Number(newPrice.toFixed(2))
  };
}

module.exports = {
  recordSale,
  recommendPriceAdjustment
};
