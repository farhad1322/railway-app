// config/workers/engineWorker.js
// SAFE + MINIMAL background worker

const redis = require("../redis");

const QUEUE_KEY = "engine:queue";
const SLEEP = (ms) => new Promise(r => setTimeout(r, ms));

async function processJob(payload) {
  // ✅ STEP 1: Validate input
  if (!payload || !payload.sku || !payload.cost) {
    throw new Error("Invalid job payload");
  }

  // ✅ STEP 2: Simple profit logic (can upgrade later)
  const SELL_PRICE = payload.cost * 1.35; // 35% margin
  const PROFIT = SELL_PRICE - payload.cost;

  if (PROFIT <= 0) {
    throw new Error("No profit — job rejected");
  }

  // ✅ STEP 3: Simulated processing delay
  await SLEEP(1500);

  // ✅ STEP 4: Output (later → save DB / send to eBay)
  console.log("✅ JOB DONE:", {
    sku: payload.sku,
    cost: payload.cost,
    sellPrice: SELL_PRICE.toFixed(2),
    profit: PROFIT.toFixed(2),
  });
}

async function startWorker() {
  console.log("🚀 Engine Worker started");

  while (true) {
    try {
      const job = await redis.brPop(QUEUE_KEY, 0);
      if (!job) continue;

      const payload = JSON.parse(job.element);
      await processJob(payload);
    } catch (err) {
      console.error("❌ Worker error:", err.message);
      await SLEEP(2000); // prevent crash loop
    }
  }
}

startWorker();
