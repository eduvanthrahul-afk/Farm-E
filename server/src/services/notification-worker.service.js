'use strict';

const crypto = require('crypto');
const Notification = require('../models/Notification');
const NotificationJob = require('../models/NotificationJob');
const config = require('../config/env');
const logger = require('../utils/logger');
const { sendSms } = require('./sms.service');

const MAX_ATTEMPTS = 8;
let timer = null;
let running = false;

const processOne = async () => {
  const now = new Date();
  const lease = crypto.randomUUID();
  const job = await NotificationJob.findOneAndUpdate({
    status: { $in: ['QUEUED', 'RETRY', 'PROCESSING'] },
    nextAttemptAt: { $lte: now },
    $or: [{ status: { $ne: 'PROCESSING' } }, { lockedUntil: { $lt: now } }],
  }, {
    $set: { status: 'PROCESSING', lockedUntil: new Date(now.getTime() + 30000), lease },
    $inc: { attempts: 1 },
  }, { returnDocument: 'after', sort: { createdAt: 1 } });
  if (!job) return false;

  if (config.notifications.smsProvider !== 'twilio') {
    await NotificationJob.updateOne({ _id: job._id, lease }, { $set: { status: 'MOCKED', lockedUntil: null, lastError: null } });
    if (job.notification) await Notification.updateOne({ _id: job.notification }, { $set: { 'channels.sms.status': 'MOCKED' } });
    return true;
  }

  try {
    const sent = await sendSms({ to: job.to, body: job.body });
    if (!sent) throw new Error('SMS provider did not accept the message');
    await NotificationJob.updateOne({ _id: job._id, lease }, { $set: { status: 'SENT', lockedUntil: null, lastError: null } });
    if (job.notification) await Notification.updateOne({ _id: job.notification }, { $set: { 'channels.sms.sent': true, 'channels.sms.status': 'SENT' } });
  } catch (error) {
    const terminal = job.attempts >= MAX_ATTEMPTS;
    const delay = Math.min(60 * 60 * 1000, 5000 * (2 ** Math.min(job.attempts - 1, 9)));
    await NotificationJob.updateOne({ _id: job._id, lease }, { $set: {
      status: terminal ? 'DEAD' : 'RETRY',
      lockedUntil: null,
      nextAttemptAt: new Date(Date.now() + delay),
      lastError: String(error.message || 'SMS delivery failed').slice(0, 500),
    } });
    if (job.notification) await Notification.updateOne({ _id: job.notification }, { $set: { 'channels.sms.status': terminal ? 'FAILED' : 'RETRY' } });
    logger.warn(`Farmer order SMS ${terminal ? 'gave up after retries' : 'failed and was queued for retry'} (${job._id}).`);
  }
  return true;
};

const tick = async () => {
  if (running) return;
  running = true;
  try {
    for (let i = 0; i < 10 && await processOne(); i += 1) { /* drain a small batch */ }
  } catch (error) {
    logger.error('Notification worker tick failed:', error.message);
  } finally {
    running = false;
  }
};

const startNotificationWorker = () => {
  if (timer) return;
  timer = setInterval(tick, 2000);
  timer.unref?.();
  tick();
};

const stopNotificationWorker = async () => {
  if (timer) clearInterval(timer);
  timer = null;
  while (running) await new Promise((resolve) => setTimeout(resolve, 25));
};

module.exports = { startNotificationWorker, stopNotificationWorker };
