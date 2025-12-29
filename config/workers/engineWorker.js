// config/workers/engineWorker.js

const redis = require("../redis");
const winnerMemory = require("../services/winnerMemory");
const { estimateCompetitors } = require("../services/competitorService");
const { optimizePrice } = require("../services/repricingOptimizer");
const aiImageService = require("../services/aiImageService"); // ✅ FIX 1

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
  const d = new Date().toISOString().slice(0, 10);
  return `${name}:${d}`;
}

async function incrWithTTL(key, ttl) {
  const val = await redis.incr(key);
  if (val === 1) await redis.expire(key, ttl);
  return val;
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
       SCORE GATE
    ================================ */
    const score = payload.score || Math.floor(Math.random() * 100);
    const PASS_THRESHOLD = 65;

    if (score >= PASS_THRESHOLD) {
      await winnerMemory.markWinner(sku, score);
      console.log("✅ WINNER saved:", sku, "score:", score);
    } else {
      await winnerMemory.markLoser(sku);
      console.log("❌ LOSER blocked forever:", sku, "score:", score);
      return;
    }

    /* ================================
       💰 STEP D3 — PROFIT OPTIMIZED REPRICING
    ================================ */
    payload.enableRepricing = phaseInfo.phase >= 2;

    if (payload.enableRepricing) {
      const baseCost = Number(payload.cost || payload.price || 0);

      const { competitorMin, competitorAvg } =
        estimateCompetitors(payload);

      const optimizedPrice = optimizePrice({
        cost: baseCost,
        competitorMin,
        competitorAvg,
        score,
        phase: phaseInfo.phase
      });

      payload.repricing = {
        mode: "profit-optimized",
        suggestedPrice: optimizedPrice,
        baseCost,
        competitorMin,
        competitorAvg,
        score,
        evaluatedAt: new Date().toISOString()
      };

      console.log("💰 Optimized price:", optimizedPrice);
    }

    /* ================================
       🖼️ AI IMAGE GENERATION (SAFE)
    ================================ */
    payload.enableAIImages = phaseInfo.phase >= 3;

    if (payload.enableAIImages) {
      const imageResult =
        await aiImageService.enhanceProductImages(payload);

      payload.aiImage = imageResult;

      if (imageResult.ok) {
        console.log("🖼️ AI images generated for:", sku);
      } else if (imageResult.skipped) {
        console.log("🟡 AI image skipped:", imageResult.reason);
      } else {
        console.log("🔴 AI image failed:", imageResult.reason);
      }
    }

    /* ================================
       FINAL ACTION (SIMULATED)
    ================================ */
    console.log("🚀 LISTED:", payload.title || sku);

  } catch (err) {
    console.error("❌ Worker error:", err);
  }
}

console.log("🚀 Engine Worker running with WINNER MEMORY + PROFIT REPRICING + AI IMAGES");
setInterval(pollQueue, 1000);
