// config/services/repricingService.js
// SAFE smart repricing logic (no external calls yet)

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Compute a recommended price based on competitor info + margin rules.
 * This is SAFE: it only RETURNS a suggestion.
 *
 * input:
 *  - baseCost: supplier cost (your cost)
 *  - competitorMin: lowest competitor price
 *  - competitorAvg: average competitor price
 *  - minMarginPercent: minimum margin to keep
 *  - maxIncreasePercent: do not raise above this vs baseCost
 *
 * output:
 *  - { recommendedPrice, reason, meta }
 */
function computePrice({
  baseCost,
  competitorMin,
  competitorAvg,
  minMarginPercent = 12,
  maxIncreasePercent = 20
}) {
  // guard
  if (!Number.isFinite(baseCost) || baseCost <= 0) {
    return { recommendedPrice: null, reason: "invalid_base_cost" };
  }

  // minimum acceptable price based on margin
  const minAllowed = baseCost * (1 + minMarginPercent / 100);

  // strategy:
  // 1) if competitorMin exists, try to be slightly under it but not below minAllowed
  // 2) else use competitorAvg if exists
  // 3) else just use minAllowed
  let target = minAllowed;
  let reason = "min_margin";

  if (Number.isFinite(competitorMin) && competitorMin > 0) {
    target = competitorMin - 0.01;
    reason = "undercut_competitor_min";
  } else if (Number.isFinite(competitorAvg) && competitorAvg > 0) {
    target = competitorAvg;
    reason = "match_competitor_avg";
  }

  // enforce minimum margin
  if (target < minAllowed) {
    target = minAllowed;
    reason = "floor_min_margin";
  }

  // cap: don't overprice too far from cost
  const maxAllowed = baseCost * (1 + maxIncreasePercent / 100);
  if (target > maxAllowed) {
    target = maxAllowed;
    reason = "cap_max_increase";
  }

  return {
    recommendedPrice: round2(target),
    reason,
    meta: {
      baseCost: round2(baseCost),
      competitorMin: Number.isFinite(competitorMin) ? round2(competitorMin) : null,
      competitorAvg: Number.isFinite(competitorAvg) ? round2(competitorAvg) : null,
      minAllowed: round2(minAllowed),
      maxAllowed: round2(maxAllowed)
    }
  };
}

module.exports = { computePrice };
