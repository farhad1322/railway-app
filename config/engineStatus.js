// config/engineStatus.js
const redis = require("./redis");
const { getThreshold } = require("./adaptiveThreshold");

const KEY_THRESHOLD = "winner:threshold";
const KEY_SEEN = "winner:seen";
const KEY_PASSED = "winner:passed";

async function getThresholdStats() {
  const threshold = await getThreshold();
  const seen = Number(await redis.get(KEY_SEEN)) || 0;
  const passed = Number(await redis.get(KEY_PASSED)) || 0;
  const passRate = seen > 0 ? passed / seen : 0;
  return { threshold, seen, passed, passRate };
}

async function pingRedis() {
  try {
    await redis.ping();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

module.exports = { getThresholdStats, pingRedis };
