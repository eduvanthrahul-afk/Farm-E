'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLES } = require('../config/constants');

const refreshTokenSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true },
  // Do not add a Mongo TTL index here: TTL indexes on array subdocuments can
  // delete the entire parent User document. Refresh JWT expiry is enforced by
  // verification and stale hashes are pruned during token rotation.
  createdAt: { type: Date, default: Date.now },
});

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },
    googleId: { type: String, unique: true, sparse: true, select: false },
    phone: {
      type: String,
      required: [function () { return !this.googleId; }, 'Phone is required for password-based accounts'],
      trim: true,
      match: [/^[6-9]\d{9}$/, 'Invalid Indian mobile number'],
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: Object.values(ROLES), required: true },
    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    avatar: { type: String, default: null },
    language: { type: String, default: 'en' },
    notificationPreferences: {
      inAppEnabled: { type: Boolean, default: true },
      smsOrderAlertsEnabled: { type: Boolean, default: false },
    },
    refreshTokens: [refreshTokenSchema],
    lastLogin: { type: Date, default: null },
    loginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.passwordHash;
        delete ret.googleId;
        delete ret.refreshTokens;
        delete ret.loginAttempts;
        delete ret.lockedUntil;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Indexes
userSchema.index({ phone: 1 });
userSchema.index({ role: 1, isActive: 1 });

// Hash password before save (Mongoose 8: async hooks do not receive next)
userSchema.pre('save', async function () {
  if (!this.isModified('passwordHash')) return;
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
});

// Compare password
userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.passwordHash);
};

// Reset login attempts on success
userSchema.methods.resetLoginAttempts = async function () {
  await this.constructor.updateOne(
    { _id: this._id },
    { $set: { loginAttempts: 0, lockedUntil: null, lastLogin: new Date() } }
  );
};

// Add refresh token (store hash, not raw) — max 5 for multi-device
userSchema.methods.addRefreshToken = async function (tokenHash) {
  const tokens = [...this.refreshTokens];
  if (tokens.length >= 5) tokens.shift();
  tokens.push({ tokenHash });
  await this.constructor.updateOne({ _id: this._id }, { $set: { refreshTokens: tokens } });
};

// Remove a specific refresh token
userSchema.methods.removeRefreshToken = async function (tokenHash) {
  await this.constructor.updateOne(
    { _id: this._id },
    { $pull: { refreshTokens: { tokenHash } } }
  );
};

// Remove all refresh tokens (logout all devices)
userSchema.methods.clearRefreshTokens = async function () {
  await this.constructor.updateOne({ _id: this._id }, { $set: { refreshTokens: [] } });
};

module.exports = mongoose.model('User', userSchema);
