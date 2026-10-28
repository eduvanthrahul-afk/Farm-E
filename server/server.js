'use strict';

const http = require('http');
const { Server } = require('socket.io');

const app = require('./src/app');
const config = require('./src/config/env');
const { connectDB, disconnectDB } = require('./src/config/database');
const { connectRedis, disconnectRedis } = require('./src/config/redis');
const { setupSocket } = require('./src/sockets/socket.server');
const { checkObjectStorage } = require('./src/services/objectStorage.service');
const { startNotificationWorker, stopNotificationWorker } = require('./src/services/notification-worker.service');
const logger = require('./src/utils/logger');
const { seedDemoData } = require('./scripts/seedDemoData');

const server = http.createServer(app);

// Socket.IO
const io = new Server(server, {
  cors: {
    origin: config.cors.origins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

const { connectedUsers } = setupSocket(io);

// Make io accessible to routes via app
app.set('io', io);
app.set('connectedUsers', connectedUsers);

const start = async () => {
  try {
    await connectDB();
    await checkObjectStorage();
    if (process.env.SEED_DEMO_DATA === 'true') {
      const accounts = await seedDemoData();
      logger.info(`Demo dataset ready for ${accounts.map(({ email }) => email).join(', ')}`);
    }
    await connectRedis();
    startNotificationWorker();

    server.listen(config.port, '0.0.0.0', () => {
      logger.info(`
╔═══════════════════════════════════════╗
║          Farm-E API Server            ║
╠═══════════════════════════════════════╣
║  Port   : ${String(config.port).padEnd(28)}║
║  Env    : ${config.nodeEnv.padEnd(28)}║
║  MongoDB: Connected                   ║
║  Socket : Enabled                     ║
╚═══════════════════════════════════════╝
      `);
    });

    // Graceful shutdown
    let shuttingDown = false;
    const shutdown = async (signal) => {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.info(`${signal} received — shutting down gracefully`);
      await stopNotificationWorker();
      try {
        await new Promise((resolve) => io.close(resolve));
        await disconnectDB();
        await disconnectRedis();
        logger.info('HTTP, Socket.IO, MongoDB, and Redis closed cleanly');
        process.exit(0);
      } catch (shutdownError) {
        logger.error('Error during graceful shutdown:', shutdownError);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (err) {
    logger.error('Server failed to start:', err);
    process.exit(1);
  }
};

start();
