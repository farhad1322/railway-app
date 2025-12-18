// config/workers/engineWorker.js

const redis = require("../redis");

const QUEUE_KEY = "engine:queue";

console.log("🚀 Engine Worker started");

async function pollQueue() {
  try {
    const result = await redis.brPop(QUEUE_KEY, 5); // wait 5 sec

    if (!result) return;

    const payload = JSON.parse(result[1]);
    console.log("⚙️ Processing job:", payload);

    // simulate work
    await new Promise(r => setTimeout(r, 2000));

    console.log("✅ Job finished");
  } catch (err) {
    console.error("❌ Worker error:", err.message);
  }
}

// run every 3 seconds safely
setInterval(pollQueue, 3000);
