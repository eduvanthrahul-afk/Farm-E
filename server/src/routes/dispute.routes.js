'use strict';

const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const { protect } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { validate } = require('../middleware/validate.middleware');
const { success, created, notFound, paginated } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const Dispute = require('../models/Dispute');
const Order = require('../models/Order');
const { DISPUTE_TYPES, DISPUTE_STATUS, ORDER_STATUS, ROLES } = require('../config/constants');

// POST /api/disputes
router.post(
  '/',
  protect,
  [
    body('orderId').isMongoId().withMessage('Valid order ID required'),
    body('type').isIn(Object.values(DISPUTE_TYPES)).withMessage('Invalid dispute type'),
    body('title').trim().notEmpty().withMessage('Title required'),
    body('description').trim().isLength({ min: 20, max: 5000 }).withMessage('Description must be 20-5000 characters'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { orderId, type, title, description } = req.body;

    const order = await Order.findById(orderId);
    if (!order) return notFound(res, 'Order not found');

    const isFarmer = order.farmer.toString() === req.user._id.toString();
    const isBuyer = order.buyer.toString() === req.user._id.toString();
    if (!isFarmer && !isBuyer) {
      const err = new Error('Not part of this order');
      err.statusCode = 403;
      throw err;
    }

    if (![ORDER_STATUS.DELIVERED, ORDER_STATUS.WEIGHT_VERIFIED].includes(order.status) || order.dispute) {
      const err = new Error('A dispute can only be raised once for an order that has been delivered');
      err.statusCode = 400;
      throw err;
    }

    const against = isBuyer ? order.farmer : order.buyer;

    const dispute = await Dispute.create({
      order: orderId,
      raisedBy: req.user._id,
      against,
      type,
      title,
      description,
    });

    const updated = await Order.findOneAndUpdate({ _id: order._id, status: order.status, dispute: null }, {
      $set: { status: ORDER_STATUS.DISPUTED, dispute: dispute._id },
      $push: { statusHistory: { status: ORDER_STATUS.DISPUTED, changedBy: req.user._id, changedAt: new Date() } },
    }, { returnDocument: 'after' });
    if (!updated) {
      await Dispute.deleteOne({ _id: dispute._id });
      const err = new Error('Order changed while raising the dispute. Refresh and try again.');
      err.statusCode = 409;
      throw err;
    }

    created(res, { dispute }, 'Dispute raised');
  })
);

// GET /api/disputes/mine
router.get(
  '/mine',
  protect,
  asyncHandler(async (req, res) => {
    const disputes = await Dispute.find({
      $or: [{ raisedBy: req.user._id }, { against: req.user._id }],
    })
      .populate('order', 'orderNumber crop')
      .populate('raisedBy', 'name')
      .populate('against', 'name')
      .sort({ createdAt: -1 });

    success(res, { disputes, total: disputes.length });
  })
);

// GET /api/disputes/:id
router.get(
  '/:id',
  protect,
  asyncHandler(async (req, res) => {
    const dispute = await Dispute.findById(req.params.id)
      .populate('order', 'orderNumber crop farmer buyer evidence')
      .populate('raisedBy', 'name avatar')
      .populate('against', 'name avatar')
      .populate('messages.from', 'name avatar');

    await dispute?.populate('order.evidence.addedBy', 'name role');

    if (!dispute) return notFound(res, 'Dispute not found');

    const isParty =
      dispute.raisedBy._id.toString() === req.user._id.toString() ||
      dispute.against._id.toString() === req.user._id.toString() ||
      req.user.role === ROLES.ADMIN;

    if (!isParty) return notFound(res, 'Not authorized');

    success(res, { dispute });
  })
);

// POST /api/disputes/:id/messages
router.post(
  '/:id/messages',
  protect,
  [body('content').trim().isLength({ min: 1, max: 3000 }).withMessage('Message must be 1-3000 characters')],
  validate,
  asyncHandler(async (req, res) => {
    const dispute = await Dispute.findById(req.params.id);
    if (!dispute) return notFound(res, 'Dispute not found');
    if ([DISPUTE_STATUS.RESOLVED, DISPUTE_STATUS.CLOSED].includes(dispute.status)) {
      return res.status(400).json({ success: false, message: 'This dispute is closed to new messages' });
    }

    const isParty =
      dispute.raisedBy.toString() === req.user._id.toString() ||
      dispute.against.toString() === req.user._id.toString() ||
      req.user.role === ROLES.ADMIN;

    if (!isParty) {
      const err = new Error('Not authorized');
      err.statusCode = 403;
      throw err;
    }

    dispute.messages.push({ from: req.user._id, content: req.body.content });
    await dispute.save();
    success(res, { dispute }, 'Message added');
  })
);

// PATCH /api/disputes/:id/resolve — ADMIN only
router.patch(
  '/:id/resolve',
  protect,
  authorize(ROLES.ADMIN),
  [body('decision').trim().notEmpty().withMessage('Decision required')],
  validate,
  asyncHandler(async (req, res) => {
    const dispute = await Dispute.findById(req.params.id);
    if (!dispute) return notFound(res, 'Dispute not found');
    if ([DISPUTE_STATUS.RESOLVED, DISPUTE_STATUS.CLOSED].includes(dispute.status)) {
      return res.status(400).json({ success: false, message: 'This dispute has already been resolved' });
    }

    dispute.status = DISPUTE_STATUS.RESOLVED;
    dispute.resolution = {
      decision: req.body.decision,
      notes: req.body.notes,
      resolvedBy: req.user._id,
      resolvedAt: new Date(),
    };
    await dispute.save();

    const order = await Order.findOne({ _id: dispute.order, status: ORDER_STATUS.DISPUTED });
    if (order) {
      const priorStatuses = order.statusHistory.filter((entry) => entry.status !== ORDER_STATUS.DISPUTED);
      const restoreStatus = priorStatuses.at(-1)?.status;
      if ([ORDER_STATUS.DELIVERED, ORDER_STATUS.WEIGHT_VERIFIED].includes(restoreStatus)) {
        await Order.findOneAndUpdate({ _id: order._id, status: ORDER_STATUS.DISPUTED }, {
          $set: { status: restoreStatus },
          $push: { statusHistory: {
            status: restoreStatus,
            note: `Dispute resolved: ${req.body.decision}`.slice(0, 500),
            changedBy: req.user._id,
            changedAt: new Date(),
          } },
        });
      }
    }

    success(res, { dispute }, 'Dispute resolved');
  })
);

module.exports = router;
