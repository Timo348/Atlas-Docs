import { createHash } from "node:crypto";
import { Redis } from "ioredis";

const globalForRedis = globalThis as unknown as { loginRedis?: Redis };
const redis =
  globalForRedis.loginRedis ??
  new Redis(process.env.REDIS_URL || "redis://redis:6379", {
    keyPrefix: "atlas:login:",
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
redis.on("error", () => undefined);
if (process.env.NODE_ENV !== "production") globalForRedis.loginRedis = redis;

function key(email: string, ip: string) {
  return createHash("sha256").update(`${email}|${ip}`).digest("hex");
}

export async function consumeLoginAttempt(email: string, ip: string) {
  const attemptKey = key(email, ip);
  const count = await redis.incr(attemptKey);
  if (count === 1) await redis.expire(attemptKey, 15 * 60);
  return count <= 10;
}

export async function clearLoginAttempts(email: string, ip: string) {
  await redis.del(key(email, ip));
}
