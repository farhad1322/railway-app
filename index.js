const express = require("express");
const cors = require("cors");

// Correct path to your eBay router
const ebayRouter = require("./config/routes/ebay");

const app = express();
const PORT = process.env.PORT || 3000;

// ----------------------
// Middlewares
// ----------------------
app.use(cors());
app.use(express.json());

// ----------------------
// Connect eBay routes
// ----------------------
app.use("/api/ebay", ebayRouter);

// ----------------------
// Root route - welcome message
// ----------------------
app.get("/", (req, res) => {
  res.send("✔ Backend is running on Railway (Farhad eBay UK+US backend)!");
});

// ----------------------
// Health Check
// ----------------------
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Server is healthy!" });
});

// ----------------------
// Start server
// ----------------------
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
