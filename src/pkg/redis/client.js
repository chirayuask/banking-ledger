import { createClient } from 'redis';
import config from '../../config/index.js';
import logger from '../../config/logger.js';

const redisClient = createClient({ url: config.redis.url });

redisClient.on('error', (err) => {
  logger.error('Redis client error', { error: err.message });
});

export const initRedis = async () => {
  await redisClient.connect();
  logger.info('Connected to Redis');
};

export const closeRedis = async () => {
  await redisClient.quit();
};

// Low-level helpers — all swallow errors so cache failures never crash the app
export const getKey = async (key) => {
  try {
    return await redisClient.get(key);
  } catch {
    return null;
  }
};

export const setKey = async (key, value, ttlSeconds) => {
  try {
    await redisClient.setEx(key, ttlSeconds, value);
  } catch (err) {
    logger.error('Redis SET failed', { key, error: err.message });
  }
};

export const delKey = async (key) => {
  try {
    await redisClient.del(key);
  } catch (err) {
    logger.error('Redis DEL failed', { key, error: err.message });
  }
};

// ---- Distributed lock ----

const LOCK_PREFIX = 'lock:account:';
const LOCK_TTL = 5; // seconds — auto-expires if holder crashes

/**
 * Acquire locks on one or more account IDs.
 * IDs are sorted to prevent deadlocks (deterministic ordering).
 * Returns a release function, or throws if lock cannot be acquired.
 */
export const acquireAccountLocks = async (accountIds, retries = 50, retryDelayMs = 100) => {
  const sorted = [...accountIds].filter(Boolean).sort();
  const lockKeys = sorted.map((id) => `${LOCK_PREFIX}${id}`);
  const lockValues = sorted.map(() => crypto.randomUUID());
  const acquired = [];

  try {
    for (let i = 0; i < lockKeys.length; i++) {
      let locked = false;
      for (let attempt = 0; attempt < retries; attempt++) {
        // SET NX — only succeeds if key doesn't exist
        const result = await redisClient.set(lockKeys[i], lockValues[i], { NX: true, EX: LOCK_TTL });
        if (result === 'OK') {
          acquired.push(i);
          locked = true;
          break;
        }
        await new Promise((r) => setTimeout(r, retryDelayMs));
      }
      if (!locked) {
        throw new Error(`Could not acquire lock for account ${sorted[i]}`);
      }
    }
  } catch (err) {
    // Release any locks we did acquire
    for (const idx of acquired) {
      await safeRelease(lockKeys[idx], lockValues[idx]);
    }
    throw err;
  }

  // Return release function
  return async () => {
    for (let i = lockKeys.length - 1; i >= 0; i--) {
      await safeRelease(lockKeys[i], lockValues[i]);
    }
  };
};

// Release only if we still own the lock (compare value before deleting)
const safeRelease = async (key, value) => {
  try {
    const script = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
    await redisClient.eval(script, { keys: [key], arguments: [value] });
  } catch (err) {
    logger.error('Redis lock release failed', { key, error: err.message });
  }
};

export default redisClient;
