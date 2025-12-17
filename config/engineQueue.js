import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL);

const QUEUE_KEY = "engine:jobs";

export async function pushJob(job) {
  const payload = {
    id: Date.now(),
    status: "pending",
    createdAt: new Date().toISOString(),
    data: job,
  };

  await redis.lpush(QUEUE_KEY, JSON.stringify(payload));
  return payload;
}

export async function getQueueStatus() {
  const length = await redis.llen(QUEUE_KEY);
  return {
    queue: QUEUE_KEY,
    totalJobs: length,
  };
}
