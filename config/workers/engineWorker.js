// config/workers/engineWorker.js

const redis = require("../redis");

const QUEUE_KEY = "engine:queue";

console.log("🚀 Engine Worker started");

async function pollQueue() {
  try {
    // ioredis returns [key, value]
    const result = await redis.brpop(QUEUE_KEY, 5);

    if (!result) return;

    const payload = JSON.parse(result[1]);
    console.log("⚙️ Processing job:", payload);

    // simulate work
    await new Promise((r) => setTimeout(r, 2000));

    console.log("✅ Job finished");
  } catch (err) {
    console.error("❌ Worker error:", err.message);
  }
}

// run every 3 seconds safely
setInterval(pollQueue, 3000);
