// index.js - main Express app for eBay automation backend

const express = require("express");
const cors = require("cors");

const queueRouter = require("./config/routes/queue");
const ebayRouter = require("./config/routes/ebay");
const engineRouter = require("./config/routes/autoEngine");
const autodsIngestRouter = require("./config/routes/autodsIngest");

const { getThreshold, resetStats } = require("./config/adaptiveThreshold");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Root health check
app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Backend is running",
    endpoints: {
      ebay: "/api/ebay",
      engine: "/api/engine",
      queue: "/api/engine/queue",
      autodsIngest: "/api/autods/ingest",
      winnerThreshold: "/api/winners/threshold",
      winnerReset: "/api/winners/reset"
    }
  });
});

// API Routes
app.use("/api/ebay", ebayRouter);
app.use("/api/engine", engineRouter);
app.use("/api/engine/queue", queueRouter);
app.use("/api/autods", autodsIngestRouter);

// Winner scoring utilities (monitoring)
app.get("/api/winners/threshold", async (req, res) => {
  const threshold = await getThreshold();
  res.json({ ok: true, threshold });
});

app.post("/api/winners/reset", async (req, res) => {
  const out = await resetStats();
  res.json(out);
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Route not found" });
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
