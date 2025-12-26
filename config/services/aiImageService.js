// config/services/aiImageService.js
// AI Image Microservice Hook (safe + optional)
// If IMAGE_ENHANCE_ENABLED != "1" OR API vars missing => it safely skips.

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
  // Common formats:
  // { images: ["url1","url2"] }
  if (Array.isArray(data.images)) return data.images.filter(Boolean);

  // { output: ["url1","url2"] }  (Replicate-like)
  if (Array.isArray(data.output)) return data.output.filter(Boolean);

  // { data: ["url1"] }
  if (Array.isArray(data.data)) return data.data.filter(Boolean);

  // { result: { images: [...] } }
  if (data.result && Array.isArray(data.result.images)) {
    return data.result.images.filter(Boolean);
  }

  return [];
}

/**
 * enhanceProductImages(product)
 * Returns: { ok, images, skipped, reason, provider }
 */
async function enhanceProductImages(product) {
  const enabled = String(process.env.IMAGE_ENHANCE_ENABLED || "0") === "1";
  if (!enabled) {
    return { ok: false, skipped: true, reason: "IMAGE_ENHANCE_ENABLED is off" };
  }

  const apiUrl = process.env.IMAGE_API_URL;
  const apiKey = process.env.IMAGE_API_KEY;

  if (!apiUrl || !apiKey) {
    return { ok: false, skipped: true, reason: "Missing IMAGE_API_URL or IMAGE_API_KEY" };
  }

  const n = Number(process.env.IMAGE_IMAGES_PER_PRODUCT || 3);
  const safeMode = String(process.env.IMAGE_SAFE_MODE || "1") === "1";

  const prompt = buildSafePrompt(product);

  try {
    const resp = await axios.post(
      apiUrl,
      {
        prompt,
        n,
        safe_mode: safeMode,
        // Optional fields some providers accept:
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
        reason: "Provider returned no images",
        provider: "external",
        raw: typeof resp.data === "object" ? resp.data : String(resp.data)
      };
    }

    return {
      ok: true,
      images,
      provider: "external"
    };
  } catch (err) {
    return {
      ok: false,
      skipped: false,
      reason: "Image API request failed",
      details: err?.response?.data || err.message,
      provider: "external"
    };
  }
}

module.exports = { enhanceProductImages };
