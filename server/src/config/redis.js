'use strict';

const Redis = require('ioredis');
const logger = require('../utils/logger');
const config = require('./env');

let client = null;
let isConnected = false;

const getRedisClient = () => {
  if (client) return client;
  if (!config.redis.url) return null;

  try {
    client = new Redis(config.redis.url, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 5) {
          logger.warn('Redis retry limit reached — operating without Redis');
          return null;
        }
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    client.on('connect', () => {
      isConnected = true;
      logger.info('Redis connected');
    });

    client.on('error', (err) => {
      if (isConnected) {
        logger.warn('Redis error — some features may be degraded:', err.message);
        isConnected = false;
      }
    });

    client.on('reconnecting', () => {
      logger.info('Redis reconnecting...');
    });

  } catch (err) {
    logger.warn('Redis unavailable — rate limiting and caching disabled');
    client = null;
  }

  return client;
};

const connectRedis = async () => {
  const c = getRedisClient();
  if (!c) return;
  try {
    await c.connect();
  } catch (err) {
    logger.warn('Redis connect failed:', err.message);
  }
};

const isRedisAvailable = () => isConnected;

const disconnectRedis = async () => {
  if (!client) return;
  const current = client;
  client = null;
  isConnected = false;
  if (current.status === 'ready') await current.quit();
  else current.disconnect();
};

module.exports = { getRedisClient, connectRedis, isRedisAvailable, disconnectRedis };
