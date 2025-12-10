const express = require("express");
const app = express();

const PORT = process.env.PORT || 3000;

// Root route
app.get("/", (req, res) => {
  res.send("✅ Backend is running on Railway (Farhad test server)");
});

// Health check route
app.get("/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// eBay automation starter route
app.get("/ebay/ping", (req, res) => {
  res.json({
    ok: true,
    message: "eBay automation backend skeleton is ready.",
    nextStep: "Add real eBay APIs and automation logic here."
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server started on port ${PORT}`);
});
