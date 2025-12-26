// config/dailyRamp.js
// Controls daily listing volume to avoid bans and scale safely

const redis = require("./redis");

const KEY_COUNT = "daily:listings:count";
const KEY_DATE = "daily:listings:date";
const KEY_LIMIT = "daily:listings:limit";

// === SAFE DEFAULTS ===
const START_LIMIT = 20;     // Day 1
const MAX_LIMIT = 300;      // Hard cap
const RAMP_STEP = 20;       // Increase per day

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

async function getDailyLimit() {
  const raw = await redis.get(KEY_LIMIT);
  return raw ? Number(raw) : START_LIMIT;
}

async function resetIfNewDay() {
  const today = todayKey();
  const lastDate = await redis.get(KEY_DATE);

  if (lastDate !== today) {
    const currentLimit = await getDailyLimit();
    const newLimit = Math.min(currentLimit + RAMP_STEP, MAX_LIMIT);

    await redis.set(KEY_DATE, today);
    await redis.set(KEY_COUNT, 0);
    await redis.set(KEY_LIMIT, newLimit);

    return {
      reset: true,
      date: today,
      limit: newLimit
    };
  }

  return { reset: false };
}

async function canListOne() {
  await resetIfNewDay();

  const count = Number(await redis.get(KEY_COUNT)) || 0;
  const limit = await getDailyLimit();

  if (count >= limit) {
    return {
      allowed: false,
      count,
      limit
    };
  }

  await redis.incr(KEY_COUNT);

  return {
    allowed: true,
    count: count + 1,
    limit
  };
}

module.exports = {
  canListOne,
  getDailyLimit
};
