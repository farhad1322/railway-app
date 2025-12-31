// config/routes/customerBotTest.js
// TEST endpoint for Telegram customer bot

const express = require("express");
const { handleCustomerMessage } = require("../services/telegramCustomerBot");

const router = express.Router();

/**
 * POST /api/bot/customer
 * Body: { "message": "your text here" }
 */
router.post("/customer", async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({
      ok: false,
      error: "message is required"
    });
  }

  await handleCustomerMessage(message);

  res.json({
    ok: true,
    message: "Customer message processed"
  });
});

module.exports = router;
