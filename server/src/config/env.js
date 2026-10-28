'use strict';

const crypto = require('crypto');
require('dotenv').config();

const developmentTraceSigningSecret = process.env.JWT_REFRESH_SECRET
  ? crypto.createHmac('sha256', process.env.JWT_REFRESH_SECRET).update('Farm-E QR authenticity signing key v1').digest()
  : undefined;

const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/farme';
const mongoUriParts = mongoUri.split('?');
const mongoUriOptions = new URLSearchParams(mongoUriParts.slice(1).join('?'));
mongoUriOptions.set('retryWrites', 'false');
const mongoUriWithRetryWritesDisabled = `${mongoUriParts[0]}?${mongoUriOptions.toString()}`;
const corsOriginSetting = process.env.CORS_ORIGIN || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173';
const r2AccountId = process.env.R2_ACCOUNT_ID || '';
const storageProvider = process.env.STORAGE_PROVIDER || 'local';

const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',

  mongo: {
    uri: mongoUriWithRetryWritesDisabled,
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  // Use a dedicated stable key in production. Development derives a separate key from the
  // refresh secret so local setups do not reuse one key for JWTs and batch signatures.
  traceSigningSecret: process.env.TRACE_SIGNING_SECRET || developmentTraceSigningSecret,

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
  },

  redis: {
    url: process.env.REDIS_URL || '',
  },

  geocoding: {
    userAgent: process.env.GEOCODING_USER_AGENT || 'Farm-E/1.0',
  },

  cors: {
    origins: corsOriginSetting
      .split(',').map((origin) => origin.trim()).filter(Boolean),
  },

  storage: {
    provider: storageProvider,
    isRemote: storageProvider === 'r2' || storageProvider === 'mongodb',
    uploadDir: process.env.UPLOAD_DIR || 'uploads',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 5 * 1024 * 1024,
    r2: {
      endpoint: process.env.R2_ENDPOINT || (r2AccountId ? `https://${r2AccountId}.r2.cloudflarestorage.com` : ''),
      bucket: process.env.R2_BUCKET || '',
      accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    },
  },

  payment: {
    provider: process.env.PAYMENT_PROVIDER || 'mock',
  },

  maps: {
    provider: process.env.MAPS_PROVIDER || 'mock',
    routingBaseUrl: process.env.ROUTING_BASE_URL || 'https://router.project-osrm.org',
  },

  notifications: {
    emailProvider: process.env.EMAIL_PROVIDER || 'mock',
    smsProvider: process.env.SMS_PROVIDER || 'mock',
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      fromNumber: process.env.TWILIO_FROM_NUMBER,
    },
  },

  log: {
    level: process.env.LOG_LEVEL || 'info',
  },
};

// Validate required secrets in production
if (config.nodeEnv === 'production') {
  const required = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'TRACE_SIGNING_SECRET', 'MONGO_URI'];
  required.forEach((key) => {
    if (!process.env[key]) {
      throw new Error(`Missing required env variable: ${key}`);
    }
  });
  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'TRACE_SIGNING_SECRET']) {
    if (Buffer.byteLength(process.env[key] || '', 'utf8') < 32) {
      throw new Error(`${key} must be at least 32 bytes in production`);
    }
  }
  if (process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET) {
    throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
  }
  if (process.env.TRACE_SIGNING_SECRET === process.env.JWT_ACCESS_SECRET ||
      process.env.TRACE_SIGNING_SECRET === process.env.JWT_REFRESH_SECRET) {
    throw new Error('TRACE_SIGNING_SECRET must be different from the JWT secrets');
  }
  if (!process.env.CORS_ORIGIN && !process.env.RENDER_EXTERNAL_URL) {
    throw new Error('Set CORS_ORIGIN to the production HTTPS origin of the app');
  }
  if (!config.cors.origins.length || config.cors.origins.includes('*')) {
    throw new Error('CORS_ORIGIN must contain explicit trusted origins; wildcard origins are not allowed');
  }
  for (const origin of config.cors.origins) {
    let parsed;
    try { parsed = new URL(origin); } catch { throw new Error(`Invalid CORS origin: ${origin}`); }
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.origin !== origin) {
      throw new Error(`CORS_ORIGIN entries must be plain http(s) origins without paths: ${origin}`);
    }
    if (parsed.protocol !== 'https:') throw new Error('Production CORS origins must use HTTPS');
  }
  if (process.env.MONGO_MEMORY === 'true') {
    throw new Error('MONGO_MEMORY cannot be enabled in production');
  }
  if (process.env.SEED_DEMO_DATA === 'true') {
    throw new Error('SEED_DEMO_DATA cannot be enabled in production');
  }
  if (!['r2', 'mongodb'].includes(config.storage.provider)) {
    throw new Error('Production requires durable file storage. Set STORAGE_PROVIDER=mongodb or STORAGE_PROVIDER=r2.');
  }
  if (config.storage.provider === 'r2') {
    for (const [key, value] of Object.entries({
      R2_ENDPOINT: config.storage.r2.endpoint,
      R2_BUCKET: config.storage.r2.bucket,
      R2_ACCESS_KEY_ID: config.storage.r2.accessKeyId,
      R2_SECRET_ACCESS_KEY: config.storage.r2.secretAccessKey,
    })) {
      if (!value) throw new Error(`Missing required environment variable for R2 object storage: ${key}`);
    }
    try {
      const endpoint = new URL(config.storage.r2.endpoint);
      if (endpoint.protocol !== 'https:') throw new Error('R2_ENDPOINT must use HTTPS');
    } catch (error) {
      throw new Error(`Invalid R2_ENDPOINT: ${error.message}`);
    }
  }
}

module.exports = config;
