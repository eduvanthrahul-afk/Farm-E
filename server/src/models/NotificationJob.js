'use strict';

const mongoose = require('mongoose');

const notificationJobSchema = new mongoose.Schema({
  idempotencyKey: { type: String, unique: true, required: true },
  notification: { type: mongoose.Schema.Types.ObjectId, ref: 'Notification', default: null },
  type: { type: String, enum: ['FARMER_ORDER_SMS'], required: true },
  to: { type: String, required: true },
  body: { type: String, required: true },
  status: { type: String, enum: ['QUEUED', 'PROCESSING', 'RETRY', 'SENT', 'MOCKED', 'DEAD'], default: 'QUEUED' },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now },
  lockedUntil: { type: Date, default: null },
  lease: { type: String, default: null },
  lastError: { type: String, default: null },
}, { timestamps: true });

notificationJobSchema.index({ status: 1, nextAttemptAt: 1 });

module.exports = mongoose.model('NotificationJob', notificationJobSchema);
