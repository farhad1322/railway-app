// index.js - main Express app for eBay automation backend

const express = require("express");
const cors = require("cors");

const queueRouter = require("./config/routes/queue");
const ebayRouter = require("./config/routes/ebay");
const engineRouter = require("./config/routes/autoEngine");
const autodsIngestRouter = require("./config/routes/autodsIngest");
const throttleRouter = require("./config/routes/throttle");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Backend is running",
    endpoints: {
      ebay: "/api/ebay",
      engine: "/api/engine",
      queue: "/api/engine/queue",
      autods: "/api/autods",
      throttle: "/api/throttle/status"
    }
  });
});

app.use("/api/ebay", ebayRouter);
app.use("/api/engine", engineRouter);
app.use("/api/engine/queue", queueRouter);
app.use("/api/autods", autodsIngestRouter);
app.use("/api/throttle", throttleRouter);

app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Route not found" });
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
