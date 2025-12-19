const Redis = require("ioredis");

if (!process.env.REDIS_URL) {
  console.warn("⚠️ REDIS_URL is missing. Set it in Railway Variables.");
}

const redis = new Redis(process.env.REDIS_URL);

redis.on("connect", () => console.log("✅ Redis connected"));
redis.on("error", (e) => console.error("❌ Redis error:", e.message));

module.exports = redis;
