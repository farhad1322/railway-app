// config/velocityLock.js
const redis = require("./redis");

function dayKey(prefix) {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${prefix}:${y}-${m}-${day}`;
}

function minuteKey(prefix) {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${prefix}:${y}-${m}-${day}:${hh}:${mm}`;
}

function hourKey(prefix) {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  return `${prefix}:${y}-${m}-${day}:${hh}`;
}

async function incrWithTTL(key, ttlSeconds) {
  const val = await redis.incr(key);
  if (val === 1) {
    await redis.expire(key, ttlSeconds);
  }
  return val;
}

async function canConsume({ maxPerMinute, maxPerHour, maxPerDay }) {
  const kMin = minuteKey("engine:listed:minute");
  const kHr = hourKey("engine:listed:hour");
  const kDay = dayKey("engine:listed:day");

  // read current counters (don’t increment yet)
  const [cMin, cHr, cDay] = await Promise.all([
    redis.get(kMin),
    redis.get(kHr),
    redis.get(kDay),
  ]);

  const nMin = Number(cMin) || 0;
  const nHr = Number(cHr) || 0;
  const nDay = Number(cDay) || 0;

  const blocked =
    (maxPerMinute != null && nMin >= maxPerMinute) ||
    (maxPerHour != null && nHr >= maxPerHour) ||
    (maxPerDay != null && nDay >= maxPerDay);

  return { ok: !blocked, counts: { minute: nMin, hour: nHr, day: nDay } };
}

async function consumeOne() {
  // increment all 3 counters
  await Promise.all([
    incrWithTTL(minuteKey("engine:listed:minute"), 70),
    incrWithTTL(hourKey("engine:listed:hour"), 3700),
    incrWithTTL(dayKey("engine:listed:day"), 90000),
  ]);
  return { ok: true };
}

async function getCounters() {
  const [cMin, cHr, cDay] = await Promise.all([
    redis.get(minuteKey("engine:listed:minute")),
    redis.get(hourKey("engine:listed:hour")),
    redis.get(dayKey("engine:listed:day")),
  ]);
  return {
    minute: Number(cMin) || 0,
    hour: Number(cHr) || 0,
    day: Number(cDay) || 0,
  };
}

module.exports = { canConsume, consumeOne, getCounters };
