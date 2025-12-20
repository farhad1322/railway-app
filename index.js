// index.js - main Express app for eBay automation backend

const express = require("express");
const cors = require("cors");

const queueRouter = require("./config/routes/queue");

// Route modules
const ebayRouter = require("./config/routes/ebay");
const engineRouter = require("./config/routes/autoEngine");
const autodsIngestRouter = require("./config/routes/autodsIngest");

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Root health check
app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Backend is running",
    endpoints: {
      ebay: "/api/ebay",
      engine: "/api/engine",
      queueAdd: "/api/engine/queue/add",
      autodsIngest: "/api/autods/ingest"
    }
  });
});

// API Routes
app.use("/api/ebay", ebayRouter);
app.use("/api/engine", engineRouter);
app.use("/api/engine/queue", queueRouter);
app.use("/api/autods", autodsIngestRouter);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Route not found"
  });
});

// Server start
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
