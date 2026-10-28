'use strict';

const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/env');

/**
 * Generate a short-lived access token
 */
const generateAccessToken = (payload) => {
  return jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpiresIn,
    issuer: 'farme-api',
  });
};

/**
 * Generate a long-lived refresh token
 */
const generateRefreshToken = (payload) => {
  return jwt.sign({ ...payload, jti: uuidv4() }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn,
    issuer: 'farme-api',
  });
};

/**
 * Verify access token — throws on invalid/expired
 */
const verifyAccessToken = (token) => {
  return jwt.verify(token, config.jwt.accessSecret, { issuer: 'farme-api' });
};

/**
 * Verify refresh token — throws on invalid/expired
 */
const verifyRefreshToken = (token) => {
  return jwt.verify(token, config.jwt.refreshSecret, { issuer: 'farme-api' });
};

/**
 * Decode without verifying (for reading expired tokens safely)
 */
const decodeToken = (token) => jwt.decode(token);

/**
 * Generate an access + refresh token pair for a user
 */
const generateTokenPair = (user) => {
  const payload = {
    sub: user._id.toString(),
    role: user.role,
    email: user.email,
  };
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken,
  generateTokenPair,
};
