import { Redis } from "ioredis";
import { env } from "../config/env.js";

export const redis = new Redis(env.REDIS_URL, {
  enableReadyCheck: false,
  maxRetriesPerRequest: 1
});

redis.on("error", (error: Error) => {
  console.warn(`Redis unavailable: ${error.message}`);
});

export async function cached<T>(key: string, ttlSeconds: number, loader: () => Promise<T>) {
  try {
    const value = await redis.get(key);
    if (value) {
      return JSON.parse(value) as T;
    }

    const fresh = await loader();
    await redis.set(key, JSON.stringify(fresh), "EX", ttlSeconds);
    return fresh;
  } catch {
    return loader();
  }
}

export async function invalidateReports() {
  try {
    const keys = await redis.keys("reports:*");
    if (keys.length > 0) {
      await redis.del(keys);
    }
  } catch {
    // Cache invalidation must never block learning progress writes.
  }
}
