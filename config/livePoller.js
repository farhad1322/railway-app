// config/livePoller.js
const redis = require("./redis");

// lock so only ONE poll runs at a time
const LOCK_KEY = "supplier:poll:lock";

async function withLock(fn, ttlSec = 120) {
  const ok = await redis.set(LOCK_KEY, "1", "NX", "EX", ttlSec);
  if (!ok) return { ok: false, skipped: true, reason: "Lock active" };
  try {
    const out = await fn();
    return { ok: true, ...out };
  } finally {
    await redis.del(LOCK_KEY);
  }
}

function startPoller({ intervalMs, runOnce }) {
  // run once at boot
  runOnce().catch(() => {});

  // then schedule
  setInterval(() => {
    runOnce().catch(() => {});
  }, intervalMs);
}

module.exports = { withLock, startPoller };
