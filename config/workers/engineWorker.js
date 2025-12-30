// config/workers/engineWorker.js
// WINNER MEMORY + PROFIT REPRICING + (OPTIONAL AI IMAGES) + ADAPTIVE THRESHOLD (SELF-TUNING)

const redis = require("../redis");
const winnerMemory = require("../services/winnerMemory");
const { computePrice } = require("../services/repricingService");
const { estimateCompetitors } = require("../services/competitorService");
const { optimizePrice } = require("../services/repricingOptimizer");

// ===== OPTIONAL AI IMAGE SERVICE (SAFE) =====
// NOTE: It will ONLY call external API if IMAGE_ENHANCE_ENABLED === "1" AND API vars exist.
// Otherwise it just skips safely.
let enhanceProductImages = null;
try {
  ({ enhanceProductImages } = require("../services/aiImageService"));
} catch (e) {
  enhanceProductImages = null;
}

/* ================================
   CONFIG
================================ */
const QUEUE_KEY = process.env.QUEUE_KEY || "engine:queue";

// Adaptive threshold settings (safe defaults)
const THRESHOLD_DEFAULT = Number(process.env.PASS_THRESHOLD_DEFAULT || 65);
const THRESHOLD_MIN = Number(process.env.PASS_THRESHOLD_MIN || 50);
const THRESHOLD_MAX = Number(process.env.PASS_THRESHOLD_MAX || 85);

// The system tries to keep pass-rate in this range
const TARGET_PASSRATE_LOW = Number(process.env.TARGET_PASSRATE_LOW || 0.18);
const TARGET_PASSRATE_HIGH = Number(process.env.TARGET_PASSRATE_HIGH || 0.35);

// Minimum samples before adjusting threshold
const ADAPT_MIN_SAMPLES = Number(process.env.ADAPT_MIN_SAMPLES || 20);

// How much to change when too strict/too loose
const ADAPT_STEP = Number(process.env.ADAPT_STEP || 2);

/* ================================
   HELPERS
================================ */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function todayKey(name) {
  const d = new Date().toISOString().slice(0, 10);
  return `${name}:${d}`;
}

async function incrWithTTL(key, ttlSeconds) {
  const val = await redis.incr(key);
  if (val === 1) await redis.expire(key, ttlSeconds);
  return val;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/* ================================
   PHASE LOGIC
================================ */
async function getPhase() {
  const day = await incrWithTTL("system:dayCounter", 60 * 60 * 24 * 365);

  if (day <= 3) return { phase: 0, maxPerDay: 20 };
  if (day <= 10) return { phase: 1, maxPerDay: 50 };
  if (day <= 20) return { phase: 2, maxPerDay: 100 };
  if (day <= 30) return { phase: 3, maxPerDay: 160 };
  if (day <= 60) return { phase: 4, maxPerDay: 200 };
  return { phase: 5, maxPerDay: 300 };
}

/* ================================
   SAFETY CHECKS
================================ */
async function canListToday(maxPerDay) {
  const key = todayKey("limit:listings");
  const count = await incrWithTTL(key, 60 * 60 * 30);
  return count <= maxPerDay;
}

function humanDelay() {
  const min = Number(process.env.LISTING_DELAY_MIN_SEC || 600);
  const max = Number(process.env.LISTING_DELAY_MAX_SEC || 1800);
  return (min + Math.random() * (max - min)) * 1000;
}

/* ================================
   ADAPTIVE THRESHOLD (SELF-TUNING)
   - Stores current threshold in Redis
   - Tracks daily seen/passed
   - Adjusts threshold after enough samples
================================ */
async function getAdaptiveThreshold() {
  const raw = await redis.get("adaptive:threshold");
  const t = raw ? Number(raw) : THRESHOLD_DEFAULT;
  return clamp(t, THRESHOLD_MIN, THRESHOLD_MAX);
}

async function setAdaptiveThreshold(newVal) {
  const t = clamp(Number(newVal), THRESHOLD_MIN, THRESHOLD_MAX);
  await redis.set("adaptive:threshold", String(t));
  return t;
}

async function recordAdaptiveSample(passed) {
  const seenKey = todayKey("adaptive:seen");
  const passKey = todayKey("adaptive:passed");

  // keep for 2 days
  const ttl = 60 * 60 * 48;

  const seen = await incrWithTTL(seenKey, ttl);
  const passedCount = passed ? await incrWithTTL(passKey, ttl) : Number(await redis.get(passKey) || 0);

  const passRate = seen > 0 ? passedCount / seen : 0;

  // Store a “latest snapshot” for dashboard (read-only)
  await redis.set(
    "adaptive:snapshot",
    JSON.stringify({
      threshold: await getAdaptiveThreshold(),
      seen,
      passed: passedCount,
      passRate: Number(passRate.toFixed(4)),
      timestamp: new Date().toISOString(),
    })
  );

  return { seen, passed: passedCount, passRate };
}

async function maybeAdjustThreshold() {
  const seenKey = todayKey("adaptive:seen");
  const passKey = todayKey("adaptive:passed");

  const seen = Number(await redis.get(seenKey) || 0);
  const passed = Number(await redis.get(passKey) || 0);
  if (seen < ADAPT_MIN_SAMPLES) return null;

  const passRate = seen > 0 ? passed / seen : 0;

  let current = await getAdaptiveThreshold();
  let next = current;

  // If too many are passing -> threshold too easy -> raise it
  if (passRate > TARGET_PASSRATE_HIGH) next = current + ADAPT_STEP;

  // If too few are passing -> threshold too strict -> lower it
  if (passRate < TARGET_PASSRATE_LOW) next = current - ADAPT_STEP;

  next = clamp(next, THRESHOLD_MIN, THRESHOLD_MAX);

  if (next !== current) {
    await setAdaptiveThreshold(next);
    console.log(
      `🧠 Adaptive threshold adjusted: ${current} → ${next} (passRate=${Math.round(passRate * 100)}%, seen=${seen})`
    );
  }

  // IMPORTANT: do NOT reset daily counters — let it learn through the day
  return { current, next, passRate, seen, passed };
}

/* ================================
   WORKER LOOP
================================ */
async function pollQueue() {
  try {
    const job = await redis.brpop(QUEUE_KEY, 5);
    if (!job) return;

    const payload = JSON.parse(job[1]);
    const sku = payload.sku;

    /* 🧠 WINNER MEMORY — HARD GATE */
    if (await winnerMemory.isLoser(sku)) {
      console.log("⛔ Skipped known LOSER:", sku);
      return;
    }
    if (await winnerMemory.isWinner(sku)) {
      console.log("⭐ Known WINNER — priority listing:", sku);
    }

    const phaseInfo = await getPhase();

    if (!(await canListToday(phaseInfo.maxPerDay))) {
      console.log("🧱 Daily limit reached:", phaseInfo.maxPerDay);
      return;
    }

    const delay = humanDelay();
    console.log(`⏱ Phase ${phaseInfo.phase} | Delay ${Math.round(delay / 1000)}s`);
    await sleep(delay);

    /* ================================
       SCORE GATE (SIMULATED)
       ✅ NOW USES ADAPTIVE THRESHOLD
    ================================ */
    const score = payload.score || Math.floor(Math.random() * 100);
    const PASS_THRESHOLD = await getAdaptiveThreshold();

    const passed = score >= PASS_THRESHOLD;

    // record samples for learning
    const stats = await recordAdaptiveSample(passed);

    console.log(
      `🧠 Threshold=${PASS_THRESHOLD} | Score=${score} | Passed=${passed} | passRate=${Math.round(
        stats.passRate * 100
      )}% (seen=${stats.seen})`
    );

    if (passed) {
      await winnerMemory.markWinner(sku, score);
      console.log("✅ WINNER saved:", sku, "score:", score);
    } else {
      await winnerMemory.markLoser(sku);
      console.log("❌ LOSER blocked forever:", sku, "score:", score);
      // still try to adjust threshold after collecting samples
      await maybeAdjustThreshold();
      return;
    }

    // adjust after a winner too (so it can learn)
    await maybeAdjustThreshold();

    /* ================================
       SMART REPRICING (READ-ONLY)
================================ */
    payload.enableRepricing = phaseInfo.phase >= 2;

    if (payload.enableRepricing) {
      const baseCost = Number(payload.cost || payload.price || 0);

      const competitors = estimateCompetitors(payload);
      const competitorMin = competitors.competitorMin;
      const competitorAvg = competitors.competitorAvg;

      const pricing = computePrice({
        baseCost,
        competitorMin,
        competitorAvg,
        minMarginPercent: 12,
        maxIncreasePercent: 20,
      });

      // OPTIONAL optimizer (still read-only)
      const optimized = optimizePrice({
        baseCost,
        competitorMin,
        competitorAvg,
        recommendedPrice: pricing.recommendedPrice,
      });

      payload.repricing = {
        mode: "profit-smart",
        recommendation: pricing,
        optimized,
        evaluatedAt: new Date().toISOString(),
      };

      console.log("💰 Price suggested:", pricing.recommendedPrice, pricing.reason);
      if (optimized?.optimizedPrice) {
        console.log("💰 Optimized price:", optimized.optimizedPrice, optimized.reason || "");
      }
    }

    /* ================================
       AI IMAGES (SAFE, OPTIONAL)
       - Only runs if phase >= 3 AND IMAGE_ENHANCE_ENABLED=1
================================ */
    payload.enableAIImages = phaseInfo.phase >= 3;

    if (payload.enableAIImages && typeof enhanceProductImages === "function") {
      try {
        const imgResult = await enhanceProductImages(payload);
        payload.aiImage = imgResult;

        if (imgResult?.ok) {
          console.log("🖼️ AI images ready:", imgResult.images?.length || 0);
        } else if (imgResult?.skipped) {
          console.log("🖼️ AI images skipped:", imgResult.reason);
        } else {
          console.log("🖼️ AI images failed:", imgResult.reason);
        }
      } catch (e) {
        console.log("🖼️ AI images error (safe):", e.message);
      }
    }

    /* ================================
       FINAL ACTION (SIMULATED)
================================ */
    console.log("🚀 LISTED:", payload.title || sku);
  } catch (err) {
    console.error("❌ Worker error:", err.message);
  }
}

console.log("🚀 Engine Worker running with WINNER MEMORY + PROFIT REPRICING + ADAPTIVE THRESHOLD");
setInterval(pollQueue, 1000);
