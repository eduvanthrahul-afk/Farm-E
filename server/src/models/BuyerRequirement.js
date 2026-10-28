'use strict';

const mongoose = require('mongoose');
const { REQUIREMENT_STATUS, QUALITY_GRADES, QUALITY_CERTIFICATIONS, UNITS, CROP_CATEGORIES } = require('../config/constants');

const buyerRequirementSchema = new mongoose.Schema(
  {
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    crop: {
      name: { type: String, required: true, trim: true },
      variety: { type: String, trim: true },
      category: { type: String, enum: CROP_CATEGORIES, required: true },
    },

    description: { type: String, trim: true, maxlength: 3000 },

    quantity: {
      required: { type: Number, required: true, min: 0.1 },
      unit: { type: String, enum: UNITS, required: true },
      flexibility: { type: String, enum: ['EXACT', '±10%', '±20%', 'FLEXIBLE'], default: '±10%' },
    },

    priceTarget: {
      max: { type: Number, required: true, min: 0 },
      preferred: { type: Number, min: 0 },
    },

    quality: {
      grade: { type: String, enum: QUALITY_GRADES },
      certifications: [{ type: String, enum: QUALITY_CERTIFICATIONS }],
      specifications: { type: String, trim: true },
    },

    deliveryDate: {
      required: { type: Date, required: true },
      flexible: { type: Boolean, default: false },
    },

    deliveryLocation: {
      address: { type: String, trim: true, required: true },
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
      enum: Object.values(REQUIREMENT_STATUS),
      default: REQUIREMENT_STATUS.OPEN,
    },

    expiresAt: { type: Date, required: true },
    bidsCount: { type: Number, default: 0 },
    isPublic: { type: Boolean, default: true },
    tags: [{ type: String, trim: true, lowercase: true }],

    // Dynamic Live Auction Fields
    isLiveAuction: { type: Boolean, default: false },
    auctionType: { type: String, enum: ['REVERSE_DUTCH', 'REVERSE_ENGLISH'] },
    reserveFloorPrice: { type: Number, min: 0, default: 0 }, // Farmers cannot bid lower than this floor lock
    auctionEndsAt: { type: Date },
    currentLowestBid: {
      pricePerUnit: { type: Number },
      farmer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      bidId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bid' },
    },
    bidStep: { type: Number, default: 1 }, // min decrement amount in INR
  },
  { timestamps: true }
);

// Indexes for farmer discovery
buyerRequirementSchema.index({ 'crop.name': 'text', 'crop.variety': 'text', description: 'text' });
buyerRequirementSchema.index({ 'deliveryLocation.coordinates': '2dsphere' });
buyerRequirementSchema.index({ buyer: 1 });
buyerRequirementSchema.index({ status: 1, isPublic: 1 });
buyerRequirementSchema.index({ 'crop.category': 1, status: 1 });
buyerRequirementSchema.index({ expiresAt: 1 });
buyerRequirementSchema.index({ createdAt: -1 });

module.exports = mongoose.model('BuyerRequirement', buyerRequirementSchema);
