'use strict';

require('dotenv').config();

const mongoose = require('mongoose');
const User = require('../src/models/User');

const requireEnv = (key) => {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`Set ${key} in the current shell before running this command.`);
  return value;
};

const withRetryWritesDisabled = (uri) => {
  const [base, ...queryParts] = uri.split('?');
  const options = new URLSearchParams(queryParts.join('?'));
  options.set('retryWrites', 'false');
  return `${base}?${options.toString()}`;
};

const createAdmin = async () => {
  const mongoUri = requireEnv('MONGO_URI');
  const name = requireEnv('ADMIN_NAME');
  const email = requireEnv('ADMIN_EMAIL').toLowerCase();
  const phone = requireEnv('ADMIN_PHONE');
  const password = requireEnv('ADMIN_PASSWORD');

  if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters and include uppercase, lowercase, and a number.');
  }
  if (/(localhost|127\.0\.0\.1)/i.test(new URL(mongoUri.replace(/^mongodb\+srv:/, 'https:').replace(/^mongodb:/, 'https:')).hostname)) {
    throw new Error('MONGO_URI points to localhost; use the production database connection string.');
  }

  await mongoose.connect(withRetryWritesDisabled(mongoUri), { serverSelectionTimeoutMS: 15000 });
  const existing = await User.findOne({ $or: [{ email }, { phone }] }).select('_id email phone');
  if (existing) {
    throw new Error('An account already uses this email or phone. Choose a new admin identity; existing accounts are not modified.');
  }

  const admin = new User({ name, email, phone, passwordHash: password, role: 'ADMIN', isVerified: true, isActive: true });
  await admin.save();
  process.stdout.write(`Admin account created for ${admin.email}. Sign in through the published site.\n`);
};

createAdmin()
  .catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
