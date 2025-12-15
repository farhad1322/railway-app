// config/routes/winnerStore.js

const WINNERS = [];

// Max winners per batch (safe limit)
const MAX_WINNERS = 150;

function addWinner(product) {
  if (WINNERS.length >= MAX_WINNERS) return;
  WINNERS.push(product);
}

function getWinners() {
  return WINNERS;
}

function clearWinners() {
  WINNERS.length = 0;
}

module.exports = {
  addWinner,
  getWinners,
  clearWinners
};
