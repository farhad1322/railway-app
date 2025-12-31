// config/services/telegramService.js
const axios = require("axios");

const ENABLED = process.env.TELEGRAM_ENABLED === "1";
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegram(message) {
  if (!ENABLED || !TOKEN || !CHAT_ID) return;

  try {
    await axios.post(
      `https://api.telegram.org/bot${TOKEN}/sendMessage`,
      {
        chat_id: CHAT_ID,
        text: message,
        parse_mode: "HTML"
      },
      { timeout: 5000 }
    );
  } catch (err) {
    console.log("📡 Telegram send failed (skipped safely)");
  }
}

module.exports = { sendTelegram };
