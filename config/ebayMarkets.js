// Configuration for supported eBay markets
// Right now: UK + US. You can add more later easily.

const MARKETS = {
  UK: {
    code: "UK",
    marketplaceId: "EBAY_GB",
    country: "GB",
    currency: "GBP",
    siteId: 3
  },
  US: {
    code: "US",
    marketplaceId: "EBAY_US",
    country: "US",
    currency: "USD",
    siteId: 0
  }
};

function listMarkets() {
  return Object.values(MARKETS);
}

function getMarket(code) {
  if (!code) return null;
  return MARKETS[code.toUpperCase()] || null;
}

module.exports = {
  MARKETS,
  listMarkets,
  getMarket
};
