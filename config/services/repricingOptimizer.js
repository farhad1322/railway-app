// config/services/repricingOptimizer.js
// Smart profit-first repricing (NO external APIs)

function optimizePrice({
  cost,
  competitorMin,
  competitorAvg,
  score,
  phase
}) {
  if (!cost || cost <= 0) return null;

  // Base margin by confidence
  let margin;

  if (score >= 80) margin = 0.45;        // strong winner
  else if (score >= 70) margin = 0.35;   // good
  else if (score >= 60) margin = 0.25;   // acceptable
  else margin = 0.18;                    // defensive

  // Phase safety (early phases are more conservative)
  if (phase <= 1) margin -= 0.05;

  let target = cost * (1 + margin);

  // Market awareness
  if (competitorAvg && target > competitorAvg * 1.05) {
    target = competitorAvg * 1.03; // stay realistic
  }

  if (competitorMin && target < competitorMin * 0.98) {
    target = competitorMin * 0.99; // avoid race to bottom
  }

  return Number(target.toFixed(2));
}

module.exports = {
  optimizePrice
};
