import fs from "fs";
import csv from "csv-parser";
import redis from "../redis.js";

const QUEUE_KEY = process.env.QUEUE_KEY || "engine:queue";

export async function ingestAutoDSCSV(req, res) {
  const filePath = req.body.filePath;

  if (!filePath) {
    return res.status(400).json({ error: "filePath is required" });
  }

  let count = 0;

  fs.createReadStream(filePath)
    .pipe(csv())
    .on("data", async (row) => {
      const job = {
        source: "autods",
        sku: row.SKU || row.sku,
        title: row.Title || row.title,
        price: row.Price || row.price,
        supplier: row.Supplier || "unknown",
        timestamp: Date.now()
      };

      await redis.lpush(QUEUE_KEY, JSON.stringify(job));
      count++;
    })
    .on("end", () => {
      res.json({
        ok: true,
        message: "CSV ingested successfully",
        jobsAdded: count
      });
    });
}

