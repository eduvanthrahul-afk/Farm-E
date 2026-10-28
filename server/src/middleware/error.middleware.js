'use strict';

const logger = require('../utils/logger');
const { error } = require('../utils/apiResponse');
const config = require('../config/env');

/**
 * Global error handler — must be last middleware registered
 */
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    statusCode = 422;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join(', ');
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0];
    message = `${field ? `'${field}'` : 'A value'} already exists`;
  }

  if (err.name === 'MulterError') {
    statusCode = 400;
    message = err.code === 'LIMIT_FILE_SIZE'
      ? 'Each evidence file must be 5 MB or smaller'
      : err.code === 'LIMIT_FILE_COUNT'
      ? 'Upload no more than 5 evidence files at once'
      : 'Evidence upload is invalid';
  }

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }

  // Do not expose database, filesystem, provider, or implementation details
  // from unexpected errors in production.
  if (statusCode >= 500 && !config.isDev) message = 'Internal server error';

  // Log server errors
  if (statusCode >= 500) {
    logger.error('Unhandled error:', {
      message: err.message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      user: req.user?._id,
    });
  }

  const body = {
    success: false,
    message,
  };

  if (config.isDev && statusCode >= 500) {
    body.stack = err.stack;
  }

  return res.status(statusCode).json(body);
};

/**
 * 404 handler — must be registered after all routes
 */
const notFoundHandler = (req, res) => {
  error(res, `Route not found: ${req.method} ${req.originalUrl}`, 404);
};

module.exports = { errorHandler, notFoundHandler };
