const redis = require("../redis");

const QUEUE_KEY = process.env.QUEUE_KEY || "engine:queue";

console.log("🚀 Engine Worker started. queue =", QUEUE_KEY);

async function pollQueue() {
  try {
    // ioredis uses lowercase command: brpop
    const result = await redis.brpop(QUEUE_KEY, 5); // wait up to 5 sec

    // result is: [key, element]  OR  null (timeout)
    if (result && result.length === 2) {
      const element = result[1];
      const payload = JSON.parse(element);

      console.log("⚙️ Processing job:", payload);

      // simulate work
      await new Promise((r) => setTimeout(r, 2000));

      console.log("✅ Job finished");
    }
  } catch (err) {
    console.error("❌ Worker error:", err);
  }
}

// run every 1 second (fine)
setInterval(pollQueue, 1000);
