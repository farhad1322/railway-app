// config/services/winnerMemory.js
// Persistent product intelligence using Redis

const redis = require("../redis");

function passedKey(sku) {
  return `winner:passed:${sku}`;
}

function failedKey(sku) {
  return `winner:failed:${sku}`;
}

function scoreKey(sku) {
  return `winner:score:${sku}`;
}

module.exports = {
  // Check if product already failed
  async isLoser(sku) {
    return (await redis.exists(failedKey(sku))) === 1;
  },

  // Check if product already passed
  async isWinner(sku) {
    return (await redis.exists(passedKey(sku))) === 1;
  },

  // Save winner
  async markWinner(sku, score) {
    await redis.set(passedKey(sku), "1");
    await redis.set(scoreKey(sku), String(score));
  },

  // Save loser (never retest)
  async markLoser(sku) {
    await redis.set(failedKey(sku), "1");
  },

  // Optional: get best score
  async getScore(sku) {
    const s = await redis.get(scoreKey(sku));
    return s ? Number(s) : null;
  }
};
