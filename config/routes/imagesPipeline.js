// config/routes/imagesPipeline.js
const express = require("express");
const router = express.Router();

// Optional (safe fallback)
let sharp = null;
try { sharp = require("sharp"); } catch (e) { sharp = null; }

let LRU = null;
try { ({ LRUCache: LRU } = require("lru-cache")); } catch (e) { LRU = null; }

const cache = LRU ? new LRU({ max: 500, ttl: 1000 * 60 * 60 }) : null;

// FAST + PROFIT SAFE LIMITS
// ---- AI Upscaler SAFE TOGGLE (OFF by default) ----
// Enable only if ?ai=on is passed

function isAiEnabled(req) {
  return String(req.query.ai || "").toLowerCase() === "on";
}

// SAFE placeholder for AI upscale (no edits, no policy risk)
// Real AI can be plugged later without changing API
async function safeAiUpscale(imageUrl) {
  return {
    enabled: true,
    mode: "safe-2x",
    message: "AI upscaling simulated (policy-safe, no content change)",
    outputUrl: imageUrl
  };
}

const FETCH_TIMEOUT_MS = 4500;
const MAX_BYTES = 4 * 1024 * 1024;
const UPSCALE_MAX = 1.8;
const MIN_PROCESS_WIDTH = 900;
const TARGET_MAX_WIDTH = 1600;

function withTimeout(ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return { ctrl, clear: () => clearTimeout(t) };
}

router.get("/ping", (req, res) => {
  res.json({
    ok: true,
    message: "Images pipeline is active",
    enhancement: sharp ? "light-enhance" : "pass-through"
  });
});

router.get("/enhance", async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.status(400).json({ ok: false, error: "Missing image url" });
  }

  if (cache && cache.has(url)) {
    const cached = cache.get(url);
    res.setHeader("Content-Type", cached.type);
    return res.send(cached.buffer);
  }

  let img;
  let type = "image/jpeg";

  try {
    const { ctrl, clear } = withTimeout(FETCH_TIMEOUT_MS);
    const r = await fetch(url, { signal: ctrl.signal });
    clear();

    if (!r.ok) throw new Error("Fetch failed");

    type = r.headers.get("content-type") || type;
    const arr = await r.arrayBuffer();
    img = Buffer.from(arr);

    if (img.length > MAX_BYTES) {
      res.setHeader("Content-Type", type);
      return res.send(img);
    }
  } catch {
    return res.json({
      ok: true,
      mode: "fail-open",
      originalUrl: url
    });
  }

  if (!sharp) {
    res.setHeader("Content-Type", type);
    return res.send(img);
  }

  try {
    const meta = await sharp(img).metadata();
    const w = meta.width || 0;

    if (w >= MIN_PROCESS_WIDTH) {
      res.setHeader("Content-Type", type);
      return res.send(img);
    }

    const out = await sharp(img)
      .resize({
        width: Math.min(TARGET_MAX_WIDTH, Math.max(900, Math.floor(w * UPSCALE_MAX))),
      })
      .sharpen(0.6)
      .modulate({ brightness: 1.05 })
      .jpeg({ quality: 88 })
      .toBuffer();

    if (cache) cache.set(url, { buffer: out, type: "image/jpeg" });

    res.setHeader("Content-Type", "image/jpeg");
    return res.send(out);
  } catch {
    res.setHeader("Content-Type", type);
    return res.send(img);
  }
});

module.exports = router;
