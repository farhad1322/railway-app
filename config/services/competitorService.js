// config/services/competitorService.js
// FREE competitor intelligence (NO external APIs)

function estimateCompetitors(payload) {
  const base = Number(payload.cost || payload.price || 0);
  if (!base || base <= 0) {
    return { competitorMin: null, competitorAvg: null, source: "none" };
  }

  // Market heuristics (safe assumptions)
  const competitorMin = Number((base * 1.15).toFixed(2)); // cheap sellers
  const competitorAvg = Number((base * 1.35).toFixed(2)); // normal sellers

  return {
    competitorMin,
    competitorAvg,
    source: "heuristic"
  };
}

module.exports = {
  estimateCompetitors
};
