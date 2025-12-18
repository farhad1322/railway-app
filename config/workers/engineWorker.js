// config/workers/engineWorker.js
const redis = require("../redis");

const QUEUE_KEY = "engine:queue";

console.log("🚀 Engine Worker started");

async function pollQueue() {
  try {
    const job = await redis.brPop(QUEUE_KEY, 5); // wait 5 sec

    if (job) {
      const payload = JSON.parse(job.element);
      console.log("⚙️ Processing job:", payload);

      // simulate work
      await new Promise(r => setTimeout(r, 2000));

      console.log("✅ Job finished");
    }
  } catch (err) {
    console.error("❌ Worker error:", err.message);
  }
}

// run safely every 3 seconds
setInterval(pollQueue, 3000);
