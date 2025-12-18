// config/workers/engineWorker.js

const redis = require("../redis");

const QUEUE_KEY = "engine:queue";

console.log("🚀 Engine Worker starting...");

async function pollQueue() {
  try {
    const job = await redis.brPop(QUEUE_KEY, 5);

    if (!job) {
      console.log("⏳ No job in queue");
      return;
    }

    const payload = JSON.parse(job[1]);
    console.log("⚙️ Processing job:", payload);

    // simulate work
    await new Promise(r => setTimeout(r, 2000));

    console.log("✅ Job finished");
  } catch (err) {
    console.error("❌ Worker error:", err);
  }
}

// run every 3 seconds
setInterval(pollQueue, 3000);
