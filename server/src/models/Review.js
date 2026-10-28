'use strict';

const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reviewee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: {
      type: String,
      enum: ['BUYER_REVIEWING_FARMER', 'FARMER_REVIEWING_BUYER'],
      required: true,
    },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 2000 },
    tags: [{ type: String }],
    isVerified: { type: Boolean, default: true },
  },
  { timestamps: true }
);

reviewSchema.index({ reviewee: 1 });
reviewSchema.index({ order: 1 });
reviewSchema.index({ reviewer: 1 });
// Prevent duplicate reviews for the same order+role
reviewSchema.index({ order: 1, reviewer: 1 }, { unique: true });

module.exports = mongoose.model('Review', reviewSchema);
