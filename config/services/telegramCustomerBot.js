const axios = require("axios");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CUSTOMER_CHAT_ID;

if (!TOKEN || !CHAT_ID) {
  console.warn("⚠️ Telegram CUSTOMER bot missing env variables");
}

module.exports = async function sendCustomerTelegram(message) {
  try {
    if (!TOKEN || !CHAT_ID) return;

    await axios.post(
      `https://api.telegram.org/bot${TOKEN}/sendMessage`,
      {
        chat_id: CHAT_ID,
        text: message,
        parse_mode: "HTML"
      }
    );

    console.log("📨 Customer message sent to Telegram");

  } catch (err) {
    console.error("❌ Telegram CUSTOMER send failed:", err.message);
  }
};
