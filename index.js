const express = require("express");
const cors = require("cors");

const queueRouter = require("./config/routes/queue");
const ebayRouter = require("./config/routes/ebay");
const engineRouter = require("./config/routes/autoEngine");
const autodsIngestRouter = require("./config/routes/autodsIngest");
const throttleRouter = require("./config/routes/throttle");
const liveSupplierIngestRouter = require("./config/routes/liveSupplierIngest");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/", (_, res) => {
  res.json({ ok: true, message: "Backend running" });
});

app.use("/api/ebay", ebayRouter);
app.use("/api/engine", engineRouter);
app.use("/api/engine/queue", queueRouter);
app.use("/api/autods", autodsIngestRouter);
app.use("/api/throttle", throttleRouter);
app.use("/api/supplier", liveSupplierIngestRouter);

app.listen(PORT, () => {
  console.log(`✅ Server running on ${PORT}`);
});
