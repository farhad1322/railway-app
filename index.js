// index.js - main Express app for eBay automation backend

const express = require("express");
const cors = require("cors");

// ===== ROUTES =====
const queueRouter = require("./config/routes/queue");
const ebayRouter = require("./config/routes/ebay");
const engineRouter = require("./config/routes/autoEngine");
const autodsIngestRouter = require("./config/routes/autodsIngest");
const throttleRouter = require("./config/routes/throttle");

// ✅ LIVE SUPPLIER INGEST
const liveSupplierIngestRouter = require("./config/routes/liveSupplierIngest");

const app = express();
const PORT = process.env.PORT || 3000;

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json());

// ===== ROOT HEALTH CHECK =====
app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Backend is running",
    endpoints: {
      ebay: "/api/ebay",
      engine: "/api/engine",
      queue: "/api/engine/queue",
      autods: "/api/autods/ingest",
      supplier: "/api/supplier/ingest",
      throttle: "/api/throttle/status"
    }
  });
});

// ===== API ROUTES =====
app.use("/api/ebay", ebayRouter);
app.use("/api/engine", engineRouter);
app.use("/api/engine/queue", queueRouter);
app.use("/api/autods", autodsIngestRouter);
app.use("/api/throttle", throttleRouter);

// ✅ SUPPLIER FEED (MUST BE AFTER express.json)
app.use("/api/supplier", liveSupplierIngestRouter);

// ===== 404 HANDLER =====
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Route not found"
  });
});

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
