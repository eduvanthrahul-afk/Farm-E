'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();

const { protect } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { validate } = require('../middleware/validate.middleware');
const { success, paginated } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const User = require('../models/User');
const Farm = require('../models/Farm');
const CropListing = require('../models/CropListing');
const BuyerRequirement = require('../models/BuyerRequirement');
const Order = require('../models/Order');
const Dispute = require('../models/Dispute');
const AuditLog = require('../models/AuditLog');
const { ROLES, ORDER_STATUS, LISTING_STATUS } = require('../config/constants');
const { parsePagination, paginationMeta } = require('../utils/pagination');

const REGIONAL_GRID_DEGREES = 0.25;

const regionalCellsPipeline = (coordinatePath, filter) => [
  { $match: {
    ...filter,
    [`${coordinatePath}.0`]: { $type: 'number' },
    [`${coordinatePath}.1`]: { $type: 'number' },
    $expr: { $and: [
      { $gte: [{ $arrayElemAt: [`$${coordinatePath}`, 0] }, -180] },
      { $lte: [{ $arrayElemAt: [`$${coordinatePath}`, 0] }, 180] },
      { $gte: [{ $arrayElemAt: [`$${coordinatePath}`, 1] }, -90] },
      { $lte: [{ $arrayElemAt: [`$${coordinatePath}`, 1] }, 90] },
      { $or: [
        { $ne: [{ $arrayElemAt: [`$${coordinatePath}`, 0] }, 0] },
        { $ne: [{ $arrayElemAt: [`$${coordinatePath}`, 1] }, 0] },
      ] },
    ] },
  } },
  { $project: {
    latIndex: { $floor: { $divide: [{ $arrayElemAt: [`$${coordinatePath}`, 1] }, REGIONAL_GRID_DEGREES] } },
    lngIndex: { $floor: { $divide: [{ $arrayElemAt: [`$${coordinatePath}`, 0] }, REGIONAL_GRID_DEGREES] } },
  } },
  { $group: { _id: { lat: '$latIndex', lng: '$lngIndex' }, count: { $sum: 1 } } },
];

const mergeRegionalCells = (supplyCells, demandCells) => {
  const cells = new Map();
  const merge = (rows, key) => rows.forEach((row) => {
    const latIndex = row._id.lat;
    const lngIndex = row._id.lng;
    const cellKey = `${latIndex}:${lngIndex}`;
    const cell = cells.get(cellKey) || {
      coordinates: [
        (lngIndex + 0.5) * REGIONAL_GRID_DEGREES,
        (latIndex + 0.5) * REGIONAL_GRID_DEGREES,
      ],
      listings: 0,
      requirements: 0,
    };
    cell[key] = row.count;
    cells.set(cellKey, cell);
  });
  merge(supplyCells, 'listings');
  merge(demandCells, 'requirements');
  return [...cells.values()];
};

// All admin routes require ADMIN role
router.use(protect, authorize(ROLES.ADMIN));

// GET /api/admin/dashboard/stats
router.get(
  '/dashboard/stats',
  asyncHandler(async (req, res) => {
    const [
      totalFarmers,
      totalBuyers,
      activeListings,
      openRequirements,
      totalOrders,
      completedOrders,
      activeDisputes,
      revenueResult,
      regionalSupplyCells,
      regionalDemandCells,
    ] = await Promise.all([
      User.countDocuments({ role: ROLES.FARMER, isActive: true }),
      User.countDocuments({ role: ROLES.BUYER, isActive: true }),
      CropListing.countDocuments({ status: LISTING_STATUS.ACTIVE, expiresAt: { $gt: new Date() }, 'quantity.available': { $gt: 0 } }),
      BuyerRequirement.countDocuments({ status: { $in: ['OPEN', 'RECEIVING_BIDS'] }, expiresAt: { $gt: new Date() }, isPublic: true }),
      Order.countDocuments(),
      Order.countDocuments({ status: ORDER_STATUS.COMPLETED }),
      Dispute.countDocuments({ status: { $in: ['OPEN', 'UNDER_REVIEW', 'AWAITING_RESPONSE', 'ESCALATED'] } }),
      Order.aggregate([
        { $match: { status: { $in: [ORDER_STATUS.PAYMENT_SETTLED, ORDER_STATUS.COMPLETED] } } },
        { $group: { _id: null, total: { $sum: { $ifNull: ['$price.actualTotal', '$price.expectedTotal'] } } } },
      ]),
      CropListing.aggregate(regionalCellsPipeline('location.coordinates.coordinates', {
        status: LISTING_STATUS.ACTIVE,
        'quantity.available': { $gt: 0 },
        $and: [{ $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: null },
          { expiresAt: { $gt: new Date() } },
        ] }],
      })),
      BuyerRequirement.aggregate(regionalCellsPipeline('deliveryLocation.coordinates.coordinates', {
        status: { $in: ['OPEN', 'RECEIVING_BIDS'] },
        isPublic: true,
        expiresAt: { $gt: new Date() },
      })),
    ]);

    const totalTransactionValue = revenueResult[0]?.total || 0;

    // Popular crops
    const popularCrops = await CropListing.aggregate([
      { $match: { status: LISTING_STATUS.ACTIVE } },
      { $group: { _id: '$crop.name', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);

    success(res, {
      stats: {
        totalFarmers,
        totalBuyers,
        activeListings,
        openRequirements,
        totalOrders,
        completedOrders,
        activeDisputes,
        totalTransactionValue,
      },
      popularCrops,
      regionalSupplyDemand: mergeRegionalCells(regionalSupplyCells, regionalDemandCells),
    });
  })
);

// GET /api/admin/users
router.get(
  '/users',
  [query('role').optional().isIn(Object.values(ROLES)), query('isVerified').optional().isBoolean(), query('search').optional().isString().isLength({ max: 100 })],
  validate,
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = {};
    if (req.query.role && Object.values(ROLES).includes(req.query.role)) filter.role = req.query.role;
    if (req.query.isVerified) filter.isVerified = req.query.isVerified === 'true';
    if (req.query.search) {
      const search = String(req.query.search).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.name = new RegExp(search, 'i');
    }

    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(filter),
    ]);

    paginated(res, { users }, paginationMeta(page, limit, total));
  })
);

// PATCH /api/admin/users/:id/verify
router.patch(
  '/users/:id/verify',
  [param('id').isMongoId().withMessage('Valid user ID required')],
  validate,
  asyncHandler(async (req, res) => {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isVerified: true },
      { returnDocument: 'after' }
    );
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    // Also verify farm if farmer
    if (user?.role === ROLES.FARMER) {
      await Farm.findOneAndUpdate(
        { farmer: user._id },
        { isVerified: true, verifiedAt: new Date(), verifiedBy: req.user._id }
      );
    }
    success(res, { user }, 'User verified');
  })
);

// PATCH /api/admin/users/:id/status
router.patch(
  '/users/:id/status',
  [param('id').isMongoId().withMessage('Valid user ID required'), body('isActive').isBoolean().withMessage('isActive must be true or false')],
  validate,
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user._id.toString() && req.body.isActive === false) {
      return res.status(400).json({ success: false, message: 'You cannot suspend your own admin account' });
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: req.body.isActive },
      { returnDocument: 'after' }
    );
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    success(res, { user }, 'User status updated');
  })
);

// GET /api/admin/disputes
router.get(
  '/disputes',
  [query('status').optional().isIn(['OPEN', 'UNDER_REVIEW', 'AWAITING_RESPONSE', 'ESCALATED', 'RESOLVED', 'CLOSED'])],
  validate,
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    const [disputes, total] = await Promise.all([
      Dispute.find(filter)
        .populate('raisedBy', 'name role')
        .populate('against', 'name role')
        .populate('order', 'orderNumber crop')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Dispute.countDocuments(filter),
    ]);

    paginated(res, { disputes }, paginationMeta(page, limit, total));
  })
);

// GET /api/admin/audit-logs
router.get(
  '/audit-logs',
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = {};
    if (req.query.action) filter.action = req.query.action;
    if (req.query.actorId) filter.actor = req.query.actorId;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('actor', 'name role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      AuditLog.countDocuments(filter),
    ]);

    paginated(res, { logs }, paginationMeta(page, limit, total));
  })
);

// GET /api/admin/orders
router.get(
  '/orders',
  [query('status').optional().isIn(Object.values(ORDER_STATUS))],
  validate,
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate('farmer', 'name')
        .populate('buyer', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Order.countDocuments(filter),
    ]);

    paginated(res, { orders }, paginationMeta(page, limit, total));
  })
);

module.exports = router;
