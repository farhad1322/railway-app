// config/workers/aiImageWorker.js
async function enhanceImages(product) {
  // TODO: connect image pipeline (background remove, upscale, etc.)
  return { ok: true, images: product.images || [] };
}

module.exports = { enhanceImages };
