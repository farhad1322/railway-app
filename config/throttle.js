// config/throttle.js
// Redis-based throttle for safe listing/processing velocity (anti-ban core)

const redis = require("./redis");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function getDayKey(d = new Date()) {
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`;
}

function getHourKey(d = new Date()) {
  return `${getDayKey(d)}${pad2(d.getUTCHours())}`;
}

function msToNextHour(d = new Date()) {
  const next = new Date(d);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(next.getUTCHours() + 1);
  return Math.max(0, next.getTime() - d.getTime());
}

function msToNextDay(d = new Date()) {
  const next = new Date(d);
  next.setUTCHours(0, 0, 0, 0);
  next.setUTCDate(next.getUTCDate() + 1);
  return Math.max(0, next.getTime() - d.getTime());
}

const CFG_KEY = process.env.THROTTLE_CFG_KEY || "throttle:cfg";
const LAST_RUN_KEY = process.env.THROTTLE_LAST_KEY || "throttle:lastRun";
const PENALTY_KEY = process.env.THROTTLE_PENALTY_KEY || "throttle:penalty";

// Default safe values (you can tweak later via env or API)
const DEFAULT_CFG = {
  enabled: true,

  // hard caps
  dailyCap: Number(process.env.THROTTLE_DAILY_CAP || 300),
  hourlyCap: Number(process.env.THROTTLE_HOURLY_CAP || 35),

  // base delay range between jobs
  minDelayMs: Number(process.env.THROTTLE_MIN_DELAY_MS || 6500),  // 6.5s
  maxDelayMs: Number(process.env.THROTTLE_MAX_DELAY_MS || 16000), // 16s

  // penalty when errors happen (auto-slowdown)
  penaltyStepMs: Number(process.env.THROTTLE_PENALTY_STEP_MS || 7000),
  penaltyMaxMs: Number(process.env.THROTTLE_PENALTY_MAX_MS || 120000), // 2 min max
};

async function getCfg() {
  try {
    const raw = await redis.get(CFG_KEY);
    if (!raw) return DEFAULT_CFG;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CFG, ...parsed };
  } catch {
    return DEFAULT_CFG;
  }
}

async function setCfg(newCfg) {
  const cfg = { ...(await getCfg()), ...newCfg };
  await redis.set(CFG_KEY, JSON.stringify(cfg));
  return cfg;
}

async function getPenaltyMs() {
  const raw = await redis.get(PENALTY_KEY);
  const v = raw ? Number(raw) : 0;
  return Number.isFinite(v) ? v : 0;
}

async function addPenalty() {
  const cfg = await getCfg();
  const cur = await getPenaltyMs();
  const next = Math.min(cfg.penaltyMaxMs, cur + cfg.penaltyStepMs);
  await redis.set(PENALTY_KEY, String(next));
  return next;
}

async function clearPenaltySoft() {
  // reduce penalty gradually, don’t drop to zero instantly (more stable)
  const cur = await getPenaltyMs();
  if (cur <= 0) return 0;
  const next = Math.max(0, Math.floor(cur * 0.6));
  await redis.set(PENALTY_KEY, String(next));
  return next;
}

function randomBetween(min, max) {
  if (max <= min) return min;
  return Math.floor(min + Math.random() * (max - min + 1));
}

async function getCounts() {
  const now = new Date();
  const day = getDayKey(now);
  const hour = getHourKey(now);

  const dayKey = `throttle:count:day:${day}`;
  const hourKey = `throttle:count:hour:${hour}`;

  const [dayCountRaw, hourCountRaw] = await redis.mget(dayKey, hourKey);

  return {
    dayKey,
    hourKey,
    dayCount: Number(dayCountRaw || 0),
    hourCount: Number(hourCountRaw || 0),
  };
}

async function incCounts(dayKey, hourKey) {
  // expire so counters don’t live forever
  await redis.multi()
    .incr(dayKey)
    .expire(dayKey, 60 * 60 * 48)   // 48h
    .incr(hourKey)
    .expire(hourKey, 60 * 60 * 6)   // 6h
    .exec();
}

async function waitTurn() {
  const cfg = await getCfg();
  if (!cfg.enabled) return { waitedMs: 0, reason: "disabled" };

  const now = new Date();
  const { dayKey, hourKey, dayCount, hourCount } = await getCounts();

  // caps check
  if (dayCount >= cfg.dailyCap) {
    const waitMs = msToNextDay(now);
    await sleep(waitMs);
    return { waitedMs: waitMs, reason: "dailyCap" };
  }

  if (hourCount >= cfg.hourlyCap) {
    const waitMs = msToNextHour(now);
    await sleep(waitMs);
    return { waitedMs: waitMs, reason: "hourlyCap" };
  }

  // spacing check (min delay between jobs)
  const lastRaw = await redis.get(LAST_RUN_KEY);
  const last = lastRaw ? Number(lastRaw) : 0;
  const baseDelay = randomBetween(cfg.minDelayMs, cfg.maxDelayMs);

  const penalty = await getPenaltyMs();
  const totalDelay = baseDelay + penalty;

  const since = Date.now() - last;
  const waitMs = Math.max(0, totalDelay - since);

  if (waitMs > 0) await sleep(waitMs);

  // mark run time now (before job starts)
  await redis.set(LAST_RUN_KEY, String(Date.now()));

  return { waitedMs: waitMs, reason: "spacing" , baseDelay, penalty };
}

async function onSuccess() {
  const { dayKey, hourKey } = await getCounts();
  await incCounts(dayKey, hourKey);
  await clearPenaltySoft();
}

async function onError() {
  await addPenalty();
}

async function status() {
  const cfg = await getCfg();
  const penaltyMs = await getPenaltyMs();
  const now = new Date();
  const { dayCount, hourCount } = await getCounts();
  const lastRaw = await redis.get(LAST_RUN_KEY);

  return {
    cfg,
    penaltyMs,
    dayCount,
    hourCount,
    lastRunTs: lastRaw ? Number(lastRaw) : 0,
    now: now.toISOString(),
  };
}

module.exports = {
  getCfg,
  setCfg,
  waitTurn,
  onSuccess,
  onError,
  status,
};
