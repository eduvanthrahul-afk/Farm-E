'use strict';

const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();

const ms = require('../services/marketplace.service');
const { protect } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { validate } = require('../middleware/validate.middleware');
const { success, created, paginated } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { ROLES } = require('../config/constants');
const Order = require('../models/Order');
const Farm = require('../models/Farm');
const { sanitizeFarm } = require('../utils/locationPrivacy');

// ─── FARM PROFILE ────────────────────────────────────────────────────────────

// POST /api/farms
router.post(
  '/',
  protect,
  authorize(ROLES.FARMER),
  [body('farmName').trim().notEmpty().withMessage('Farm name required')],
  validate,
  asyncHandler(async (req, res) => {
    const farm = await ms.createFarm(req.user._id, req.body);
    created(res, { farm }, 'Farm profile created');
  })
);

// GET /api/farms/mine
router.get(
  '/mine',
  protect,
  authorize(ROLES.FARMER),
  asyncHandler(async (req, res) => {
    const farm = await ms.getFarm(req.user._id);
    success(res, { farm });
  })
);

// GET /api/farms/:id
router.get(
  '/:id',
  protect,
  asyncHandler(async (req, res) => {
    const farm = await ms.getFarmById(req.params.id);
    const ownerId = farm.farmer?._id || farm.farmer;
    const isOwner = ownerId.toString() === req.user._id.toString();
    const hasOrder = req.user.role === ROLES.ADMIN || isOwner || await Order.exists({
      farmer: ownerId,
      buyer: req.user._id,
    });
    const isPrivileged = isOwner || req.user.role === ROLES.ADMIN;
    const publicFarm = sanitizeFarm(farm, { includeExact: hasOrder, includePrivate: isPrivileged });
    success(res, { farm: publicFarm });
  })
);

// PUT /api/farms/:id — farmer can update their own farm
router.put(
  '/:id',
  protect,
  authorize(ROLES.FARMER),
  [param('id').isMongoId().withMessage('Valid farm ID required')],
  validate,
  asyncHandler(async (req, res) => {
    const ownedFarm = await Farm.findOne({ _id: req.params.id, farmer: req.user._id }).select('_id');
    if (!ownedFarm) return res.status(404).json({ success: false, message: 'Farm not found or not owned by you' });
    const farm = await ms.updateFarm(req.user._id, req.body);
    success(res, { farm }, 'Farm updated');
  })
);

module.exports = router;
