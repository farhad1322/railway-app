// config/workers/salesFeedbackWorker.js
// AUTO-FEEDBACK LOOP — ZERO RISK, SELF-LEARNING

const redis = require("../redis");
const winnerMemory = require("../services/winnerMemory");

/* ================================
   CONFIG
================================ */
const FEEDBACK_QUEUE =
  process.env.FEEDBACK_QUEUE || "engine:sales:feedback";

/* ================================
   HELPERS
================================ */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ================================
   FEEDBACK LOGIC
================================ */
async function processFeedback(payload) {
  const { sku, sold, profit = 0 } = payload;

  if (!sku) return;

  // Ignore known losers (already blocked forever)
  if (await winnerMemory.isLoser(sku)) {
    console.log("⛔ Feedback ignored (known loser):", sku);
    return;
  }

  if (sold) {
    // Boost winner confidence
    const bonus =
      profit >= 10 ? 15 :
      profit >= 5 ? 10 :
      5;

    await winnerMemory.boostWinner(sku, bonus);
    console.log(`📈 WINNER BOOSTED: ${sku} (+${bonus})`);
  } else {
    // Penalize slow/non-selling products
    await winnerMemory.penalizeWinner(sku, 5);
    console.log(`📉 WINNER PENALIZED: ${sku} (-5)`);
  }
}

/* ================================
   WORKER LOOP
================================ */
async function pollFeedback() {
  try {
    const job = await redis.brpop(FEEDBACK_QUEUE, 5);
    if (!job) return;

    const payload = JSON.parse(job[1]);
    await processFeedback(payload);

  } catch (err) {
    console.error("❌ Feedback worker error:", err.message);
  }
}

console.log("🧠 Sales Feedback Worker running (self-learning AI)");
setInterval(pollFeedback, 1500);
