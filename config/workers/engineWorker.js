// config/workers/engineWorker.js

const redis = require("../redis");

/* ================================
   CONFIG
================================ */
const QUEUE_KEY = process.env.QUEUE_KEY || "engine:queue";

// Repricing toggles (safe defaults)
const REPRICE_ENABLED = String(process.env.REPRICE_ENABLED || "1") === "1";

// If competitor price exists, we adjust within safe bounds
const MIN_MARGIN_PERCENT = Number(process.env.MIN_MARGIN_PERCENT || 12); // protect profit
const MAX_INCREASE_PERCENT = Number(process.env.MAX_INCREASE_PERCENT || 8); // don't overprice too much
const MAX_DECREASE_PERCENT = Number(process.env.MAX_DECREASE_PERCENT || 10); // don't race to bottom
const UNDERCUT_AMOUNT = Number(process.env.UNDERCUT_AMOUNT || 0.01); // small undercut
const PRICE_ROUND_DECIMALS = Number(process.env.PRICE_ROUND_DECIMALS || 2);

// If no competitor price exists, we use markup floor (cost + margin)
const DEFAULT_MARKUP_PERCENT = Number(process.env.DEFAULT_MARKUP_PERCENT || 18);

/* ================================
   HELPERS
================================ */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function roundPrice(n) {
  const d = Number.isFinite(PRICE_ROUND_DECIMALS) ? PRICE_ROUND_DECIMALS : 2;
  const p = Number(n);
  if (!Number.isFinite(p)) return 0;
  const factor = Math.pow(10, d);
  return Math.round(p * factor) / factor;
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
   PHASE LOGIC (Ramp 0 → 300/day)
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
   REPRICING OPTIMIZATION (SAFE)
   - NO external calls
   - Uses competitorPrice if present in payload
   - Protects minimum margin
================================ */
function extractCost(payload) {
  // Supplier cost is usually itemCost or cost or price (depending on your feed)
  const c =
    Number(payload.itemCost ?? payload.cost ?? payload.supplierCost ?? payload.price ?? 0);
  return Number.isFinite(c) ? c : 0;
}

function extractSellPrice(payload) {
  const p = Number(payload.sellPrice ?? payload.listPrice ?? payload.targetPrice ?? 0);
  return Number.isFinite(p) ? p : 0;
}

function computeMinPriceFromCost(cost) {
  // minimum price to keep margin
  const minPrice = cost * (1 + MIN_MARGIN_PERCENT / 100);
  return roundPrice(minPrice);
}

function computeDefaultTargetPrice(cost) {
  // fallback price if no competitor info
  const p = cost * (1 + DEFAULT_MARKUP_PERCENT / 100);
  return roundPrice(p);
}

function applyRepricing(payload) {
  const cost = extractCost(payload);
  if (cost <= 0) {
    return {
      enabled: false,
      reason: "missing_cost",
      cost,
      targetPrice: extractSellPrice(payload) || 0,
    };
  }

  const minAllowed = computeMinPriceFromCost(cost);

  // competitorPrice can be provided by future modules
  const competitorPriceRaw = Number(payload.competitorPrice ?? payload.marketPrice ?? NaN);
  const hasCompetitor = Number.isFinite(competitorPriceRaw) && competitorPriceRaw > 0;

  // base price = existing sell price OR default target
  const currentSell = extractSellPrice(payload);
  const base = currentSell > 0 ? currentSell : computeDefaultTargetPrice(cost);

  let target = base;
  let mode = "markup";

  if (hasCompetitor) {
    mode = "competitive";
    const competitor = competitorPriceRaw;

    // undercut competitor slightly (safe)
    const desired = competitor - UNDERCUT_AMOUNT;

    // clamp within max increase/decrease from competitor (avoid crazy)
    const maxUp = competitor * (1 + MAX_INCREASE_PERCENT / 100);
    const maxDown = competitor * (1 - MAX_DECREASE_PERCENT / 100);

    target = desired;
    target = Math.min(target, maxUp);
    target = Math.max(target, maxDown);
  }

  // always protect minimum margin
  target = Math.max(target, minAllowed);

  // round
  target = roundPrice(target);

  return {
    enabled: true,
    mode,
    cost: roundPrice(cost),
    minAllowed,
    basePrice: roundPrice(base),
    competitorPrice: hasCompetitor ? roundPrice(competitorPriceRaw) : null,
    targetPrice: target,
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
    const phaseInfo = await getPhase();

    if (!(await canListToday(phaseInfo.maxPerDay))) {
      console.log("🧱 Daily limit reached:", phaseInfo.maxPerDay);
      return;
    }

    const delay = humanDelay();
    console.log(`⏱ Phase ${phaseInfo.phase} | Delay ${Math.round(delay / 1000)}s`);
    await sleep(delay);

    // ✅ Enable repricing starting from Phase 2 (100/day ramp)
    payload.enableRepricing = phaseInfo.phase >= 2 && REPRICE_ENABLED;

    if (payload.enableRepricing) {
      const repr = applyRepricing(payload);

      payload.repricing = {
        ...repr,
        checkedAt: new Date().toISOString(),
      };

      // Put the final price into payload.targetPrice (used later by AutoDS/eBay)
      payload.targetPrice = repr.targetPrice;

      console.log(
        `💰 Repricing: mode=${repr.mode} cost=${repr.cost} min=${repr.minAllowed} target=${repr.targetPrice}` +
          (repr.competitorPrice ? ` competitor=${repr.competitorPrice}` : "")
      );
    } else {
      // Keep safe default targetPrice if not set
      if (!payload.targetPrice) {
        const cost = extractCost(payload);
        payload.targetPrice = cost > 0 ? computeDefaultTargetPrice(cost) : extractSellPrice(payload);
      }
      console.log("💤 Repricing OFF (phase or toggle). targetPrice =", payload.targetPrice);
    }

    // 🚀 SIMULATED LISTING ACTION (no eBay/AutoDS yet)
    console.log("✅ Ready for listing pipeline:", payload.title || payload.sku, "| targetPrice:", payload.targetPrice);

  } catch (err) {
    console.error("❌ Worker error:", err.message);
  }
}

console.log("🚀 Engine Worker running. Queue =", QUEUE_KEY);
setInterval(pollQueue, 1000);
