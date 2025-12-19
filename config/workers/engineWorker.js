const redis = require("../redis");
// ================================
// 🛡️ EBAY SAFE AUTOMATION HELPERS
// ================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelayMs() {
  const min = Number(process.env.LISTING_DELAY_MIN_SEC || 300) * 1000;
  const max = Number(process.env.LISTING_DELAY_MAX_SEC || 1800) * 1000;
  return Math.floor(min + Math.random() * (max - min));
}

function dayKey(name) {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${name}:${yyyy}-${mm}-${dd}`;
}

async function incrWithExpiry(key, ttlSeconds) {
  const val = await redis.incr(key);
  if (val === 1) await redis.expire(key, ttlSeconds);
  return val;
}

async function canListToday() {
  const maxPerDay = Number(process.env.MAX_LISTINGS_PER_DAY || 40);
  const key = dayKey("limit:listings:day");
  const count = await incrWithExpiry(key, 60 * 60 * 30);
  return count <= maxPerDay;
}

async function canListThisHour() {
  const maxPerHour = Number(process.env.MAX_LISTINGS_PER_HOUR || 6);
  const d = new Date();
  const hourKey = `${dayKey("limit:listings:hour")}:${d.getUTCHours()}`;
  const count = await incrWithExpiry(hourKey, 60 * 60 + 60);
  return count <= maxPerHour;
}

async function checkKillSwitch() {
  return String(process.env.KILL_SWITCH || "0") === "1";
}

// ================================
// END EBAY SAFE HELPERS
// ================================

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
// ================================
// 🛡️ EBAY SAFE EXECUTION GATE
// ================================

if (await checkKillSwitch()) {
  console.log("🛑 Kill switch enabled. Worker paused.");
  return;
}

if (!(await canListToday())) {
  console.log("🧱 Daily listing limit reached. Skipping job.");
  return;
}

if (!(await canListThisHour())) {
  console.log("⏳ Hourly limit reached. Waiting before retry.");
  await sleep(10 * 60 * 1000); // wait 10 minutes
  return;
}

const delay = randomDelayMs();
console.log(`⏱ Human delay before action: ${Math.round(delay / 1000)} sec`);
await sleep(delay);

// ================================
// 🚀 SAFE TO PROCEED
// ================================

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
