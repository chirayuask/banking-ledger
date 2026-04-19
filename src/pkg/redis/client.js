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

export default redisClient;
