// config/workers/engineWorker.js
// Background worker that processes jobs from Redis queue

const redis = require("../redis.js");

const QUEUE_KEY = "engine:queue";

async function startWorker() {
  console.log("🟢 Engine Worker started");

  while (true) {
    try {
      const job = await redis.brPop(QUEUE_KEY, 0);

      if (!job) continue;

      const payload = JSON.parse(job.element);
      console.log("⚙️ Processing job:", payload);

      // Simulated work
      await new Promise((resolve) => setTimeout(resolve, 2000));

      console.log("✅ Job completed:", payload);
    } catch (err) {
      console.error("❌ Worker error:", err.message);
    }
  }
}

if (require.main === module) {
  startWorker();
}

module.exports = startWorker;
