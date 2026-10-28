'use strict';

const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const { protect } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const { success, created, notFound, forbidden } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const Order = require('../models/Order');
const Bid = require('../models/Bid');
const CropListing = require('../models/CropListing');
const BuyerRequirement = require('../models/BuyerRequirement');
const Notification = require('../models/Notification');
const { NOTIFICATION_TYPES, ROLES, LISTING_STATUS, REQUIREMENT_STATUS } = require('../config/constants');
const { parsePagination, paginationMeta } = require('../utils/pagination');

// GET /api/conversations
router.get(
  '/',
  protect,
  asyncHandler(async (req, res) => {
    const conversations = await Conversation.find({
      participants: req.user._id,
      isActive: true,
    })
      .populate('participants', 'name avatar role')
      .populate('order', 'orderNumber status')
      .sort({ updatedAt: -1 });

    success(res, { conversations, total: conversations.length });
  })
);

// POST /api/conversations
router.post(
  '/',
  protect,
  [
    body('participantId').isMongoId().withMessage('Valid participant ID required'),
    body('orderId').optional().isMongoId().withMessage('Invalid order ID'),
    body('bidId').optional().isMongoId().withMessage('Invalid bid ID'),
    body('title').optional().trim().isLength({ max: 120 }),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { participantId, orderId, bidId, title } = req.body;

    if (String(participantId).toLowerCase() === req.user._id.toString().toLowerCase()) return forbidden(res, 'You cannot start a conversation with yourself');
    const participant = await User.findOne({ _id: participantId, isActive: true }).select('_id role');
    if (!participant) return notFound(res, 'Participant not found');
    const targetId = participant._id;

    if (orderId) {
      const order = await Order.findOne({ _id: orderId, $or: [
        { farmer: req.user._id, buyer: targetId },
        { buyer: req.user._id, farmer: targetId },
      ] }).select('_id bid');
      if (!order) return notFound(res, 'Order not found');
      if (bidId && order.bid?.toString() !== bidId) return forbidden(res, 'Bid does not belong to this order');
    } else if (bidId) {
      const bid = await Bid.findById(bidId).populate('requirement', 'buyer');
      const validPair = bid && bid.requirement?.buyer && (
        (bid.farmer.toString() === req.user._id.toString() && bid.requirement.buyer.toString() === targetId.toString()) ||
        (bid.farmer.toString() === targetId.toString() && bid.requirement.buyer.toString() === req.user._id.toString())
      );
      if (!validPair) return notFound(res, 'Bid not found');
    } else {
      // Start a new marketplace conversation only between a buyer and farmer
      // who have a currently active listing or public requirement in common.
      const [hasListing, hasRequirement] = await Promise.all([
        req.user.role === ROLES.BUYER && participant.role === ROLES.FARMER
          ? CropListing.exists({ farmer: targetId, status: LISTING_STATUS.ACTIVE, 'quantity.available': { $gt: 0 } })
          : req.user.role === ROLES.FARMER && participant.role === ROLES.BUYER
            ? CropListing.exists({ farmer: req.user._id, status: LISTING_STATUS.ACTIVE, 'quantity.available': { $gt: 0 } }) : false,
        req.user.role === ROLES.FARMER && participant.role === ROLES.BUYER
          ? BuyerRequirement.exists({ buyer: targetId, isPublic: true, status: { $in: [REQUIREMENT_STATUS.OPEN, REQUIREMENT_STATUS.RECEIVING_BIDS] }, expiresAt: { $gt: new Date() } })
          : req.user.role === ROLES.BUYER && participant.role === ROLES.FARMER
            ? BuyerRequirement.exists({ buyer: req.user._id, isPublic: true, status: { $in: [REQUIREMENT_STATUS.OPEN, REQUIREMENT_STATUS.RECEIVING_BIDS] }, expiresAt: { $gt: new Date() } }) : false,
      ]);
      if (!hasListing && !hasRequirement) return forbidden(res, 'Start a conversation from an active listing, requirement, bid, or order');
    }

    // Check if conversation already exists
    const existing = await Conversation.findOne({
      participants: { $all: [req.user._id, targetId] },
      order: orderId || null,
      bid: bidId || null,
      isActive: true,
    })
      .populate('participants', 'name avatar role')
      .populate('order', 'orderNumber status');

    if (existing) return success(res, { conversation: existing });

    const conversation = await Conversation.create({
      participants: [req.user._id, targetId],
      order: orderId || null,
      bid: bidId || null,
      title,
      unreadCount: { [targetId.toString()]: 0 },
    });

    const populated = await conversation.populate('participants', 'name avatar role');
    created(res, { conversation: populated }, 'Conversation started');
  })
);

// GET /api/conversations/:id/messages
router.get(
  '/:id/messages',
  protect,
  asyncHandler(async (req, res) => {
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      participants: req.user._id,
    });
    if (!conversation) return notFound(res, 'Conversation not found');

    const { page, limit, skip } = parsePagination(req.query, { limit: 50 });

    const [messages, total] = await Promise.all([
      Message.find({ conversation: req.params.id, isDeleted: false })
        .populate('sender', 'name avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Message.countDocuments({ conversation: req.params.id, isDeleted: false }),
    ]);

    success(res, { messages: messages.reverse(), pagination: paginationMeta(page, limit, total) });
  })
);

// POST /api/conversations/:id/messages
router.post(
  '/:id/messages',
  protect,
  [body('content').trim().isLength({ min: 1, max: 5000 }).withMessage('Message must be 1-5000 characters')],
  validate,
  asyncHandler(async (req, res) => {
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      participants: req.user._id,
    });
    if (!conversation) return notFound(res, 'Conversation not found');

    const messageType = req.body.type || 'TEXT';
    if (!['TEXT', 'COUNTER_OFFER'].includes(messageType)) {
      return res.status(400).json({ success: false, message: 'Unsupported message type' });
    }
    let counterOffer;
    if (messageType === 'COUNTER_OFFER') {
      const pricePerUnit = Number(req.body.counterOffer?.pricePerUnit);
      const quantity = Number(req.body.counterOffer?.quantity);
      if (!Number.isFinite(pricePerUnit) || pricePerUnit <= 0 || !Number.isFinite(quantity) || quantity <= 0) {
        return res.status(400).json({ success: false, message: 'Counter-offers require a positive price and quantity' });
      }
      counterOffer = {
        pricePerUnit,
        quantity,
        notes: String(req.body.counterOffer?.notes || '').slice(0, 500),
      };
    }

    const message = await Message.create({
      conversation: conversation._id,
      sender: req.user._id,
      content: req.body.content,
      type: messageType,
      counterOffer,
    });

    // Update last message on conversation
    conversation.lastMessage = {
      content: req.body.content,
      sender: req.user._id,
      sentAt: new Date(),
    };

    // Increment unread for other participants
    conversation.participants.forEach((p) => {
      if (p.toString() !== req.user._id.toString()) {
        const current = conversation.unreadCount.get(p.toString()) || 0;
        conversation.unreadCount.set(p.toString(), current + 1);
      }
    });

    await conversation.save();

    const populated = await message.populate('sender', 'name avatar');

    // The REST request is the single source of truth for writes. Broadcast its
    // persisted message so other open clients update without a second DB write.
    const io = req.app.get('io');
    if (io) {
      io.to(`conv:${conversation._id}`).emit('new:message', {
        conversationId: conversation._id.toString(),
        message: populated,
      });

      const connectedUsers = req.app.get('connectedUsers');
      for (const participantId of conversation.participants) {
        const recipientId = participantId.toString();
        if (recipientId === req.user._id.toString()) continue;

        if (!connectedUsers?.has(recipientId)) {
          await Notification.create({
            recipient: participantId,
            type: NOTIFICATION_TYPES.NEW_MESSAGE,
            title: `New message from ${req.user.name}`,
            body: req.body.content.substring(0, 100),
            data: { relatedId: conversation._id, relatedModel: 'Conversation' },
          });
        }

        io.to(`user:${recipientId}`).emit('notification:new', {
          type: NOTIFICATION_TYPES.NEW_MESSAGE,
          conversationId: conversation._id.toString(),
        });
      }
    }

    created(res, { message: populated });
  })
);

// PATCH /api/conversations/:id/read — mark all as read
router.patch(
  '/:id/read',
  protect,
  asyncHandler(async (req, res) => {
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      participants: req.user._id,
    });
    if (!conversation) return notFound(res, 'Conversation not found');

    const readAt = new Date();
    conversation.unreadCount.set(req.user._id.toString(), 0);
    await conversation.save();

    await Message.updateMany(
      { conversation: conversation._id, 'readBy.user': { $ne: req.user._id } },
      { $push: { readBy: { user: req.user._id, readAt } } }
    );

    const io = req.app.get('io');
    if (io) {
      for (const participantId of conversation.participants) {
        if (participantId.toString() === req.user._id.toString()) continue;
        io.to(`user:${participantId}`).emit('messages:read', {
          conversationId: conversation._id.toString(),
          readerId: req.user._id.toString(),
          readAt: readAt.toISOString(),
        });
      }
    }

    success(res, {}, 'Messages marked as read');
  })
);

module.exports = router;
