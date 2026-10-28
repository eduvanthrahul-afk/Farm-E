'use strict';

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const config = require('./config/env');
const logger = require('./utils/logger');
const { errorHandler, notFoundHandler } = require('./middleware/error.middleware');
const asyncHandler = require('./utils/asyncHandler');
const { apiLimiter } = require('./middleware/rateLimit.middleware');
const objectStorage = require('./services/objectStorage.service');

// Routes
const authRoutes = require('./routes/auth.routes');
const farmRoutes = require('./routes/farm.routes');
const listingRoutes = require('./routes/listing.routes');
const requirementRoutes = require('./routes/requirement.routes');
const bidRoutes = require('./routes/bid.routes');
const orderRoutes = require('./routes/order.routes');
const notificationRoutes = require('./routes/notification.routes');
const conversationRoutes = require('./routes/conversation.routes');
const reviewRoutes = require('./routes/review.routes');
const disputeRoutes = require('./routes/dispute.routes');
const adminRoutes = require('./routes/admin.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const locationRoutes = require('./routes/location.routes');

const app = express();
const clientBuildDirectory = path.resolve(__dirname, '../../client/dist');
const clientIndexFile = path.join(clientBuildDirectory, 'index.html');

if (config.nodeEnv === 'production' && !fs.existsSync(clientIndexFile)) {
  throw new Error('Production client build is missing. Build client/ before starting the server.');
}
if (config.nodeEnv === 'production') app.set('trust proxy', 1);

// ─── SECURITY ────────────────────────────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://accounts.google.com/gsi/client'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://tile.openstreetmap.org', 'https://basemaps.cartocdn.com', 'https://*.googleusercontent.com'],
        connectSrc: ["'self'", 'ws:', 'wss:', 'https://accounts.google.com/gsi/'],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
        frameSrc: ["'self'", 'https://accounts.google.com/gsi/'],
        workerSrc: ["'self'", 'blob:'],
        manifestSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: config.isDev ? null : [],
      },
    },
  })
);

app.use(
  cors({
    origin(origin, callback) {
      // Requests without Origin are non-browser clients; browser origins must
      // match the explicit deployment allowlist.
      if (!origin || config.cors.origins.includes(origin)) return callback(null, true);
      // A false CORS decision omits allow headers; the browser blocks access
      // without turning a policy rejection into an application 500.
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Apply a shared API budget before parsing request bodies. Authentication and
// upload routes add narrower limits of their own.
app.use('/api', apiLimiter);

// ─── BODY PARSING ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb', parameterLimit: 100 }));
app.use(cookieParser());
app.use(compression());

// ─── LOGGING ─────────────────────────────────────────────────────────────────
if (config.isDev) {
  app.use(morgan('dev'));
} else {
  app.use(
    morgan('combined', {
      stream: { write: (msg) => logger.info(msg.trim()) },
    })
  );
}

// ─── STATIC FILES ────────────────────────────────────────────────────────────
if (config.storage.isRemote) {
  app.get('/uploads/listings/:fileName', asyncHandler(async (req, res, next) => {
    const { fileName } = req.params;
    if (!/^[a-f\d-]{36}\.(?:jpg|png|webp)$/i.test(fileName)) return res.sendStatus(404);
    let object;
    try {
      object = await objectStorage.getObject(`listings/${fileName}`);
    } catch (storageError) {
      if (storageError.name === 'NoSuchKey' || storageError.$metadata?.httpStatusCode === 404) return res.sendStatus(404);
      throw storageError;
    }
    if (!object.Body) return res.sendStatus(404);
    res.set({
      'Content-Type': object.ContentType || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    object.Body.on('error', (streamError) => {
      if (!res.headersSent) return next(streamError);
      res.destroy(streamError);
    });
    object.Body.pipe(res);
  }));
  app.use('/uploads', (_req, res) => res.sendStatus(404));
} else {
  app.use('/uploads', express.static(path.join(__dirname, '..', config.storage.uploadDir)));
}

// ─── RATE LIMITING ───────────────────────────────────────────────────────────

// ─── HEALTH CHECK ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  const databaseReady = mongoose.connection.readyState === 1;
  res.status(databaseReady ? 200 : 503).json({
    status: databaseReady ? 'ok' : 'not_ready',
    service: 'farme-api',
    dependencies: { database: databaseReady ? 'connected' : 'disconnected' },
    timestamp: new Date().toISOString(),
  });
});

// ─── API ROUTES ──────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/farms', farmRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/requirements', requirementRoutes);
app.use('/api/bids', bidRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/location', locationRoutes);

// Serve the Vite build from the API origin in production. This keeps refresh
// cookies and Socket.IO same-origin and supports direct links to SPA routes.
if (config.nodeEnv === 'production') {
  app.use(express.static(clientBuildDirectory, {
    index: false,
    setHeaders(res, filePath) {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/') || req.path === '/api' ||
        req.path.startsWith('/uploads') || req.path.startsWith('/socket.io') ||
        req.path === '/health' || path.extname(req.path)) return next();
    res.sendFile(clientIndexFile, (sendError) => sendError && next(sendError));
  });
}

// ─── ERROR HANDLING ──────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
