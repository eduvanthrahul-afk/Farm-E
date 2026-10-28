'use strict';

const mongoose = require('mongoose');
const { DISPUTE_STATUS, DISPUTE_TYPES } = require('../config/constants');

const disputeMessageSchema = new mongoose.Schema(
  {
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, trim: true, required: true },
    attachments: [{ type: String }],
  },
  { timestamps: true }
);

const disputeSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    raisedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    against: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    type: { type: String, enum: Object.values(DISPUTE_TYPES), required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },

    evidence: [
      {
        url: { type: String },
        type: { type: String, enum: ['IMAGE', 'DOCUMENT', 'VIDEO'] },
        description: { type: String },
      },
    ],

    status: {
      type: String,
      enum: Object.values(DISPUTE_STATUS),
      default: DISPUTE_STATUS.OPEN,
    },

    resolution: {
      decision: { type: String, trim: true },
      notes: { type: String, trim: true },
      resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      resolvedAt: { type: Date, default: null },
    },

    messages: [disputeMessageSchema],
  },
  { timestamps: true }
);

disputeSchema.index({ order: 1 });
disputeSchema.index({ raisedBy: 1, status: 1 });
disputeSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Dispute', disputeSchema);
