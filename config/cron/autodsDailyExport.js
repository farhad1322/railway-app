// config/cron/autodsDailyExport.js

const cron = require("node-cron");
const axios = require("axios");

const BASE_URL =
  process.env.BASE_URL ||
  "https://fulfilling-victory-production-d7f2.up.railway.app";

// ⏰ Run every day at 02:00 UTC
cron.schedule("0 2 * * *", async () => {
  try {
    console.log("⏰ Running daily AutoDS export...");

    const res = await axios.get(
      `${BASE_URL}/api/engine/autods/export-winners`
    );

    console.log("✅ AutoDS export completed:", res.data?.file || "OK");
  } catch (err) {
    console.error("❌ AutoDS export failed:", err.message);
  }
});

console.log("🟢 AutoDS daily cron job initialized");
