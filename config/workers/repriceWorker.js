// config/workers/repriceWorker.js
async function reprice(product) {
  // TODO: connect to your repricer logic
  // return updated price + rules
  return { ok: true, price: product.price };
}

module.exports = { reprice };
