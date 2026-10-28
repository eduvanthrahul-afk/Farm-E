'use strict';

const express = require('express');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const multer = require('multer');
const { body, query, param } = require('express-validator');
const router = express.Router();

const ms = require('../services/marketplace.service');
const { protect, optionalAuth } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { validate } = require('../middleware/validate.middleware');
const { success, created, paginated, notFound } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const CropListing = require('../models/CropListing');
const Farm = require('../models/Farm');
const { ROLES, LISTING_STATUS, QUALITY_GRADES, QUALITY_CERTIFICATIONS, UNITS, CROP_CATEGORIES } = require('../config/constants');
const config = require('../config/env');
const { parsePagination, paginationMeta } = require('../utils/pagination');
const { sanitizeLocation, sanitizeFarm } = require('../utils/locationPrivacy');
const { applyCurrentListingPrice } = require('../utils/priceDecay');
const objectStorage = require('../services/objectStorage.service');
const { uploadLimiter } = require('../middleware/rateLimit.middleware');
const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 100);
const LISTING_IMAGE_DIR = path.join(__dirname, '../../uploads/listings');
const MAX_LISTING_IMAGES = 5;
const LISTING_IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const listingImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: MAX_LISTING_IMAGES },
  fileFilter: (req, file, callback) => {
    if (LISTING_IMAGE_TYPES[file.mimetype]) return callback(null, true);
    const error = new Error('Listing photos must be JPEG, PNG, or WebP images');
    error.statusCode = 400;
    callback(error);
  },
});

const validListingImage = (file) => {
  const bytes = file.buffer;
  if (file.mimetype === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (file.mimetype === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (file.mimetype === 'image/webp') return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  return false;
};

const uploadListingImages = async (req, res, next) => {
  try {
    await new Promise((resolve, reject) => listingImageUpload.array('images', MAX_LISTING_IMAGES)(req, res, (error) => error ? reject(error) : resolve()));
    next();
  } catch (error) {
    if (error instanceof multer.MulterError) {
      error.statusCode = 400;
      if (error.code === 'LIMIT_FILE_SIZE') error.message = 'Each listing photo must be 5 MB or smaller';
      if (error.code === 'LIMIT_FILE_COUNT') error.message = `Choose no more than ${MAX_LISTING_IMAGES} photos at once`;
    }
    next(error);
  }
};

// Keep exact farm addresses private on public marketplace responses. Coordinates
// are rounded to roughly kilometre scale; order participants can access the pin.
const publicListingView = (listing) => {
  const result = applyCurrentListingPrice(listing);
  result.location = sanitizeLocation(result.location);
  if (result.farm) result.farm = sanitizeFarm(result.farm);
  return result;
};

// POST /api/listings
router.post(
  '/',
  protect,
  authorize(ROLES.FARMER),
  [
    body('crop.name').trim().notEmpty().withMessage('Crop name required'),
    body('crop.category').isIn(CROP_CATEGORIES).withMessage('Invalid crop category'),
    body('quantity.expected').isFloat({ min: 0.1 }).withMessage('Expected quantity must be > 0'),
    body('quantity.unit').isIn(UNITS).withMessage('Invalid unit'),
    body('pricePerUnit.expected').isFloat({ min: 0.01 }).withMessage('Price per unit must be greater than 0'),
    body('quality.grade').isIn(QUALITY_GRADES).withMessage('Invalid quality grade'),
    body('quality.certifications').optional().isArray().withMessage('Certifications must be a list'),
    body('quality.certifications.*').optional().isIn(QUALITY_CERTIFICATIONS).withMessage('Unsupported certification'),
    body('harvestDate.expected').isISO8601().withMessage('Valid harvest date required'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const listing = await ms.createListing(req.user._id, req.body, req);
    created(res, { listing }, 'Listing created');
  })
);

// POST /api/listings/:id/images — add up to five public crop photos to an owned listing.
router.post(
  '/:id/images',
  protect,
  authorize(ROLES.FARMER),
  uploadLimiter,
  uploadListingImages,
  asyncHandler(async (req, res) => {
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ success: false, message: 'Choose at least one crop photo' });
    if (files.some((file) => !validListingImage(file))) {
      return res.status(400).json({ success: false, message: 'A photo file has invalid image data' });
    }

    const listing = await CropListing.findOne({ _id: req.params.id, farmer: req.user._id });
    if (!listing) return notFound(res, 'Listing not found or not owned by you');
    if (listing.images.length + files.length > MAX_LISTING_IMAGES) {
      return res.status(400).json({ success: false, message: `A listing can have up to ${MAX_LISTING_IMAGES} photos` });
    }

    if (!config.storage.isRemote) await fs.mkdir(LISTING_IMAGE_DIR, { recursive: true });
    const savedFiles = [];
    try {
      const imagePaths = [];
      for (const file of files) {
        const fileName = `${crypto.randomUUID()}${LISTING_IMAGE_TYPES[file.mimetype]}`;
        if (config.storage.isRemote) {
          await objectStorage.putObject({ key: `listings/${fileName}`, body: file.buffer, contentType: file.mimetype });
          savedFiles.push({ fileName, remote: true });
        } else {
          await fs.writeFile(path.join(LISTING_IMAGE_DIR, fileName), file.buffer, { flag: 'wx' });
          savedFiles.push({ fileName, remote: false });
        }
        imagePaths.push(`/uploads/listings/${fileName}`);
      }
      listing.images.push(...imagePaths);
      await listing.save();
    } catch (error) {
      await Promise.all(savedFiles.map(({ fileName, remote }) => (
        remote
          ? objectStorage.deleteObject(`listings/${fileName}`).catch(() => undefined)
          : fs.unlink(path.join(LISTING_IMAGE_DIR, fileName)).catch(() => undefined)
      )));
      throw error;
    }

    success(res, { listing: publicListingView(listing) }, 'Listing photos uploaded');
  })
);

// GET /api/listings/mine
router.get(
  '/mine',
  protect,
  authorize(ROLES.FARMER),
  asyncHandler(async (req, res) => {
    const { listings, pagination } = await ms.getMyListings(req.user._id, req.query);
    paginated(res, { listings }, pagination);
  })
);

// GET /api/listings — public marketplace browse
router.get(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req.query);

    const filter = {
      status: LISTING_STATUS.ACTIVE,
      'quantity.available': { $gt: 0 },
      $and: [{ $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } },
      ] }],
    };

    if (req.query.crop) filter['crop.name'] = new RegExp(escapeRegExp(req.query.crop), 'i');
    if (req.query.category) filter['crop.category'] = req.query.category;
    if (req.query.grade) filter['quality.grade'] = req.query.grade;
    const minPrice = Number(req.query.minPrice);
    const maxPrice = Number(req.query.maxPrice);
    if (req.query.minPrice && Number.isFinite(minPrice) && minPrice >= 0) filter['pricePerUnit.expected'] = { $gte: minPrice };
    if (req.query.maxPrice && Number.isFinite(maxPrice) && maxPrice >= 0) {
      filter['pricePerUnit.expected'] = {
        ...(filter['pricePerUnit.expected'] || {}),
        $lte: maxPrice,
      };
    }
    if (req.query.state) filter['location.state'] = new RegExp(escapeRegExp(req.query.state), 'i');
    const nearLat = Number(req.query.nearLat);
    const nearLng = Number(req.query.nearLng);
    const radiusKm = Math.min(500, Math.max(1, Number(req.query.radiusKm) || 50));
    if (Number.isFinite(nearLat) && Number.isFinite(nearLng) && Math.abs(nearLat) <= 90 && Math.abs(nearLng) <= 180) {
      const nearbyFarms = await Farm.find({
        'location.coordinates': {
          $near: {
            $geometry: { type: 'Point', coordinates: [nearLng, nearLat] },
            $maxDistance: radiusKm * 1000,
          },
        },
      }).select('_id').limit(5000).lean();
      filter.farm = { $in: nearbyFarms.map((farm) => farm._id) };
    }
    if (req.query.search) {
      filter.$text = { $search: req.query.search };
    }

    const sort = req.query.sortBy === 'price_asc'
      ? { 'pricePerUnit.expected': 1 }
      : req.query.sortBy === 'price_desc'
      ? { 'pricePerUnit.expected': -1 }
      : req.query.sortBy === 'harvest'
      ? { 'harvestDate.expected': 1 }
      : { createdAt: -1 };

    const [listings, total] = await Promise.all([
      CropListing.find(filter)
        .populate('farmer', 'name')
        .populate('farm', 'farmName location avgRating isVerified')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      CropListing.countDocuments(filter),
    ]);

    paginated(res, { listings: listings.map(publicListingView) }, paginationMeta(page, limit, total));
  })
);

// GET /api/listings/:id
router.get(
  '/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const listing = await CropListing.findById(req.params.id)
      .populate('farmer', 'name')
      .populate('farm', 'farmName location avgRating totalOrdersCompleted isVerified');

    if (!listing) return notFound(res, 'Listing not found');

    const isOwner = req.user?.role === ROLES.FARMER && listing.farmer?._id?.toString() === req.user._id.toString();
    const isAdmin = req.user?.role === ROLES.ADMIN;
    const isPublic = listing.status === LISTING_STATUS.ACTIVE && (!listing.expiresAt || listing.expiresAt > new Date());
    if (!isPublic && !isOwner && !isAdmin) return notFound(res, 'Listing not found');

    // Do not inflate marketplace analytics with owner/admin previews.
    if (isPublic && !isOwner && !isAdmin) {
      listing.views += 1;
      await listing.save();
    }

    success(res, { listing: publicListingView(listing) });
  })
);

// PUT /api/listings/:id
router.put(
  '/:id',
  protect,
  authorize(ROLES.FARMER),
  asyncHandler(async (req, res) => {
    const listing = await ms.updateListing(req.params.id, req.user._id, req.body, req);
    success(res, { listing }, 'Listing updated');
  })
);

router.patch(
  '/:id/status',
  protect,
  authorize(ROLES.FARMER),
  [body('status').isIn(Object.values(LISTING_STATUS)).withMessage('Invalid listing status')],
  validate,
  asyncHandler(async (req, res) => {
    const listing = await ms.updateListingStatus(req.params.id, req.user._id, req.body.status, req);
    success(res, { listing }, 'Listing status updated');
  })
);

// POST /api/listings/:id/decay-flash — farmer activates Dutch Clock Price Decay for perishables
router.post(
  '/:id/decay-flash',
  protect,
  authorize(ROLES.FARMER),
  [
    body('floorPrice').isFloat({ min: 0.1 }).withMessage('Valid floor reserve price required'),
    body('decrementAmount').optional().isFloat({ min: 0.5 }).withMessage('Decrement amount must be >= 0.5'),
    body('intervalMinutes').optional().isInt({ min: 5, max: 180 }).withMessage('Interval must be between 5 and 180 minutes'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const listing = await CropListing.findOne({ _id: req.params.id, farmer: req.user._id });
    if (!listing) return notFound(res, 'Listing not found or not owned by you');

    if (listing.status !== LISTING_STATUS.ACTIVE || listing.quantity.available <= 0 ||
        (listing.expiresAt && listing.expiresAt <= new Date())) {
      return res.status(400).json({ success: false, message: 'Price decay can only be started on an active, unexpired listing with available stock' });
    }

    const startingPrice = listing.pricePerUnit.expected;
    const floorPrice = Number(req.body.floorPrice);
    if (floorPrice >= startingPrice) {
      return res.status(400).json({ success: false, message: 'Floor price must be lower than the current starting price' });
    }
    if (floorPrice < Number(listing.pricePerUnit.minimum || 0)) {
      return res.status(400).json({ success: false, message: 'Floor price cannot be lower than your listing minimum price' });
    }

    const intervalMinutes = Number(req.body.intervalMinutes) || 30;
    const decrementAmount = Number(req.body.decrementAmount) || 2;
    const now = new Date();
    const nextDropAt = new Date(now.getTime() + intervalMinutes * 60 * 1000);

    listing.priceDecay = {
      enabled: true,
      startingPrice,
      currentPrice: startingPrice,
      floorPrice,
      decrementAmount,
      intervalMinutes,
      startTime: now,
      nextDropAt,
      isPerishable: true,
      urgencyReason: req.body.urgencyReason || 'Fresh perishable harvest - Dutch price decay active',
    };

    await listing.save();
    success(res, { listing: publicListingView(listing) }, 'Dutch Clock Flash Sale activated successfully');
  })
);

// POST /api/listings/:id/decay-flash/stop — farmer stops Dutch Clock Price Decay
router.post(
  '/:id/decay-flash/stop',
  protect,
  authorize(ROLES.FARMER),
  asyncHandler(async (req, res) => {
    const listing = await CropListing.findOne({ _id: req.params.id, farmer: req.user._id });
    if (!listing) return notFound(res, 'Listing not found or not owned by you');

    if (listing.priceDecay) {
      listing.priceDecay.enabled = false;
      await listing.save();
    }

    success(res, { listing: publicListingView(listing) }, 'Dutch Clock Flash Sale deactivated');
  })
);

module.exports = router;
