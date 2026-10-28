'use strict';

const mongoose = require('mongoose');
const { ORDER_STATUS, PAYMENT_STATUS, UNITS } = require('../config/constants');

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    note: { type: String },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true, required: true },

    farmer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    listing: { type: mongoose.Schema.Types.ObjectId, ref: 'CropListing', default: null },
    bid: { type: mongoose.Schema.Types.ObjectId, ref: 'Bid', default: null },
    contract: { type: mongoose.Schema.Types.ObjectId, ref: 'Contract', default: null },

    crop: {
      name: { type: String, required: true },
      variety: { type: String },
      category: { type: String },
      grade: { type: String },
    },

    // Catch-weight: we store both expected and actual
    quantity: {
      expected: { type: Number, required: true },
      actual: { type: Number, default: null }, // filled after delivery
      unit: { type: String, enum: UNITS, required: true },
      weightVerified: { type: Boolean, default: false },
      verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      verifiedAt: { type: Date, default: null },
    },

    price: {
      perUnit: { type: Number, required: true },
      expectedTotal: { type: Number, required: true }, // expected qty × price
      actualTotal: { type: Number, default: null }, // actual qty × price (catch-weight)
    },

    catchWeight: {
      enabled: { type: Boolean, default: true },
      tolerance: { type: Number, default: 5 }, // ±% tolerance
    },

    status: {
      type: String,
      enum: Object.values(ORDER_STATUS),
      default: ORDER_STATUS.PENDING,
    },
    statusHistory: [statusHistorySchema],

    deliveryLocation: {
      address: { type: String },
      district: { type: String },
      state: { type: String },
      coordinates: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], default: [0, 0] },
      },
    },

    deliveryDate: {
      scheduled: { type: Date },
      actual: { type: Date },
    },

    evidence: [{
      fileName: { type: String, required: true },
      originalName: { type: String, required: true, maxlength: 180 },
      mimeType: { type: String, enum: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], required: true },
      size: { type: Number, required: true, min: 1 },
      category: { type: String, enum: ['DELIVERY_PHOTO', 'WEIGHT_RECORD', 'OTHER'], required: true },
      description: { type: String, trim: true, maxlength: 300 },
      addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      createdAt: { type: Date, default: Date.now },
    }],

    payment: {
      status: { type: String, enum: Object.values(PAYMENT_STATUS), default: PAYMENT_STATUS.PENDING },
      method: { type: String },
      transactionId: { type: String },
      settledAt: { type: Date },
      isSimulated: { type: Boolean, default: false },
    },

    dispute: { type: mongoose.Schema.Types.ObjectId, ref: 'Dispute', default: null },

    rating: {
      farmer: { type: mongoose.Schema.Types.ObjectId, ref: 'Review', default: null },
      buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'Review', default: null },
    },

    notes: { type: String, trim: true },

    // Batch & Farm-to-Fork Traceability
    traceability: {
      batchNumber: { type: String, unique: true, sparse: true, index: true },
      qrCodeData: { type: String },
      harvestDate: { type: Date },
      farmName: { type: String },
      farmLocationText: { type: String },
      geoCoordinates: { type: [Number], default: [0, 0] },
      qualityGrade: { type: String },
      certifications: [{ type: String }],
      packingDate: { type: Date },
      bestBeforeDays: { type: Number, default: 14 },
      authenticity: {
        manifest: { type: mongoose.Schema.Types.Mixed },
        signature: { type: String },
        scheme: { type: String },
      },
    },
  },
  { timestamps: true }
);

// Indexes
orderSchema.index({ farmer: 1, status: 1 });
orderSchema.index({ buyer: 1, status: 1 });
orderSchema.index({ status: 1, createdAt: -1 });

// Automatically compute expectedTotal and ensure traceability batchNumber
orderSchema.pre('save', function () {
  if (this.quantity.expected && this.price.perUnit) {
    this.price.expectedTotal = this.quantity.expected * this.price.perUnit;
  }
  if (this.quantity.actual !== null && this.price.perUnit) {
    this.price.actualTotal = this.quantity.actual * this.price.perUnit;
  }

  // Ensure batch traceability code is populated
  if (!this.traceability) {
    this.traceability = {};
  }
  if (!this.traceability.batchNumber && this.orderNumber) {
    this.traceability.batchNumber = `BATCH-${this.orderNumber}`;
    this.traceability.packingDate = this.traceability.packingDate || new Date();
  }
});

module.exports = mongoose.model('Order', orderSchema);
