'use strict';

const config = require('../config/env');
const logger = require('../utils/logger');

const sendSms = async ({ to, body }) => {
  if (config.notifications.smsProvider !== 'twilio') return false;

  const { accountSid, authToken, fromNumber } = config.notifications.twilio;
  if (!accountSid || !authToken || !fromNumber) {
    logger.warn('SMS is enabled with Twilio but its credentials are incomplete.');
    return false;
  }
  if (!to) return false;

  const normalizedTo = /^\+/.test(to) ? to : `+91${String(to).replace(/\D/g, '')}`;
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: normalizedTo, From: fromNumber, Body: body }),
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    logger.warn(`SMS provider rejected a notification (HTTP ${response.status}).`);
    return false;
  }
  return true;
};

module.exports = { sendSms };
