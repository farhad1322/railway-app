const express = require("express");
const sendCustomerTelegram = require("../services/telegramCustomerBot");

const router = express.Router();

/**
 * CUSTOMER MESSAGE HANDLER
 * POST /api/bot/customer
 */
router.post("/customer", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        ok: false,
        error: "Message is required"
      });
    }

    await sendCustomerTelegram(
      `💬 <b>Customer Message</b>\n\n${message}`
    );

    res.json({
      ok: true,
      message: "Customer message sent to Telegram"
    });

  } catch (err) {
    console.error("Customer bot error:", err);

    res.status(500).json({
      ok: false,
      error: "Customer bot failed"
    });
  }
});

module.exports = router;
