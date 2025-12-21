// config/workers/engineWorker.js
const redis = require("../redis");
const throttle = require("../throttle");

// ================================
// 🛡️ SAFETY HELPERS
// ================================
function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

async function checkKillSwitch() {
  return String(process.env.KILL_SWITCH || "0") === "1";
}

// ================================
// QUEUE CONFIG
// ================================
const QUEUE_KEY = process.env.QUEUE_KEY || "engine:queue";

console.log("🚀 Engine Worker started. queue =", QUEUE_KEY);

// ================================
// MAIN LOOP
// ================================
async function pollQueue() {
  try {
    // Block until a job exists
    const result = await redis.brpop(QUEUE_KEY, 0);

    if (!result || result.length !== 2) return;

    const payloadRaw = result[1];
    const job = safeJsonParse(payloadRaw);

    if (!job) {
      console.warn("⚠️ Invalid job payload, skipping");
      return;
    }

    console.log("⚙️ Job received:", job.sku || job.title || "unknown");

    // ================================
    // 🛑 GLOBAL KILL SWITCH
    // ================================
    if (await checkKillSwitch()) {
      console.log("🛑 Kill switch enabled. Pausing worker.");
      await redis.lpush(QUEUE_KEY, payloadRaw); // push job back
      return;
    }

    // ================================
    // 🧠 ADAPTIVE THROTTLE (STEP 5)
    // ================================
    const throttleInfo = await throttle.waitTurn();
    if (throttleInfo?.waitedMs > 0) {
      console.log(
        `⏳ Throttle waited ${Math.round(
          throttleInfo.waitedMs / 1000
        )}s (${throttleInfo.reason})`
      );
    }

    try {
      // ================================
      // 🚀 PLACE REAL LOGIC HERE
      // ================================
      // Example: create listing / repricing / image pipeline
      await new Promise((r) => setTimeout(r, 2000)); // simulate work

      console.log("✅ Job completed successfully");

      // ================================
      // ✅ MARK SUCCESS (updates counters)
      // ================================
      await throttle.onSuccess();
    } catch (err) {
      console.error("❌ Job processing failed:", err?.message || err);

      // ================================
      // ⚠️ AUTO SLOWDOWN ON ERROR
      // ================================
      await throttle.onError();

      // Optional retry later
      await redis.lpush(QUEUE_KEY, payloadRaw);
    }
  } catch (err) {
    console.error("❌ Worker loop error:", err);
  }
}

// ================================
// START LOOP
// ================================
(async function run() {
  while (true) {
    await pollQueue();
  }
})();
