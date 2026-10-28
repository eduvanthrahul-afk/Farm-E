'use strict';

const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema(
  {
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    bid: { type: mongoose.Schema.Types.ObjectId, ref: 'Bid', default: null },
    title: { type: String, trim: true },
    lastMessage: {
      content: { type: String },
      sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      sentAt: { type: Date },
    },
    unreadCount: { type: Map, of: Number, default: {} },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

conversationSchema.index({ participants: 1 });
conversationSchema.index({ order: 1 });
conversationSchema.index({ updatedAt: -1 });

module.exports = mongoose.model('Conversation', conversationSchema);
