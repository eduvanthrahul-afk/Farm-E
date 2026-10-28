'use strict';

const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const { protect } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const { success, created, notFound, paginated } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const Notification = require('../models/Notification');
const { parsePagination, paginationMeta } = require('../utils/pagination');
const config = require('../config/env');

const notificationSettingsResponse = (user) => ({
  preferences: {
    inAppEnabled: user.notificationPreferences?.inAppEnabled !== false,
    smsOrderAlertsEnabled: user.notificationPreferences?.smsOrderAlertsEnabled === true,
  },
  delivery: {
    smsMode: config.notifications.smsProvider === 'twilio' ? 'provider' : 'simulated',
    smsConfigured: config.notifications.smsProvider === 'twilio' && Boolean(
      config.notifications.twilio.accountSid && config.notifications.twilio.authToken && config.notifications.twilio.fromNumber
    ),
    smsAvailableForRole: user.role === 'FARMER',
  },
});

router.get('/preferences', protect, asyncHandler(async (req, res) => {
  success(res, notificationSettingsResponse(req.user));
}));

router.patch('/preferences', protect, [
  body('inAppEnabled').optional().isBoolean(),
  body('smsOrderAlertsEnabled').optional().isBoolean(),
], validate, asyncHandler(async (req, res) => {
  const preferences = {};
  if (req.body.inAppEnabled !== undefined) preferences.inAppEnabled = req.body.inAppEnabled;
  if (req.body.smsOrderAlertsEnabled !== undefined) {
    if (req.user.role !== 'FARMER' && req.body.smsOrderAlertsEnabled === true) {
      return res.status(400).json({ success: false, message: 'Order SMS alerts are currently available to farmer accounts only' });
    }
    preferences.smsOrderAlertsEnabled = req.body.smsOrderAlertsEnabled;
  }
  req.user.notificationPreferences = {
    inAppEnabled: req.user.notificationPreferences?.inAppEnabled !== false,
    smsOrderAlertsEnabled: req.user.notificationPreferences?.smsOrderAlertsEnabled === true,
    ...preferences,
  };
  await req.user.save();
  success(res, notificationSettingsResponse(req.user), 'Notification preferences saved');
}));

// GET /api/notifications
router.get(
  '/',
  protect,
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req.query, { limit: 20 });
    const inAppEnabled = req.user.notificationPreferences?.inAppEnabled !== false;
    if (!inAppEnabled) {
      return paginated(res, { notifications: [], unreadCount: 0 }, paginationMeta(page, limit, 0));
    }
    const filter = { recipient: req.user._id };
    filter['channels.inApp.enabled'] = { $ne: false };
    if (req.query.unread === 'true') filter['channels.inApp.read'] = false;

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Notification.countDocuments(filter),
      Notification.countDocuments({ recipient: req.user._id, 'channels.inApp.enabled': { $ne: false }, 'channels.inApp.read': false }),
    ]);

    paginated(res, { notifications, unreadCount }, paginationMeta(page, limit, total));
  })
);

// PATCH /api/notifications/:id/read
router.patch(
  '/:id/read',
  protect,
  asyncHandler(async (req, res) => {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { 'channels.inApp.read': true, 'channels.inApp.readAt': new Date() },
      { returnDocument: 'after' }
    );
    if (!notification) return notFound(res, 'Notification not found');
    success(res, { notification });
  })
);

// PATCH /api/notifications/read-all
router.patch(
  '/read-all',
  protect,
  asyncHandler(async (req, res) => {
    await Notification.updateMany(
      { recipient: req.user._id, 'channels.inApp.read': false },
      { 'channels.inApp.read': true, 'channels.inApp.readAt': new Date() }
    );
    success(res, {}, 'All notifications marked as read');
  })
);

module.exports = router;
