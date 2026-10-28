'use strict';

const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const ms = require('../services/marketplace.service');
const { protect } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { validate } = require('../middleware/validate.middleware');
const { success, created, paginated, notFound } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const BuyerRequirement = require('../models/BuyerRequirement');
const CropListing = require('../models/CropListing');
const Bid = require('../models/Bid');
const Order = require('../models/Order');
const { ROLES, REQUIREMENT_STATUS, LISTING_STATUS, QUALITY_GRADES, QUALITY_CERTIFICATIONS, UNITS, CROP_CATEGORIES } = require('../config/constants');
const { parsePagination, paginationMeta } = require('../utils/pagination');
const { computeMatchScore } = require('../services/matching.service');
const { sanitizeLocation, sanitizeFarm } = require('../utils/locationPrivacy');
const { applyCurrentListingPrice } = require('../utils/priceDecay');
const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 100);

const requirementView = (requirement, includeExactLocation = false) => {
  const view = requirement.toObject();
  if (!includeExactLocation && view.deliveryLocation) {
    const location = sanitizeLocation(view.deliveryLocation);
    location.address = [location.district, location.state].filter(Boolean).join(', ') || 'Exact delivery point shared after an order';
    location.isApproximate = true;
    view.deliveryLocation = location;
  }
  return view;
};

const rankMatchingListings = async (requirement) => {
  const candidates = await CropListing.find({
    status: LISTING_STATUS.ACTIVE,
    'quantity.available': { $gt: 0 },
    $and: [{ $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } },
    ] }],
    $or: [
      { 'crop.name': new RegExp(`^${escapeRegExp(requirement.crop.name)}$`, 'i') },
      { 'crop.category': requirement.crop.category },
    ],
  })
    .populate('farmer', 'name avatar')
    .populate('farm', 'farmName location avgRating isVerified')
    .sort({ createdAt: -1 })
    .limit(250);

  const matches = candidates.map((listing) => {
    const view = applyCurrentListingPrice(listing);
    const matchScore = computeMatchScore(requirement, view);
    view.location = sanitizeLocation(view.location);
    if (view.farm) view.farm = sanitizeFarm(view.farm);
    return { listing: view, matchScore };
  }).sort((a, b) => b.matchScore.score - a.matchScore.score ||
    a.listing.pricePerUnit.expected - b.listing.pricePerUnit.expected ||
    new Date(a.listing.harvestDate.expected) - new Date(b.listing.harvestDate.expected));

  const eligibleMatches = matches.filter(({ matchScore }) => matchScore.eligible);
  return {
    matches: eligibleMatches.slice(0, 20),
    totalCandidates: candidates.length,
    eligibleCandidates: eligibleMatches.length,
  };
};

const quickMatchValidation = [
  body('crop.name').trim().notEmpty().isLength({ max: 80 }).withMessage('Enter a crop name up to 80 characters'),
  body('crop.category').isIn(CROP_CATEGORIES).withMessage('Choose a valid crop category'),
  body('crop.variety').optional({ values: 'falsy' }).trim().isLength({ max: 80 }).withMessage('Variety must be 80 characters or fewer'),
  body('quantity.required').isFloat({ min: 0.1 }).withMessage('Quantity must be greater than zero'),
  body('quantity.unit').isIn(UNITS).withMessage('Choose a valid quantity unit'),
  body('quantity.flexibility').optional().isIn(['EXACT', '±10%', '±20%', 'FLEXIBLE']).withMessage('Choose a valid quantity tolerance'),
  body('priceTarget.max').isFloat({ min: 0.01 }).withMessage('Maximum price must be greater than zero'),
  body('quality.grade').optional({ values: 'falsy' }).isIn(QUALITY_GRADES).withMessage('Choose a valid quality grade'),
  body('quality.certifications').optional().isArray().withMessage('Certifications must be a list'),
  body('quality.certifications.*').optional().isIn(QUALITY_CERTIFICATIONS).withMessage('Unsupported certification'),
  body('deliveryDate.required').isISO8601().withMessage('Choose a valid delivery date'),
  body('deliveryDate.flexible').optional().isBoolean().withMessage('Delivery flexibility must be true or false'),
];

// POST /api/requirements
router.post(
  '/',
  protect,
  authorize(ROLES.BUYER),
  [
    body('crop.name').trim().notEmpty().withMessage('Crop name required'),
    body('crop.category').isIn(CROP_CATEGORIES).withMessage('Invalid category'),
    body('quantity.required').isFloat({ min: 0.1 }).withMessage('Required quantity must be > 0'),
    body('quantity.unit').isIn(UNITS).withMessage('Invalid unit'),
    body('priceTarget.max').isFloat({ min: 0.01 }).withMessage('Maximum price must be greater than 0'),
    body('priceTarget.preferred').optional().isFloat({ min: 0.01 }).withMessage('Preferred price must be greater than 0'),
    body('quantity.flexibility').optional().isIn(['EXACT', '±10%', '±20%', 'FLEXIBLE']).withMessage('Invalid quantity flexibility'),
    body('quality.grade').optional({ values: 'falsy' }).isIn(QUALITY_GRADES).withMessage('Invalid quality grade'),
    body('quality.certifications').optional().isArray().withMessage('Certifications must be a list'),
    body('quality.certifications.*').optional().isIn(QUALITY_CERTIFICATIONS).withMessage('Unsupported certification'),
    body('deliveryDate.flexible').optional().isBoolean().withMessage('Delivery flexibility must be true or false'),
    body('deliveryDate.required').isISO8601().withMessage('Valid delivery date required'),
    body('deliveryLocation.address').trim().notEmpty().withMessage('Delivery address required'),
    body('expiresAt').isISO8601().withMessage('Valid expiry date required'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    if (req.body.priceTarget?.preferred !== undefined && Number(req.body.priceTarget.preferred) > Number(req.body.priceTarget.max)) {
      return res.status(400).json({ success: false, message: 'Preferred price cannot exceed maximum price' });
    }
    const requirement = await ms.createRequirement(req.user._id, req.body, req);
    created(res, { requirement }, 'Requirement posted');
  })
);

// GET /api/requirements/mine — buyer's own
router.get(
  '/mine',
  protect,
  authorize(ROLES.BUYER),
  asyncHandler(async (req, res) => {
    const { requirements, pagination } = await ms.getMyRequirements(req.user._id, req.query);
    paginated(res, { requirements }, pagination);
  })
);

// POST /api/requirements/matches/preview — rank active listings without publishing a requirement.
router.post(
  '/matches/preview',
  protect,
  authorize(ROLES.BUYER),
  quickMatchValidation,
  validate,
  asyncHandler(async (req, res) => {
    const requirement = {
      crop: req.body.crop,
      quantity: req.body.quantity,
      priceTarget: req.body.priceTarget,
      quality: req.body.quality || {},
      deliveryDate: req.body.deliveryDate,
    };
    const result = await rankMatchingListings(requirement);
    success(res, result, 'Matching listings ranked');
  })
);

// GET /api/requirements — farmers browse open requirements
router.get(
  '/',
  protect,
  authorize(ROLES.FARMER, ROLES.ADMIN),
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req.query);

    const filter = {
      status: { $in: [REQUIREMENT_STATUS.OPEN, REQUIREMENT_STATUS.RECEIVING_BIDS] },
      isPublic: true,
      expiresAt: { $gt: new Date() },
    };
    if (req.query.crop) filter['crop.name'] = new RegExp(escapeRegExp(req.query.crop), 'i');
    if (req.query.category) filter['crop.category'] = req.query.category;
    if (req.query.search) filter.$text = { $search: req.query.search };

    const [requirements, total] = await Promise.all([
      BuyerRequirement.find(filter)
        .populate('buyer', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      BuyerRequirement.countDocuments(filter),
    ]);

    paginated(res, {
      requirements: requirements.map((requirement) => requirementView(
        requirement,
        requirement.buyer?._id?.toString() === req.user._id.toString()
      )),
    }, paginationMeta(page, limit, total));
  })
);

// GET /api/requirements/:id
router.get(
  '/:id',
  protect,
  asyncHandler(async (req, res) => {
    const requirement = await BuyerRequirement.findById(req.params.id)
      .populate('buyer', 'name')
      .populate('currentLowestBid.farmer', 'name');
    if (!requirement) return notFound(res, 'Requirement not found');
    const isOwner = requirement.buyer?._id?.toString() === req.user._id.toString();
    const isAdmin = req.user.role === ROLES.ADMIN;
    const canBrowse = req.user.role === ROLES.FARMER && requirement.isPublic &&
      [REQUIREMENT_STATUS.OPEN, REQUIREMENT_STATUS.RECEIVING_BIDS].includes(requirement.status) &&
      requirement.expiresAt > new Date();
    const hasBid = req.user.role === ROLES.FARMER && await Bid.exists({ requirement: requirement._id, farmer: req.user._id });
    if (!isOwner && !isAdmin && !canBrowse && !hasBid) return notFound(res, 'Requirement not found');
    success(res, { requirement: requirementView(requirement, isOwner || isAdmin) });
  })
);

// GET /api/requirements/:id/matches — buyer-only ranked listing suggestions with score reasons.
router.get(
  '/:id/matches',
  protect,
  authorize(ROLES.BUYER),
  asyncHandler(async (req, res) => {
    const requirement = await BuyerRequirement.findOne({ _id: req.params.id, buyer: req.user._id });
    if (!requirement) return notFound(res, 'Requirement not found or not owned by you');
    const result = await rankMatchingListings(requirement);
    success(res, result, 'Matching listings ranked');
  })
);

// PUT /api/requirements/:id
router.put(
  '/:id',
  protect,
  authorize(ROLES.BUYER),
  asyncHandler(async (req, res) => {
    const requirement = await BuyerRequirement.findOne({
      _id: req.params.id,
      buyer: req.user._id,
    });
    if (!requirement) return notFound(res, 'Requirement not found or not owned by you');
    if (![REQUIREMENT_STATUS.OPEN, REQUIREMENT_STATUS.RECEIVING_BIDS].includes(requirement.status) || requirement.bidsCount > 0) {
      return res.status(400).json({ success: false, message: 'A requirement cannot be edited after bids are received or it is closed' });
    }

    const allowedFields = ['crop', 'description', 'quantity', 'priceTarget', 'quality', 'deliveryDate', 'deliveryLocation', 'expiresAt', 'tags'];
    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) requirement.set(field, req.body[field]);
    }
    await requirement.save();
    success(res, { requirement }, 'Requirement updated');
  })
);

// PATCH /api/requirements/:id/status
router.patch(
  '/:id/status',
  protect,
  authorize(ROLES.BUYER),
  [body('status').isIn(Object.values(REQUIREMENT_STATUS)).withMessage('Invalid status')],
  validate,
  asyncHandler(async (req, res) => {
    const requirement = await BuyerRequirement.findOne({
      _id: req.params.id,
      buyer: req.user._id,
    });
    if (!requirement) return notFound(res, 'Requirement not found or not owned by you');
    const allowedTransitions = {
      [REQUIREMENT_STATUS.OPEN]: [REQUIREMENT_STATUS.RECEIVING_BIDS, REQUIREMENT_STATUS.CANCELLED],
      [REQUIREMENT_STATUS.RECEIVING_BIDS]: [REQUIREMENT_STATUS.NEGOTIATING, REQUIREMENT_STATUS.CANCELLED],
      [REQUIREMENT_STATUS.NEGOTIATING]: [REQUIREMENT_STATUS.RECEIVING_BIDS, REQUIREMENT_STATUS.CANCELLED],
    };
    if (!allowedTransitions[requirement.status]?.includes(req.body.status)) {
      return res.status(400).json({ success: false, message: `Cannot transition requirement from ${requirement.status} to ${req.body.status}` });
    }
    requirement.status = req.body.status;
    await requirement.save();
    success(res, { requirement }, 'Status updated');
  })
);

// GET /api/requirements/:id/bids — buyer sees all bids on their requirement
router.get(
  '/:id/bids',
  protect,
  authorize(ROLES.BUYER),
  asyncHandler(async (req, res) => {
    const requirement = await BuyerRequirement.findOne({
      _id: req.params.id,
      buyer: req.user._id,
    });
    if (!requirement) return notFound(res, 'Requirement not found or not owned by you');

    const bids = await Bid.find({ requirement: req.params.id })
      .populate('farmer', 'name avatar')
      .populate('farm', 'farmName location avgRating isVerified')
      .sort({ 'price.perUnit': 1 });

    const orders = await Order.find({ bid: { $in: bids.map((bid) => bid._id) } }).select('bid').lean();
    const orderedBidIds = new Set(orders.map((order) => order.bid.toString()));

    // Attach match score to each bid
    const bidsWithScore = bids.map((bid) => {
      const bidAsListing = {
        crop: { name: requirement.crop.name, variety: requirement.crop.variety },
        quantity: { available: bid.quantity.offered, expected: bid.quantity.offered },
        pricePerUnit: { expected: bid.price.perUnit },
        quality: bid.quality,
        harvestDate: { expected: bid.harvestDate },
        location: { coordinates: bid.farm?.location?.coordinates },
      };
      const match = computeMatchScore(requirement, bidAsListing);
      return {
        ...bid.toObject(),
        farm: sanitizeFarm(bid.farm, {
          includeExact: orderedBidIds.has(bid._id.toString()),
          includePrivate: false,
        }),
        matchScore: match,
      };
    });

    success(res, { bids: bidsWithScore, total: bids.length });
  })
);

module.exports = router;
