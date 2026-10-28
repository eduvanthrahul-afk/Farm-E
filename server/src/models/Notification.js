'use strict';

const mongoose = require('mongoose');
const { NOTIFICATION_TYPES } = require('../config/constants');

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: Object.values(NOTIFICATION_TYPES), required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    data: {
      relatedId: { type: mongoose.Schema.Types.ObjectId },
      relatedModel: { type: String },
      actionUrl: { type: String },
    },
    channels: {
      inApp: {
        enabled: { type: Boolean, default: true },
        read: { type: Boolean, default: false },
        readAt: { type: Date, default: null },
      },
      email: { sent: { type: Boolean, default: false } },
      sms: {
        sent: { type: Boolean, default: false },
        status: { type: String, enum: ['NOT_QUEUED', 'QUEUED', 'SENT', 'MOCKED', 'RETRY', 'FAILED'], default: 'NOT_QUEUED' },
      },
      push: { sent: { type: Boolean, default: false } },
    },
    priority: { type: String, enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'], default: 'NORMAL' },
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, 'channels.inApp.read': 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
