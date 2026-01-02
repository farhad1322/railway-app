const axios = require("axios");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN2;
const CHAT_ID = process.env.TELEGRAM_CUSTOMER_CHAT_ID;
const ENABLED = process.env.TELEGRAM_ENABLED === "true";

if (!BOT_TOKEN || !CHAT_ID) {
  console.warn("⚠️ Customer Telegram bot not fully configured");
}

module.exports = async function sendCustomerTelegram(text) {
  if (!ENABLED) return;

  try {
    await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        chat_id: CHAT_ID,
        text,
        parse_mode: "HTML"
      }
    );

    console.log("📨 Customer Telegram message sent");

  } catch (err) {
    console.error(
      "❌ Customer Telegram error:",
      err?.response?.data || err.message
    );
  }
};
