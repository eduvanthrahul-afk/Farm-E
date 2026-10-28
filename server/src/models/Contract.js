'use strict';

const mongoose = require('mongoose');

const contractSchema = new mongoose.Schema(
  {
    contractNumber: { type: String, unique: true, required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },

    farmer: {
      ref: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      snapshot: {
        name: String,
        email: String,
        phone: String,
        farmName: String,
      },
    },

    buyer: {
      ref: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      snapshot: {
        name: String,
        email: String,
        phone: String,
        businessName: String,
      },
    },

    crop: {
      name: String,
      variety: String,
      category: String,
    },

    terms: {
      quantity: { type: Number, required: true },
      unit: { type: String, required: true },
      pricePerUnit: { type: Number, required: true },
      expectedTotal: { type: Number, required: true },
      harvestDate: { type: Date },
      deliveryDate: { type: Date },
      deliveryLocation: { type: String },
      qualityGrade: { type: String },
      qualitySpecs: { type: String },
      catchWeightEnabled: { type: Boolean, default: true },
      catchWeightTolerance: { type: Number, default: 5 },
      paymentTerms: { type: String, default: 'Payment due within 3 days of weight verification' },
      paymentDueDays: { type: Number, default: 3 },
      orderTerms: { type: String },
    },

    signatures: {
      farmer: {
        signedAt: { type: Date, default: null },
        ip: String,
      },
      buyer: {
        signedAt: { type: Date, default: null },
        ip: String,
      },
    },

    status: {
      type: String,
      enum: ['DRAFT', 'ACTIVE', 'COMPLETED', 'DISPUTED', 'CANCELLED'],
      default: 'ACTIVE',
    },
  },
  { timestamps: true }
);

contractSchema.index({ order: 1 });
contractSchema.index({ 'farmer.ref': 1 });
contractSchema.index({ 'buyer.ref': 1 });

module.exports = mongoose.model('Contract', contractSchema);
