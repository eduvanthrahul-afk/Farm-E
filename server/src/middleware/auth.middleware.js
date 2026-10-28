'use strict';

const { verifyAccessToken } = require('../utils/generateToken');
const { unauthorized } = require('../utils/apiResponse');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Protect routes — verify Bearer JWT
 */
const protect = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return unauthorized(res, 'No token provided');
  }

  const token = authHeader.split(' ')[1];

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (err) {
    if (err.name === 'TokenExpiredError') return unauthorized(res, 'Token expired');
    return unauthorized(res, 'Invalid token');
  }

  const user = await User.findById(decoded.sub).select('-passwordHash -refreshTokens');

  if (!user) return unauthorized(res, 'User no longer exists');
  if (!user.isActive) return unauthorized(res, 'Account is deactivated');
  req.user = user;
  next();
});

/**
 * Optionally attach user if token present — don't fail if missing
 */
const optionalAuth = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return next();

  try {
    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.sub).select('-passwordHash -refreshTokens');
    if (user && user.isActive) req.user = user;
  } catch {
    // Silently ignore — optional
  }

  next();
});

module.exports = { protect, optionalAuth };
