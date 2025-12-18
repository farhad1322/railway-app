// config/workers/engineWorker.js
// SAFE Redis worker for Railway (no infinite loop)

const redis = require("../redis.js");

const QUEUE_KEY = "engine:queue";

console.log("🚀 Engine Worker booting...");

async function processOneJob() {
  try {
    const job = await redis.brPop(QUEUE_KEY, 5); // wait max 5 sec

    if (!job) {
      return;
    }

    const payload = JSON.parse(job.element);
    console.log("⚙️ Processing job:", payload);

    // simulate work
    await new Promise((r) => setTimeout(r, 2000));

    console.log("✅ Job completed");
  } catch (err) {
    console.error("❌ Worker error:", err.message);
  }
}

// Run worker every 3 seconds (SAFE)
setInterval(processOneJob, 3000);
