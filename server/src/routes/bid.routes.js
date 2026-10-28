'use strict';

const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const ms = require('../services/marketplace.service');
const { protect } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { validate } = require('../middleware/validate.middleware');
const { success, created, notFound } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const Bid = require('../models/Bid');
const Order = require('../models/Order');
const { sanitizeFarm } = require('../utils/locationPrivacy');
const { ROLES, UNITS, QUALITY_GRADES } = require('../config/constants');

// POST /api/bids — farmer submits bid
router.post(
  '/',
  protect,
  authorize(ROLES.FARMER),
  [
    body('requirement').isMongoId().withMessage('Valid requirement ID required'),
    body('price.perUnit').isFloat({ min: 0 }).withMessage('Price per unit required'),
    body('quantity.offered').isFloat({ min: 0.1 }).withMessage('Quantity required'),
    body('quantity.unit').isIn(UNITS).withMessage('Invalid unit'),
    body('harvestDate').isISO8601().withMessage('Valid harvest date required'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const bid = await ms.submitBid(req.user._id, req.body.requirement, req.body, req);
    if (bid.requirement) {
      const Requirement = require('../models/BuyerRequirement');
      const requirement = await Requirement.findById(bid.requirement).select('isLiveAuction bidsCount');
      if (requirement?.isLiveAuction) {
        const io = req.app.get('io');
        if (io) io.to(`auction:${bid.requirement}`).emit('auction:new_bid', {
          requirementId: bid.requirement.toString(),
          bidId: bid._id.toString(),
          pricePerUnit: bid.price.perUnit,
          farmerName: req.user.name || 'Farmer',
          farmerId: req.user._id.toString(),
          placedAt: bid.createdAt,
          bidsCount: requirement.bidsCount,
        });
      }
    }
    created(res, { bid }, 'Bid submitted successfully');
  })
);

// GET /api/bids/mine — farmer's own bids
router.get(
  '/mine',
  protect,
  authorize(ROLES.FARMER),
  asyncHandler(async (req, res) => {
    const bids = await Bid.find({ farmer: req.user._id })
      .populate('requirement', 'crop priceTarget quantity status buyer')
      .sort({ createdAt: -1 });
    success(res, { bids, total: bids.length });
  })
);

// GET /api/bids/:id
router.get(
  '/:id',
  protect,
  asyncHandler(async (req, res) => {
    const bid = await Bid.findById(req.params.id)
      .populate('farmer', 'name')
      .populate('farm', 'farmName location')
      .populate('requirement', 'crop buyer');
    if (!bid) return notFound(res, 'Bid not found');

    // Only farmer or buyer of the requirement can view
    const isFarmer = bid.farmer._id.toString() === req.user._id.toString();
    const isBuyer = bid.requirement.buyer?.toString() === req.user._id.toString();
    const isAdmin = req.user.role === ROLES.ADMIN;

    if (!isFarmer && !isBuyer && !isAdmin) {
      return notFound(res, 'Bid not found');
    }

    const hasOrder = await Order.exists({ bid: bid._id });
    const bidView = bid.toObject();
    bidView.farm = sanitizeFarm(bid.farm, {
      includeExact: isFarmer || isAdmin || !!hasOrder,
      includePrivate: isFarmer || isAdmin,
    });
    success(res, { bid: bidView });
  })
);

// PATCH /api/bids/:id/accept
router.patch(
  '/:id/accept',
  protect,
  authorize(ROLES.BUYER),
  asyncHandler(async (req, res) => {
    const { bid, order, contract } = await ms.acceptBid(req.user._id, req.params.id, req);
    success(res, { bid, order, contract }, 'Bid accepted — order created');
  })
);

// PATCH /api/bids/:id/reject
router.patch(
  '/:id/reject',
  protect,
  authorize(ROLES.BUYER),
  asyncHandler(async (req, res) => {
    const bid = await ms.rejectBid(req.user._id, req.params.id, req.body.reason, req);
    success(res, { bid }, 'Bid rejected');
  })
);

// PATCH /api/bids/:id/withdraw
router.patch(
  '/:id/withdraw',
  protect,
  authorize(ROLES.FARMER),
  asyncHandler(async (req, res) => {
    const bid = await ms.withdrawBid(req.user._id, req.params.id, req);
    success(res, { bid }, 'Bid withdrawn');
  })
);

module.exports = router;
