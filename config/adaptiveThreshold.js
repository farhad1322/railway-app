// config/adaptiveThreshold.js
// Adaptive threshold that self-adjusts based on acceptance rate.
// Stores stats in Redis so it survives restarts.

const redis = require("./redis");

const KEY_THRESHOLD = "winner:threshold";
const KEY_SEEN = "winner:seen";
const KEY_PASSED = "winner:passed";

/**
 * 🔧 MAIN CHANGE:
 * Default threshold raised to 65
 * Products must score >= 65 to pass
 */
const DEFAULT_THRESHOLD = 65;      // <-- UPDATED (was 55)
const MIN_THRESHOLD = 45;          // safety floor
const MAX_THRESHOLD = 85;          // safety ceiling

const TARGET_PASS_RATE = 0.35;     // aim: ~35% of products pass
const WINDOW = 50;                // adjust every 50 products
const STEP = 2;                   // adjust by 2 points

async function getThreshold() {
  const raw = await redis.get(KEY_THRESHOLD);
  const t = raw ? Number(raw) : DEFAULT_THRESHOLD;
  if (!Number.isFinite(t)) return DEFAULT_THRESHOLD;
  return Math.max(MIN_THRESHOLD, Math.min(MAX_THRESHOLD, t));
}

/**
 * Update stats and (sometimes) adjust threshold.
 * @param {boolean} passed - whether candidate passed threshold
 * @returns {object} { threshold, seen, passed, passRate, adjusted }
 */
async function recordResult(passed) {
  const seen = await redis.incr(KEY_SEEN);
  if (passed) await redis.incr(KEY_PASSED);

  const passedCount = Number(await redis.get(KEY_PASSED)) || 0;
  const passRate = passedCount / seen;

  // Only adjust every WINDOW items
  if (seen % WINDOW !== 0) {
    const threshold = await getThreshold();
    return {
      threshold,
      seen,
      passed: passedCount,
      passRate,
      adjusted: false
    };
  }

  const thresholdBefore = await getThreshold();
  let thresholdAfter = thresholdBefore;

  // Too many passing → tighten
  if (passRate > TARGET_PASS_RATE + 0.05) {
    thresholdAfter = thresholdBefore + STEP;
  }
  // Too few passing → loosen
  else if (passRate < TARGET_PASS_RATE - 0.05) {
    thresholdAfter = thresholdBefore - STEP;
  }

  thresholdAfter = Math.max(
    MIN_THRESHOLD,
    Math.min(MAX_THRESHOLD, thresholdAfter)
  );

  await redis.set(KEY_THRESHOLD, String(thresholdAfter));

  return {
    threshold: thresholdAfter,
    seen,
    passed: passedCount,
    passRate,
    adjusted: thresholdAfter !== thresholdBefore
  };
}

/**
 * Reset all adaptive stats (useful after changes)
 */
async function resetStats() {
  await redis.del(KEY_THRESHOLD, KEY_SEEN, KEY_PASSED);
  await redis.set(KEY_THRESHOLD, String(DEFAULT_THRESHOLD));
  return { ok: true, threshold: DEFAULT_THRESHOLD };
}

module.exports = {
  getThreshold,
  recordResult,
  resetStats
};
