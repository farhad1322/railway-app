import express from "express";
import { pushJob, getQueueStatus } from "../engineQueue.js";

const router = express.Router();

/**
 * POST /api/engine/queue/push
 */
router.post("/push", async (req, res) => {
  try {
    const job = req.body;

    if (!job || Object.keys(job).length === 0) {
      return res.status(400).json({
        ok: false,
        error: "Job payload is required",
      });
    }

    const pushed = await pushJob(job);

    res.json({
      ok: true,
      message: "Job added to queue",
      job: pushed,
    });
  } catch (err) {
    console.error("QUEUE PUSH ERROR:", err);
    res.status(500).json({
      ok: false,
      error: "Queue push failed",
    });
  }
});

/**
 * GET /api/engine/queue/status
 */
router.get("/status", async (_req, res) => {
  try {
    const status = await getQueueStatus();
    res.json({
      ok: true,
      ...status,
    });
  } catch (err) {
    console.error("QUEUE STATUS ERROR:", err);
    res.status(500).json({
      ok: false,
      error: "Queue status failed",
    });
  }
});

export default router;
