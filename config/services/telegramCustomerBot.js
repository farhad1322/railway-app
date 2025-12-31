// config/services/telegramCustomerBot.js
// SAFE Telegram customer reply bot (no eBay API)

const axios = require("axios");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const BASE_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

if (!BOT_TOKEN || !CHAT_ID) {
  console.warn("⚠️ Telegram customer bot not configured");
}

async function sendMessage(text) {
  if (!BOT_TOKEN || !CHAT_ID) return;

  try {
    await axios.post(`${BASE_URL}/sendMessage`, {
      chat_id: CHAT_ID,
      text,
      parse_mode: "HTML"
    });
  } catch (err) {
    console.error("Telegram send failed:", err.message);
  }
}

// Simple auto-reply logic (SAFE)
function autoReply(message) {
  const msg = message.toLowerCase();

  if (msg.includes("price")) {
    return "💰 Thanks for your interest! Prices are competitive and updated daily.";
  }

  if (msg.includes("shipping")) {
    return "🚚 Shipping usually takes 5–10 business days with tracking provided.";
  }

  if (msg.includes("return")) {
    return "🔄 Returns are accepted within 30 days. Customer satisfaction is our priority.";
  }

  if (msg.includes("stock")) {
    return "📦 Yes, the item is currently in stock.";
  }

  return null; // escalate to human
}

async function handleCustomerMessage(message) {
  const reply = autoReply(message);

  if (reply) {
    await sendMessage(`🤖 <b>Auto-Reply Sent</b>\n\n${reply}`);
  } else {
    await sendMessage(
      `👤 <b>Customer Message (Manual Reply Needed)</b>\n\n"${message}"`
    );
  }
}

module.exports = {
  handleCustomerMessage,
  sendMessage
};
