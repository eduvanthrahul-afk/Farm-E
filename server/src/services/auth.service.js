'use strict';

const crypto = require('crypto');
const User = require('../models/User');
const { generateTokenPair, verifyRefreshToken } = require('../utils/generateToken');
const { AUDIT_ACTIONS, ROLES } = require('../config/constants');
const audit = require('./audit.service');
const config = require('../config/env');
const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client();

/**
 * Hash a refresh token for DB storage
 */
const hashToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

/**
 * Register a new user
 */
const register = async ({ name, email, phone, password, role }, req) => {
  if (![ROLES.FARMER, ROLES.BUYER].includes(role)) {
    const err = new Error('Choose Farmer or Buyer to register');
    err.statusCode = 400;
    throw err;
  }
  const existing = await User.findOne({ email });
  if (existing) {
    const err = new Error('Email already registered');
    err.statusCode = 409;
    throw err;
  }

  const user = new User({ name, email, phone, passwordHash: password, role });
  await user.save();

  const tokens = generateTokenPair(user);
  await user.addRefreshToken(hashToken(tokens.refreshToken));

  await audit.log({
    actor: user._id,
    actorRole: user.role,
    action: AUDIT_ACTIONS.USER_REGISTERED,
    resource: { model: 'User', id: user._id },
    req,
  });

  return { user: user.toJSON(), ...tokens };
};

/**
 * Login
 */
const login = async ({ email, password }, req) => {
  const normalizedEmail = String(email || '').toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');

  if (!user) {
    const err = new Error('Invalid email or password');
    err.statusCode = 401;
    throw err;
  }
  if (!user.isActive) {
    const err = new Error('Account is deactivated');
    err.statusCode = 401;
    throw err;
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    const err = new Error('Invalid email or password');
    err.statusCode = 401;
    throw err;
  }

  await user.resetLoginAttempts();

  const tokens = generateTokenPair(user);
  await user.addRefreshToken(hashToken(tokens.refreshToken));

  await audit.log({
    actor: user._id,
    actorRole: user.role,
    action: AUDIT_ACTIONS.USER_LOGIN,
    resource: { model: 'User', id: user._id },
    req,
  });

  const safeUser = await User.findById(user._id);
  return { user: safeUser.toJSON(), ...tokens };
};

/** Verify Google's ID token on the server before creating or linking an account. */
const googleLogin = async ({ credential, role }, req) => {
  if (!config.google.clientId) {
    const err = new Error('Google sign-in is not configured yet. Add GOOGLE_CLIENT_ID to the server environment.');
    err.statusCode = 503;
    throw err;
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: config.google.clientId });
    payload = ticket.getPayload();
  } catch {
    const err = new Error('Google sign-in could not be verified. Please try again.');
    err.statusCode = 401;
    throw err;
  }

  const googleId = payload?.sub;
  const email = String(payload?.email || '').trim().toLowerCase();
  if (!googleId || !email || payload?.email_verified !== true) {
    const err = new Error('Use a Google account with a verified email address.');
    err.statusCode = 401;
    throw err;
  }

  let user = await User.findOne({ googleId }).select('+googleId');
  let isNewAccount = false;
  let linkExistingAccount = false;
  if (!user) {
    user = await User.findOne({ email }).select('+googleId');
    if (user?.googleId && user.googleId !== googleId) {
      const err = new Error('This email is already connected to another Google account. Sign in with your existing method.');
      err.statusCode = 409;
      throw err;
    }
    if (!user) {
      if (![ROLES.FARMER, ROLES.BUYER].includes(role)) {
        const err = new Error('This Google account is not registered in Farm-E yet. Create an account first to choose Farmer or Buyer.');
        err.statusCode = 404;
        throw err;
      }
      const name = String(payload.name || email.split('@')[0]).trim().slice(0, 100);
      user = new User({
        name: name.length >= 2 ? name : 'Farm-E User',
        email,
        role,
        googleId,
        isVerified: true,
        avatar: payload.picture || null,
        // Keep the required password field unusable for password sign-in.
        passwordHash: crypto.randomBytes(32).toString('hex'),
      });
      try {
        await user.save();
        isNewAccount = true;
      } catch (error) {
        if (error.code !== 11000) throw error;
        // Two sign-in requests can race to create the same account.
        const concurrentUser = await User.findOne({ $or: [{ googleId }, { email }] }).select('+googleId');
        if (!concurrentUser || concurrentUser.googleId !== googleId) {
          const conflict = new Error('This email is already connected to another account. Sign in with your existing method.');
          conflict.statusCode = 409;
          throw conflict;
        }
        user = concurrentUser;
      }
    } else {
      linkExistingAccount = true;
    }
  }

  if (role && role !== user.role) {
    const err = new Error(`This Google account already uses the ${user.role.toLowerCase()} account type. A Google email can have only one Farm-E role.`);
    err.statusCode = 409;
    throw err;
  }

  if (linkExistingAccount) {
    user.googleId = googleId;
    user.isVerified = true;
    if (!user.avatar && payload.picture) user.avatar = payload.picture;
    await user.save();
  }

  if (!user.isActive) {
    const err = new Error('Account is deactivated');
    err.statusCode = 401;
    throw err;
  }
  await user.resetLoginAttempts();
  const tokens = generateTokenPair(user);
  await user.addRefreshToken(hashToken(tokens.refreshToken));
  await audit.log({
    actor: user._id,
    actorRole: user.role,
    action: isNewAccount ? AUDIT_ACTIONS.USER_REGISTERED : AUDIT_ACTIONS.USER_LOGIN,
    resource: { model: 'User', id: user._id },
    req,
  });

  const safeUser = await User.findById(user._id);
  return { user: safeUser.toJSON(), ...tokens };
};

/**
 * Refresh tokens
 */
const refresh = async (refreshToken) => {
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    const err = new Error('Invalid or expired refresh token');
    err.statusCode = 401;
    throw err;
  }

  const user = await User.findById(decoded.sub).select('+refreshTokens');
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 401;
    throw err;
  }
  if (!user.isActive) {
    const err = new Error('Account is unavailable');
    err.statusCode = 401;
    throw err;
  }

  const tokenHash = hashToken(refreshToken);
  const stored = user.refreshTokens.find((t) => t.tokenHash === tokenHash);

  if (!stored) {
    // Token reuse detected — clear all tokens (security measure)
    await user.clearRefreshTokens();
    const err = new Error('Refresh token reuse detected — please login again');
    err.statusCode = 401;
    throw err;
  }

  // Rotate: remove old, issue new pair
  await user.removeRefreshToken(tokenHash);
  const tokens = generateTokenPair(user);
  await user.addRefreshToken(hashToken(tokens.refreshToken));

  return tokens;
};

/**
 * Logout — invalidate refresh token
 */
const logout = async (userId, refreshToken) => {
  const user = await User.findById(userId).select('+refreshTokens');
  if (!user) return;

  if (refreshToken) {
    await user.removeRefreshToken(hashToken(refreshToken));
  } else {
    await user.clearRefreshTokens();
  }
};

/**
 * Change password
 */
const changePassword = async (userId, currentPassword, newPassword) => {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    const err = new Error('Current password is incorrect');
    err.statusCode = 400;
    throw err;
  }

  user.passwordHash = newPassword; // will be hashed by pre-save hook
  await user.clearRefreshTokens(); // force re-login on all devices
  await user.save();
};

module.exports = { register, login, googleLogin, refresh, logout, changePassword };
