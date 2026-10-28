'use strict';

const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema(
  {
    address: { type: String, trim: true },
    village: { type: String, trim: true },
    district: { type: String, trim: true },
    state: { type: String, trim: true },
    pincode: { type: String, trim: true },
    coordinates: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
    },
  },
  { _id: false }
);

const farmSchema = new mongoose.Schema(
  {
    farmer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    farmName: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000 },
    location: locationSchema,
    totalArea: { type: Number, min: 0 },
    areaUnit: { type: String, enum: ['acres', 'hectares', 'bigha', 'guntha'], default: 'acres' },
    farmPhotos: [{ type: String }],
    crops: [{ type: String, trim: true }], // list of crops they usually grow
    certifications: [{ type: String, trim: true }],
    yearEstablished: { type: Number },
    avgRating: { type: Number, default: 0, min: 0, max: 5 },
    totalReviews: { type: Number, default: 0 },
    totalOrdersCompleted: { type: Number, default: 0 },
    totalSalesValue: { type: Number, default: 0 },
    isVerified: { type: Boolean, default: false },
    verifiedAt: { type: Date, default: null },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    bankDetails: {
      accountHolder: { type: String, trim: true },
      accountNumber: { type: String, trim: true, select: false },
      ifscCode: { type: String, trim: true },
      bankName: { type: String, trim: true },
      upiId: { type: String, trim: true },
    },
  },
  { timestamps: true }
);

// Geo index for location-based queries
farmSchema.index({ 'location.coordinates': '2dsphere' });
farmSchema.index({ isVerified: 1 });
farmSchema.index({ avgRating: -1 });

module.exports = mongoose.model('Farm', farmSchema);
