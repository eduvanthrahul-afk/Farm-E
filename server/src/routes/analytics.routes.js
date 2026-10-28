'use strict';

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/apiResponse');
const Order = require('../models/Order');
const BuyerRequirement = require('../models/BuyerRequirement');
const { ORDER_STATUS } = require('../config/constants');

router.use(protect, authorize('FARMER', 'BUYER'));

router.get('/mine', asyncHandler(async (req, res) => {
  const isFarmer = req.user.role === 'FARMER';
  const ownerFilter = isFarmer ? { farmer: req.user._id } : { buyer: req.user._id };
  const settledStatuses = [ORDER_STATUS.PAYMENT_SETTLED, ORDER_STATUS.COMPLETED];
  const from = new Date();
  from.setDate(1);
  from.setHours(0, 0, 0, 0);
  from.setMonth(from.getMonth() - 5);

  const [summaryResult, monthlyResult, cropResult, demandResult] = await Promise.all([
    Order.aggregate([
      { $match: ownerFilter },
      { $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        activeOrders: { $sum: { $cond: [{ $not: [{ $in: ['$status', [ORDER_STATUS.COMPLETED, ORDER_STATUS.CANCELLED]] }] }, 1, 0] } },
        completedOrders: { $sum: { $cond: [{ $in: ['$status', settledStatuses] }, 1, 0] } },
        settledValue: { $sum: { $cond: [{ $in: ['$status', settledStatuses] }, { $ifNull: ['$price.actualTotal', '$price.expectedTotal'] }, 0] } },
        openValue: { $sum: { $cond: [{ $not: [{ $in: ['$status', [ORDER_STATUS.COMPLETED, ORDER_STATUS.CANCELLED]] }] }, '$price.expectedTotal', 0] } },
      } },
    ]),
    Order.aggregate([
      { $match: { ...ownerFilter, createdAt: { $gte: from } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: 'Asia/Kolkata' } },
        orders: { $sum: 1 },
        value: { $sum: { $cond: [{ $in: ['$status', settledStatuses] }, { $ifNull: ['$price.actualTotal', '$price.expectedTotal'] }, 0] } },
      } },
      { $sort: { _id: 1 } },
    ]),
    Order.aggregate([
      { $match: { ...ownerFilter, status: { $in: settledStatuses } } },
      { $group: { _id: '$crop.name', orders: { $sum: 1 }, value: { $sum: { $ifNull: ['$price.actualTotal', '$price.expectedTotal'] } } } },
      { $sort: { value: -1 } },
      { $limit: 5 },
    ]),
    BuyerRequirement.aggregate([
      { $match: { status: { $in: ['OPEN', 'RECEIVING_BIDS'] }, expiresAt: { $gt: new Date() } } },
      { $group: { _id: '$crop.name', requests: { $sum: 1 }, quantity: { $sum: '$quantity.required' } } },
      { $sort: { requests: -1 } },
      { $limit: 5 },
    ]),
  ]);

  const summary = summaryResult[0] || { totalOrders: 0, activeOrders: 0, completedOrders: 0, settledValue: 0, openValue: 0 };
  success(res, {
    role: req.user.role,
    summary,
    monthly: monthlyResult,
    topCrops: cropResult,
    demandCrops: demandResult,
    periodStart: from,
  });
}));

module.exports = router;
