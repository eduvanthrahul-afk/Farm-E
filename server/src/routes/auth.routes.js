'use strict';

const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const authController = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const { authLimiter } = require('../middleware/rateLimit.middleware');
const { ROLES } = require('../config/constants');

// POST /api/auth/register
router.post(
  '/register',
  authLimiter,
  [
    body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('phone')
      .matches(/^[6-9]\d{9}$/)
      .withMessage('Valid Indian mobile number required'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .custom((value) => typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= 72)
      .withMessage('Password must be no more than 72 bytes')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must contain uppercase, lowercase, and a number'),
    // Admin accounts are provisioned by an existing administrator only.
    body('role').isIn([ROLES.FARMER, ROLES.BUYER]).withMessage('Choose Farmer or Buyer to register'),
  ],
  validate,
  authController.register
);

// POST /api/auth/login
router.post(
  '/login',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  authController.login
);

// POST /api/auth/google — Google ID tokens are verified by the server.
router.post(
  '/google',
  authLimiter,
  [
    body('credential').isString().isLength({ min: 100, max: 5000 }).withMessage('Valid Google credential required'),
    body('role').optional({ values: 'falsy' }).isIn([ROLES.FARMER, ROLES.BUYER]).withMessage('Choose Farmer or Buyer'),
  ],
  validate,
  authController.googleLogin
);

// POST /api/auth/refresh-token
router.post(
  '/refresh-token',
  authLimiter,
  authController.refreshToken
);

// POST /api/auth/logout
router.post('/logout', protect, authController.logout);

// GET /api/auth/me
router.get('/me', protect, authController.getMe);

// PUT /api/auth/change-password
router.put(
  '/change-password',
  protect,
  [
    body('currentPassword').notEmpty().withMessage('Current password required'),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .custom((value) => typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= 72)
      .withMessage('Password must be no more than 72 bytes')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must contain uppercase, lowercase, and a number'),
  ],
  validate,
  authController.changePassword
);

module.exports = router;
