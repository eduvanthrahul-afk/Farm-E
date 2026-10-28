'use strict';

const mongoose = require('mongoose');
const logger = require('../utils/logger');
const config = require('./env');
const fs = require('fs');
const path = require('path');

let isConnected = false;
let memServer = null;

const safeErrorDetails = (error) => {
  const message = String(error?.message || error || 'Unknown MongoDB error');
  return message.replace(/mongodb(?:\+srv)?:\/\/[^\s'\"]+/gi, '[MongoDB connection string redacted]');
};

/**
 * In development with no MONGO_URI, spin up mongodb-memory-server automatically.
 * In production, always use MONGO_URI (exit on failure).
 */
const connectDB = async () => {
  if (isConnected) return;

  let uri = config.mongo.uri;
  const wantMemory = process.env.MONGO_MEMORY === 'true' || !uri;

  const startMemoryServer = async () => {
    const { MongoMemoryReplSet } = require('mongodb-memory-server');
    const dbPath = process.env.MONGO_MEMORY_DB_PATH
      ? path.resolve(process.env.MONGO_MEMORY_DB_PATH)
      : path.resolve(__dirname, '../../.local-mongo');
    fs.mkdirSync(dbPath, { recursive: true });
    memServer = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
      instanceOpts: [{ dbPath, storageEngine: 'wiredTiger' }],
    });
    uri = memServer.getUri();
    logger.info(`Using persistent local development MongoDB at ${dbPath}; transactions are enabled.`);
  };

  if (config.nodeEnv !== 'production' && wantMemory) {
    try {
      await startMemoryServer();
    } catch (memErr) {
      logger.warn(`mongodb-memory-server unavailable: ${safeErrorDetails(memErr)}`);
    }
  }

  try {
    const conn = await mongoose.connect(uri, {
      retryWrites: false,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });

    isConnected = true;
    logger.info(`MongoDB connected: ${conn.connection.host}`);

    mongoose.connection.on('disconnected', () => {
      isConnected = false;
      logger.warn('MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      isConnected = true;
      logger.info('MongoDB reconnected');
    });

    mongoose.connection.on('error', (err) => {
      logger.error(`MongoDB error: ${safeErrorDetails(err)}`);
    });

  } catch (err) {
    logger.error(`MongoDB connection failed: ${safeErrorDetails(err)}`);
    if (config.nodeEnv === 'production') process.exit(1);

    if (!memServer) {
      try {
        await startMemoryServer();
        const conn = await mongoose.connect(uri, {
          retryWrites: false,
          serverSelectionTimeoutMS: 10000,
          socketTimeoutMS: 45000,
        });
        isConnected = true;
        logger.info(`MongoDB connected (memory fallback): ${conn.connection.host}`);
        return;
      } catch (memErr) {
        logger.warn(`Memory MongoDB fallback failed: ${safeErrorDetails(memErr)}`);
      }
    }

    logger.warn('Continuing without MongoDB. Auth and other DB operations will fail until MongoDB is available.');
  }
};

const disconnectDB = async () => {
  if (!isConnected) return;
  await mongoose.disconnect();
  if (memServer) await memServer.stop({ doCleanup: false });
  isConnected = false;
  logger.info('MongoDB disconnected cleanly');
};

module.exports = { connectDB, disconnectDB };
