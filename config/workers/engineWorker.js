// config/workers/engineWorker.js
// WINNER MEMORY + PROFIT REPRICING + FAST AI IMAGES + TELEGRAM ALERTS

const redis = require("../redis");
const winnerMemory = require("../services/winnerMemory");
const { computePrice } = require("../services/repricingService");
const { estimateCompetitors } = require("../services/competitorService");
const { optimizePrice } = require("../services/repricingOptimizer");

/* ================================
   OPTIONAL SERVICES (SAFE LOAD)
================================ */
let enhanceProductImages = null;
try {
  ({ enhanceProductImages } = require("../services/aiImageService"));
} catch {}

let sendTelegram = null;
try {
  ({ sendTelegram } = require("../services/telegramService"));
} catch {}

/* ================================
   CONFIG
================================ */
const QUEUE_KEY = process.env.QUEUE_KEY || "engine:queue";
const FAST_SALES_THRESHOLD = Number(process.env.FAST_SALES_THRESHOLD || 3);

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
   SAFETY
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

    /* 🧠 HARD LOSER BLOCK */
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
      `🧠 score=${score} threshold=${threshold} passed=${passed}`
    );

    if (!passed) {
      await winnerMemory.markLoser(sku);
      return;
    }

    await winnerMemory.markWinner(sku, score);

    /* ================================
       REPRICING
    ================================ */
    if (phaseInfo.phase >= 2) {
      try {
        const baseCost = Number(payload.cost || payload.price || 0);
        const competitors = estimateCompetitors(payload) || {};

        const pricing = computePrice({
          baseCost,
          competitorMin: Number(competitors.competitorMin || 0),
          competitorAvg: Number(competitors.competitorAvg || 0),
          minMarginPercent: 12,
          maxIncreasePercent: 20
        });

        const optimized = optimizePrice({
          baseCost,
          competitorMin: pricing.competitorMin,
          competitorAvg: pricing.competitorAvg,
          recommendedPrice: pricing.recommendedPrice
        });

        payload.repricing = optimized;

        console.log("💰 Price optimized");

        sendTelegram?.(
          `💰 <b>Price Optimized</b>\nSKU: <code>${sku}</code>\nPrice: <b>${optimized.finalPrice}</b>`
        );

      } catch (e) {
        console.log("⚠️ Repricing skipped:", e.message);
      }
    }

    /* ================================
       AI IMAGES (FAST WINNERS ONLY)
    ================================ */
    if (phaseInfo.phase >= 3 && typeof enhanceProductImages === "function") {
      try {
        const velocity = Number(await redis.get(`sales:velocity:${sku}`) || 0);

        if (velocity >= FAST_SALES_THRESHOLD) {
          const img = await enhanceProductImages(payload);

          if (img?.ok) {
            sendTelegram?.(
              `🖼️ <b>AI Images Generated</b>\nSKU: <code>${sku}</code>\nImages: ${img.images.length}`
            );
          }
        }

      } catch {
        console.log("🖼️ AI image skipped safely");
      }
    }

    /* ================================
       FINAL ACTION (SIMULATED)
    ================================ */
    console.log("🚀 LISTED:", payload.title || sku);

    sendTelegram?.(
      `🚀 <b>Product Listed</b>\nSKU: <code>${sku}</code>\nScore: <b>${score}</b>`
    );

  } catch (err) {
    console.error("❌ Worker error:", err.message);
    sendTelegram?.(`❌ <b>Engine Error</b>\n${err.message}`);
  }
}

/* ================================
   BOOT
================================ */
console.log("🚀 Engine Worker running (STABLE + TELEGRAM)");
sendTelegram?.("🚀 <b>Engine Worker Started</b>\nStatus: STABLE");

setInterval(pollQueue, 1000);
