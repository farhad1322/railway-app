// config/services/aiImageService.js
// AI Image Microservice Hook (SAFE + OPTIONAL)
// Zero cost unless explicitly enabled by env flags

const axios = require("axios");

function cleanText(x) {
  return String(x || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

// Safe prompt template (no brands, no logos)
function buildSafePrompt(product) {
  const title = cleanText(product.title || product.name || "Product");
  return [
    "Create a high-quality e-commerce product image.",
    "Pure white background, soft natural shadow, sharp focus, realistic lighting.",
    "NO logos, NO brand names, NO trademarked elements, NO text overlays, NO watermarks.",
    "Centered composition, professional studio photo style.",
    `Product: ${title}`
  ].join(" ");
}

// Tries to parse common provider response formats
function extractImages(data) {
  if (!data) return [];

  if (Array.isArray(data.images)) return data.images.filter(Boolean);
  if (Array.isArray(data.output)) return data.output.filter(Boolean);
  if (Array.isArray(data.data)) return data.data.filter(Boolean);

  if (data.result && Array.isArray(data.result.images)) {
    return data.result.images.filter(Boolean);
  }

  return [];
}

/**
 * enhanceProductImages(product)
 * Returns ALWAYS a normalized object:
 * {
 *   ok: boolean,
 *   skipped: boolean,
 *   images: [],
 *   reason?: string,
 *   provider?: string
 * }
 */
async function enhanceProductImages(product) {
  const sku = product?.sku || "UNKNOWN-SKU";

  const enabled = String(process.env.IMAGE_ENHANCE_ENABLED || "0") === "1";
  if (!enabled) {
    return {
      ok: false,
      skipped: true,
      images: [],
      reason: "IMAGE_ENHANCE_ENABLED is off"
    };
  }

  const dryRun = String(process.env.IMAGE_DRY_RUN || "0") === "1";
  if (dryRun) {
    console.log("🧪 AI IMAGE DRY-RUN for:", sku);
    return {
      ok: true,
      skipped: false,
      images: [],
      provider: "dry-run"
    };
  }

  const apiUrl = process.env.IMAGE_API_URL;
  const apiKey = process.env.IMAGE_API_KEY;

  if (!apiUrl || !apiKey) {
    return {
      ok: false,
      skipped: true,
      images: [],
      reason: "Missing IMAGE_API_URL or IMAGE_API_KEY"
    };
  }

  const n = Number(process.env.IMAGE_IMAGES_PER_PRODUCT || 3);
  const safeMode = String(process.env.IMAGE_SAFE_MODE || "1") === "1";
  const prompt = buildSafePrompt(product);

  try {
    console.log("🖼️ AI image request sent for:", sku);

    const resp = await axios.post(
      apiUrl,
      {
        prompt,
        n,
        safe_mode: safeMode,
        size: process.env.IMAGE_SIZE || "1024x1024"
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        timeout: Number(process.env.IMAGE_API_TIMEOUT_MS || 45000)
      }
    );

    const images = extractImages(resp.data);

    if (!images.length) {
      return {
        ok: false,
        skipped: false,
        images: [],
        reason: "Provider returned no images",
        provider: "external"
      };
    }

    console.log("🖼️ AI images generated:", images.length, "for", sku);

    return {
      ok: true,
      skipped: false,
      images,
      provider: "external"
    };
  } catch (err) {
    return {
      ok: false,
      skipped: false,
      images: [],
      reason: "Image API request failed",
      provider: "external",
      details: err?.response?.data || err.message
    };
  }
}

module.exports = { enhanceProductImages };
