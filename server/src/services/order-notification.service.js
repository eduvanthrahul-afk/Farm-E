'use strict';

const Notification = require('../models/Notification');
const NotificationJob = require('../models/NotificationJob');
const { NOTIFICATION_TYPES } = require('../config/constants');

const notifyFarmerOfOrder = async ({ farmer, order, cropName, bidAccepted = false, session }) => {
  const smsEnabled = farmer.notificationPreferences?.smsOrderAlertsEnabled === true && Boolean(farmer.phone);
  const inAppEnabled = farmer.notificationPreferences?.inAppEnabled !== false;
  const title = bidAccepted ? 'Your bid was accepted — new order' : 'New order received';
  const body = `${bidAccepted ? 'Your bid was accepted. ' : ''}Order #${order.orderNumber}: ${order.quantity.expected} ${order.quantity.unit} of ${cropName}. Review and confirm it in Farm-E.`;
  const notificationPayload = {
    recipient: farmer._id || farmer,
    type: NOTIFICATION_TYPES.NEW_ORDER,
    title,
    body,
    data: { relatedId: order._id, relatedModel: 'Order', actionUrl: `/orders/${order._id}` },
    priority: 'HIGH',
    channels: {
      inApp: { enabled: inAppEnabled },
      sms: { status: smsEnabled ? 'QUEUED' : 'NOT_QUEUED' },
    },
  };
  const [notification] = await Notification.create([notificationPayload], session ? { session } : {});

  if (smsEnabled) {
    await NotificationJob.create([{
      idempotencyKey: `farmer-order-sms:${order._id}`,
      notification: notification._id,
      type: 'FARMER_ORDER_SMS',
      to: farmer.phone,
      body: `Farm-E: New order #${order.orderNumber}. ${order.quantity.expected} ${order.quantity.unit} ${cropName}. Sign in to review and confirm.`,
    }], session ? { session } : {});
  }
  return notification;
};

module.exports = { notifyFarmerOfOrder };
