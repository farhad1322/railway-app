// config/workers/engineWorker.js
// WINNER MEMORY + PROFIT REPRICING + (OPTIONAL AI IMAGES) + ADAPTIVE THRESHOLD (SELF-TUNING)

const redis = require("../redis");
const winnerMemory = require("../services/winnerMemory");
const { computePrice } = require("../services/repricingService");
const { estimateCompetitors } = require("../services/competitorService");
const { optimizePrice } = require("../services/repricingOptimizer");

// OPTIONAL AI IMAGE SERVICE (SAFE)
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

/* ================================
   HELPERS
================================ */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function todayKey(name) {
  return `${name}:${new Date().toISOString().slice(0, 10)}`;
}

async function incrWithTTL(key, ttl) {
  const val = await redis.incr(key);
  if (val === 1) await redis.expire(key, ttl);
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
   ADAPTIVE THRESHOLD
================================ */
async function getAdaptiveThreshold() {
  const raw = await redis.get("adaptive:threshold");
  return clamp(Number(raw || 65), 50, 85);
}

async function recordAdaptiveSample(passed) {
  const seenKey = todayKey("adaptive:seen");
  const passKey = todayKey("adaptive:passed");

  const seen = await incrWithTTL(seenKey, 60 * 60 * 48);
  const passedCount = passed
    ? await incrWithTTL(passKey, 60 * 60 * 48)
    : Number(await redis.get(passKey) || 0);

  return { seen, passed: passedCount, passRate: passedCount / seen };
}

/* ================================
   WORKER LOOP
================================ */
async function pollQueue() {
  try {
    const job = await redis.brpop(QUEUE_KEY, 5);
    if (!job) return;

    const payload = JSON.parse(job[1]);
    const sku = payload.sku || "UNKNOWN-SKU";

    /* 🧠 WINNER MEMORY */
    if (await winnerMemory.isLoser(sku)) {
      console.log("⛔ LOSER skipped:", sku);
      return;
    }

    const phaseInfo = await getPhase();
    if (!(await canListToday(phaseInfo.maxPerDay))) return;

    await sleep(humanDelay());

    /* ================================
       SCORE GATE
================================ */
    const score = payload.score ?? Math.floor(Math.random() * 100);
    const threshold = await getAdaptiveThreshold();
    const passed = score >= threshold;

    const stats = await recordAdaptiveSample(passed);
    console.log(
      `🧠 score=${score} threshold=${threshold} passed=${passed} passRate=${Math.round(
        stats.passRate * 100
      )}%`
    );

    if (!passed) {
      await winnerMemory.markLoser(sku);
      return;
    }

    await winnerMemory.markWinner(sku, score);

    /* ================================
       SMART REPRICING (FIXED)
================================ */
    if (phaseInfo.phase >= 2) {
      try {
        const baseCost = Number(payload.cost || payload.price || 0);

        const competitors = estimateCompetitors(payload) || {};
        const competitorMin = Number(competitors.competitorMin || 0);
        const competitorAvg = Number(competitors.competitorAvg || 0);

        const pricing = computePrice({
          baseCost,
          competitorMin,
          competitorAvg,
          minMarginPercent: 12,
          maxIncreasePercent: 20
        });

        console.log("💰 Price suggested:", pricing.recommendedPrice);

        const optimized = optimizePrice({
          baseCost,
          competitorMin,
          competitorAvg,
          recommendedPrice: pricing.recommendedPrice
        });

        if (optimized && optimized.optimizedPrice) {
          console.log("💰 Optimized price:", optimized.optimizedPrice);
        } else {
          console.log("ℹ️ No optimization change applied");
        }

        payload.repricing = { pricing, optimized };
      } catch (e) {
        console.log("⚠️ Repricing skipped safely:", e.message);
      }
    }

    /* ================================
       AI IMAGES (SAFE)
================================ */
    if (phaseInfo.phase >= 3 && typeof enhanceProductImages === "function") {
      try {
        const img = await enhanceProductImages(payload);
        console.log(img.ok ? "🖼️ AI images ready" : "🖼️ AI image skipped");
      } catch {
        console.log("🖼️ AI image error skipped");
      }
    }

    console.log("🚀 LISTED:", payload.title || sku);

  } catch (err) {
    console.error("❌ Worker error:", err.message);
  }
}

console.log("🚀 Engine Worker running (STABLE)");
setInterval(pollQueue, 1000);
