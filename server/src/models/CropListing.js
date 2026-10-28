'use strict';

const mongoose = require('mongoose');
const { LISTING_STATUS, QUALITY_GRADES, UNITS, CROP_CATEGORIES } = require('../config/constants');

const cropListingSchema = new mongoose.Schema(
  {
    farmer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    farm: { type: mongoose.Schema.Types.ObjectId, ref: 'Farm', required: true },

    crop: {
      name: { type: String, required: true, trim: true },
      variety: { type: String, trim: true },
      category: { type: String, enum: CROP_CATEGORIES, required: true },
    },

    description: { type: String, trim: true, maxlength: 3000 },
    images: [{ type: String }],

    quantity: {
      expected: { type: Number, required: true, min: 0.1 },
      available: { type: Number, min: 0 }, // remaining after orders
      unit: { type: String, enum: UNITS, required: true },
    },

    pricePerUnit: {
      expected: { type: Number, required: true, min: 0.01 },
      minimum: { type: Number, min: 0 }, // minimum acceptable
    },

    quality: {
      grade: { type: String, enum: QUALITY_GRADES, required: true },
      description: { type: String, trim: true },
      certifications: [{ type: String, trim: true }],
    },

    harvestDate: {
      expected: { type: Date, required: true },
      earliest: { type: Date },
      latest: { type: Date },
    },

    location: {
      address: { type: String, trim: true },
      village: { type: String, trim: true },
      district: { type: String, trim: true },
      state: { type: String, trim: true },
      pincode: { type: String, trim: true },
      coordinates: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], default: [0, 0] },
      },
    },

    status: {
      type: String,
      enum: Object.values(LISTING_STATUS),
      default: LISTING_STATUS.ACTIVE,
    },

    expiresAt: { type: Date },
    views: { type: Number, default: 0 },
    inquiries: { type: Number, default: 0 },
    tags: [{ type: String, trim: true, lowercase: true }],

    // ─── DUTCH CLOCK PRICE DECAY FLASH SALE FOR PERISHABLES ───
    priceDecay: {
      enabled: { type: Boolean, default: false },
      startingPrice: { type: Number },
      currentPrice: { type: Number },
      floorPrice: { type: Number }, // Absolute minimum limit (never drops below this)
      decrementAmount: { type: Number, default: 2 }, // Drop amount in INR (e.g. ₹2)
      intervalMinutes: { type: Number, default: 30 }, // Interval (e.g. every 30 mins)
      startTime: { type: Date },
      endTime: { type: Date },
      nextDropAt: { type: Date },
      isPerishable: { type: Boolean, default: false },
      urgencyReason: { type: String, default: 'Same-day harvested fresh produce' },
    },
  },
  { timestamps: true }
);

// Indexes for marketplace search
cropListingSchema.index({ 'crop.name': 'text', 'crop.variety': 'text', description: 'text', tags: 'text' });
cropListingSchema.index({ 'location.coordinates': '2dsphere' });
cropListingSchema.index({ farmer: 1 });
cropListingSchema.index({ status: 1 });
cropListingSchema.index({ 'crop.category': 1, status: 1 });
cropListingSchema.index({ 'harvestDate.expected': 1 });
cropListingSchema.index({ 'pricePerUnit.expected': 1 });
cropListingSchema.index({ createdAt: -1 });
cropListingSchema.index({ expiresAt: 1 });

// Virtual: is listing expired?
cropListingSchema.virtual('isExpired').get(function () {
  return this.expiresAt && this.expiresAt < new Date();
});

// Set available quantity from expected on first save
cropListingSchema.pre('save', function () {
  if (this.isNew && this.quantity.available === undefined) {
    this.quantity.available = this.quantity.expected;
  }
});

module.exports = mongoose.model('CropListing', cropListingSchema);
