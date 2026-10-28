'use strict';

const { getRedisClient, isRedisAvailable } = require('../config/redis');

const WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED_KEYS = 20000;
const memoryCounters = new Map();

const policies = {
  api: { limit: 1200, windowMs: WINDOW_MS },
  auth: { limit: 60, windowMs: WINDOW_MS },
  upload: { limit: 40, windowMs: 60 * 60 * 1000 },
};

const countInMemory = (key, resetAt, now) => {
  let entry = memoryCounters.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt };
    memoryCounters.set(key, entry);
  }
  entry.count += 1;

  if (memoryCounters.size > MAX_TRACKED_KEYS) {
    for (const [storedKey, storedEntry] of memoryCounters) {
      if (storedEntry.resetAt <= now || memoryCounters.size >= MAX_TRACKED_KEYS) memoryCounters.delete(storedKey);
      if (memoryCounters.size < MAX_TRACKED_KEYS * 0.9) break;
    }
  }
  return entry.count;
};

const incrementCounter = async (key, resetAt, now) => {
  if (isRedisAvailable()) {
    try {
      const redis = getRedisClient();
      const redisKey = `farm-e:rate:${key}`;
      const count = await redis.incr(redisKey);
      if (count === 1) await redis.pexpire(redisKey, Math.max(1, resetAt - now));
      return { count, resetAt };
    } catch {
      // Keep the API available if the optional shared counter service drops.
      // On the free single-instance deployment, the bounded local counter remains effective.
    }
  }
  return { count: countInMemory(key, resetAt, now), resetAt };
};

const createLimiter = (name, { limit, windowMs }) => async (req, res, next) => {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetAt = windowStart + windowMs;
  const ip = String(req.ip || req.socket?.remoteAddress || 'unknown').slice(0, 120);
  const key = `${name}:${ip}:${windowStart}`;

  let result;
  try {
    result = await incrementCounter(key, resetAt, now);
  } catch {
    result = { count: countInMemory(key, resetAt, now), resetAt };
  }

  const remaining = Math.max(0, limit - result.count);
  res.set({
    'RateLimit-Limit': String(limit),
    'RateLimit-Remaining': String(remaining),
    'RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
    'RateLimit-Policy': `${limit};w=${Math.ceil(windowMs / 1000)}`,
  });

  if (result.count > limit) {
    const retryAfter = Math.max(1, Math.ceil((result.resetAt - now) / 1000));
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({
      success: false,
      message: 'Too many requests. Please wait a little and try again.',
      retryAfterSeconds: retryAfter,
    });
  }
  return next();
};

module.exports = {
  apiLimiter: createLimiter('api', policies.api),
  authLimiter: createLimiter('auth', policies.auth),
  uploadLimiter: createLimiter('upload', policies.upload),
};
