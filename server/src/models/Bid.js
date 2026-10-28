'use strict';

const mongoose = require('mongoose');
const { BID_STATUS, QUALITY_GRADES, UNITS } = require('../config/constants');

const counterOfferSchema = new mongoose.Schema(
  {
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    pricePerUnit: { type: Number, required: true, min: 0 },
    quantity: { type: Number, min: 0 },
    notes: { type: String, trim: true },
    status: {
      type: String,
      enum: ['PENDING', 'ACCEPTED', 'REJECTED', 'SUPERSEDED'],
      default: 'PENDING',
    },
  },
  { timestamps: true }
);

const bidHistorySchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    note: { type: String },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const bidSchema = new mongoose.Schema(
  {
    requirement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BuyerRequirement',
      required: true,
    },
    farmer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    farm: { type: mongoose.Schema.Types.ObjectId, ref: 'Farm', required: true },
    listing: { type: mongoose.Schema.Types.ObjectId, ref: 'CropListing', default: null },

    price: {
      perUnit: { type: Number, required: true, min: 0 },
      total: { type: Number, min: 0 }, // computed: perUnit × quantity
    },

    quantity: {
      offered: { type: Number, required: true, min: 0.1 },
      unit: { type: String, enum: UNITS, required: true },
    },

    harvestDate: { type: Date, required: true },

    deliveryInfo: {
      canDeliver: { type: Boolean, default: false },
      estimatedDate: { type: Date },
      deliveryCost: { type: Number, default: 0 },
      notes: { type: String, trim: true },
    },

    quality: {
      grade: { type: String, enum: QUALITY_GRADES },
      description: { type: String, trim: true },
    },

    status: {
      type: String,
      enum: Object.values(BID_STATUS),
      default: BID_STATUS.PENDING,
    },

    message: { type: String, trim: true, maxlength: 1000 },
    attachments: [{ type: String }],

    counterOffers: [counterOfferSchema],
    history: [bidHistorySchema],

    expiresAt: { type: Date, required: true },
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', default: null },
  },
  { timestamps: true }
);

// Compute total before saving
bidSchema.pre('save', function () {
  if (this.price && this.quantity) {
    this.price.total = this.price.perUnit * this.quantity.offered;
  }
});

// Indexes
bidSchema.index({ requirement: 1, status: 1 });
bidSchema.index({ farmer: 1, status: 1 });
bidSchema.index({ status: 1, expiresAt: 1 });
bidSchema.index({ expiresAt: 1 });

module.exports = mongoose.model('Bid', bidSchema);
