const express = require("express");
const cors = require("cors");
const ebayRouter = require("./routes/ebay");

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Root route – just a welcome message
app.get("/", (req, res) => {
  res.send("✅ Backend is running on Railway (Farhad eBay UK+US backend)");
});

// Health check route
app.get("/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// eBay routes (UK + US + future markets)
app.use("/ebay", ebayRouter);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server started on port ${PORT}`);
});
