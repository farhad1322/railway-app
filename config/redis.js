const Redis = require("ioredis");

let redis;

if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL);
  console.log("✅ Redis connected");
} else {
  console.warn("⚠️ REDIS_URL not found, Redis disabled");
}

module.exports = redis;
