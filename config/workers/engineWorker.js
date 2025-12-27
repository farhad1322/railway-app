// config/workers/engineWorker.js

const redis = require("../redis");
const { requestAIImages } = require("../services/aiImageService");

/* ================================
   CONFIG
================================ */
const QUEUE_KEY = process.env.QUEUE_KEY || "engine:queue";

// Repricing toggles (safe defaults)
const REPRICE_ENABLED = String(process.env.REPRICE_ENABLED || "1") === "1";

// Repricing limits
const MIN_MARGIN_PERCENT = Number(process.env.MIN_MARGIN_PERCENT || 12);
const MAX_INCREASE_PERCENT = Number(process.env.MAX_INCREASE_PERCENT || 8);
const MAX_DECREASE_PERCENT = Number(process.env.MAX_DECREASE_PERCENT || 10);
const UNDERCUT_AMOUNT = Number(process.env.UNDERCUT_AMOUNT || 0.01);
const PRICE_ROUND_DECIMALS = Number(process.env.PRICE_ROUND_DECIMALS || 2);
const DEFAULT_MARKUP_PERCENT = Number(process.env.DEFAULT_MARKUP_PERCENT || 18);

/* ================================
   HELPERS
================================ */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function roundPrice(n) {
  const d = PRICE_ROUND_DECIMALS;
  const p = Number(n);
  if (!Number.isFinite(p)) return 0;
  return Math.round(p * Math.pow(10, d)) / Math.pow(10, d);
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
   PHASE LOGIC (0 → 300/day)
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
   REPRICING
================================ */
function extractCost(p) {
  return Number(p.itemCost ?? p.cost ?? p.supplierCost ?? p.price ?? 0) || 0;
}

function computeMinPrice(cost) {
  return roundPrice(cost * (1 + MIN_MARGIN_PERCENT / 100));
}

function computeDefaultPrice(cost) {
  return roundPrice(cost * (1 + DEFAULT_MARKUP_PERCENT / 100));
}

function applyRepricing(payload) {
  const cost = extractCost(payload);
  if (cost <= 0) return null;

  const minAllowed = computeMinPrice(cost);
  const competitor = Number(payload.competitorPrice ?? NaN);

  let target = computeDefaultPrice(cost);
  let mode = "markup";

  if (Number.isFinite(competitor) && competitor > 0) {
    mode = "competitive";
    target = competitor - UNDERCUT_AMOUNT;
    target = Math.max(
      competitor * (1 - MAX_DECREASE_PERCENT / 100),
      Math.min(target, competitor * (1 + MAX_INCREASE_PERCENT / 100))
    );
  }

  target = Math.max(target, minAllowed);

  return {
    enabled: true,
    mode,
    cost: roundPrice(cost),
    minAllowed,
    competitorPrice: Number.isFinite(competitor) ? roundPrice(competitor) : null,
    targetPrice: roundPrice(target),
    checkedAt: new Date().toISOString()
  };
}

/* ================================
   WORKER LOOP
================================ */
async function pollQueue() {
  try {
    const job = await redis.brpop(QUEUE_KEY, 5);
    if (!job) return;

    const payload = JSON.parse(job[1]);
    const phase = await getPhase();

    if (!(await canListToday(phase.maxPerDay))) {
      console.log("🧱 Daily limit reached:", phase.maxPerDay);
      return;
    }

    await sleep(humanDelay());

    /* ===== REPRICING ===== */
    payload.enableRepricing = phase.phase >= 2 && REPRICE_ENABLED;

    if (payload.enableRepricing) {
      const repr = applyRepricing(payload);
      if (repr) {
        payload.repricing = repr;
        payload.targetPrice = repr.targetPrice;
        console.log("💰 Repriced →", repr.targetPrice);
      }
    }

    /* ===== AI IMAGES (PHASE ≥ 3) ===== */
    payload.enableAIImages = phase.phase >= 3;

    if (payload.enableAIImages) {
      await requestAIImages(payload);
      console.log("🖼️ AI image requested");
    }

    /* ===== FINAL ACTION ===== */
    console.log(
      `✅ READY: ${payload.title || payload.sku} | price=${payload.targetPrice} | phase=${phase.phase}`
    );

  } catch (err) {
    console.error("❌ Worker error:", err.message);
  }
}

console.log("🚀 Engine Worker running");
setInterval(pollQueue, 1000);
