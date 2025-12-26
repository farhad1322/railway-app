// config/workers/engineWorker.js

const redis = require("../redis");
const { enhanceImagesForWinner } = require("../services/aiImageService");

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
   PHASE / RAMP LOGIC
================================ */
async function getPhase() {
  const day = await incrWithTTL("system:dayCounter", 60 * 60 * 24 * 365);

  if (day <= 3)  return { phase: 0, maxPerDay: 20 };
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
  return Math.floor((min + Math.random() * (max - min)) * 1000);
}

/* ================================
   WORKER LOOP
================================ */
async function pollQueue() {
  try {
    const job = await redis.brpop(QUEUE_KEY, 5);
    if (!job) return;

    const payload = JSON.parse(job[1]);
    const phaseInfo = await getPhase();

    // 🛑 DAILY LIMIT GATE
    if (!(await canListToday(phaseInfo.maxPerDay))) {
      console.log("🧱 Daily limit reached:", phaseInfo.maxPerDay);
      return;
    }

    const delay = humanDelay();
    console.log(`⏱ Phase ${phaseInfo.phase} | Delay ${Math.round(delay / 1000)}s`);
    await sleep(delay);

    /* ================================
       FEATURE FLAGS BY PHASE
    ================================ */
    const enableRepricing = phaseInfo.phase >= 2;
    const enableAIImages = phaseInfo.phase >= 3;

    /* ================================
       💰 REPRICING (SAFE)
    ================================ */
    if (enableRepricing) {
      payload.repricing = {
        mode: "competitive",
        minMarginPercent: 12,
        maxIncreasePercent: 8,
        checkedAt: new Date().toISOString()
      };
      console.log("💰 Repricing enabled");
    }

    /* ================================
       🖼️ AI IMAGE ENHANCEMENT (WINNERS ONLY)
    ================================ */
    if (enableAIImages) {
      try {
        const imageResult = await enhanceImagesForWinner(payload);

        payload.aiImages = {
          status: "done",
          images: imageResult.images,
          costUSD: imageResult.costUSD
        };

        console.log(
          `🖼️ AI images generated (${imageResult.images.length}) | $${imageResult.costUSD}`
        );
      } catch (imgErr) {
        payload.aiImages = { status: "failed" };
        console.warn("⚠️ AI image failed:", imgErr.message);
      }
    }

    /* ================================
       🚀 FINAL ACTION (SIMULATED)
    ================================ */
    console.log("✅ Listed:", payload.title || payload.sku);

  } catch (err) {
    console.error("❌ Worker error:", err.message);
  }
}

console.log("🚀 Engine Worker running");
setInterval(pollQueue, 1000);
