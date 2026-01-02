// config/services/telegramCustomerBot.js
const axios = require("axios");

const ENABLED = String(process.env.TELEGRAM_ENABLED || "").toLowerCase() === "true";

// ✅ MUST be customer bot vars
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN2;
const CHAT_ID = process.env.TELEGRAM_CUSTOMER_CHAT_ID;

async function sendCustomerTelegram(text) {
  if (!ENABLED) {
    console.log("📴 Customer Telegram disabled (TELEGRAM_ENABLED != true)");
    return;
  }

  if (!BOT_TOKEN || !CHAT_ID) {
    // Throw so your API shows failure, not fake ok:true
    throw new Error("Customer Telegram ENV missing: TELEGRAM_BOT_TOKEN2 or TELEGRAM_CUSTOMER_CHAT_ID");
  }

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

  try {
    const resp = await axios.post(url, {
      chat_id: CHAT_ID,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true
    });

    if (!resp.data?.ok) {
      throw new Error(`Telegram API returned ok=false: ${JSON.stringify(resp.data)}`);
    }

    console.log("📨 Customer message sent OK");
  } catch (err) {
    // Important: throw so the route returns 500 and you KNOW it failed
    const details = err.response?.data || err.message;
    console.error("❌ Customer Telegram send failed:", details);
    throw err;
  }
}

module.exports = sendCustomerTelegram;
