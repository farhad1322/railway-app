// config/routes/profitCalculator.js

const { MARKETS, getMarket } = require("./ebayMarkets");

// Default fee settings for each market
const DEFAULT_FEES = {
  UK: { ebayPercent: 12, paymentPercent: 2.9, fixed: 0.3 }, // GBP
  US: { ebayPercent: 13, paymentPercent: 2.9, fixed: 0.3 }, // USD
};

function round(value) {
  return Math.round(value * 100) / 100;
}

function resolveMarket(market) {
  const key = (market || "UK").toUpperCase();

  if (typeof getMarket === "function") {
    const info = getMarket(key);
    if (info) return info;
  }

  return MARKETS[key] || MARKETS.UK || Object.values(MARKETS)[0];
}

/**
 * Main profit calculator
 */
function calculateProfit({
  query = "",
  market = "UK",
  buyPrice,
  sellPrice,
  shippingCost = 0,
  otherCost = 0,
}) {
  const marketInfo = resolveMarket(market);
  const marketCode = marketInfo.code || marketInfo.id || market || "UK";
  const currency =
    marketInfo.currency || (marketCode === "US" ? "USD" : "GBP");

  const feesCfg = DEFAULT_FEES[marketCode] || DEFAULT_FEES.UK;

  const buy = Number(buyPrice);
  const sell = Number(sellPrice);
  const ship = Number(shippingCost) || 0;
  const other = Number(otherCost) || 0;

  // Percentage-based fees
  const ebayFee = (sell * feesCfg.ebayPercent) / 100;
  const paymentFee = (sell * feesCfg.paymentPercent) / 100 + feesCfg.fixed;
  const totalFees = ebayFee + paymentFee;

  const costBase = buy + ship + other;
  const totalCost = costBase + totalFees;
  const grossProfit = sell - totalCost;

  const marginPercent = sell > 0 ? (grossProfit / sell) * 100 : 0;
  const roiPercent = buy > 0 ? (grossProfit / buy) * 100 : 0;

  // Break-even price solve:
  // p * (1 - percentTotal) = costBase + fixed
  const percentTotal =
    (feesCfg.ebayPercent + feesCfg.paymentPercent) / 100;
  const denominator = 1 - percentTotal || 0.0001;
  const breakEvenPrice = (costBase + feesCfg.fixed) / denominator;

  // Simple recommended pricing bands
  const targetPrice = breakEvenPrice * 1.25; // aim ~25% margin
  const aggressivePrice = breakEvenPrice * 1.1; // more competitive

  return {
    ok: true,
    type: "profit",
    query,
    market: marketCode,
    currency,
    inputs: {
      buyPrice: round(buy),
      sellPrice: round(sell),
      shippingCost: round(ship),
      otherCost: round(other),
    },
    fees: {
      ebayPercent: feesCfg.ebayPercent,
      paymentPercent: feesCfg.paymentPercent,
      fixed: round(feesCfg.fixed),
      totalFees: round(totalFees),
    },
    results: {
      revenue: round(sell),
      totalCost: round(totalCost),
      grossProfit: round(grossProfit),
      marginPercent: round(marginPercent),
      roiPercent: round(roiPercent),
      breakEvenPrice: round(breakEvenPrice),
      recommendedPrice: {
        target: round(targetPrice),
        aggressive: round(aggressivePrice),
      },
    },
  };
}

module.exports = {
  calculateProfit,
};
