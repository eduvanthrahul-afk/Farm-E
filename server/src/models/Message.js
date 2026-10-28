'use strict';

const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, trim: true },
    type: {
      type: String,
      enum: ['TEXT', 'IMAGE', 'FILE', 'COUNTER_OFFER', 'SYSTEM'],
      default: 'TEXT',
    },
    attachments: [{ type: String }],
    counterOffer: {
      pricePerUnit: { type: Number },
      quantity: { type: Number },
      notes: { type: String },
      status: { type: String, enum: ['PENDING', 'ACCEPTED', 'REJECTED'], default: 'PENDING' },
    },
    readBy: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        readAt: { type: Date },
      },
    ],
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ sender: 1 });

module.exports = mongoose.model('Message', messageSchema);
