'use strict';

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { body, param } = require('express-validator');
const router = express.Router();

const ms = require('../services/marketplace.service');
const { protect } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { validate } = require('../middleware/validate.middleware');
const { success, created, notFound, paginated } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const Order = require('../models/Order');
const Farm = require('../models/Farm');
const User = require('../models/User');
const { ORDER_STATUS, ROLES } = require('../config/constants');
const config = require('../config/env');
const objectStorage = require('../services/objectStorage.service');
const { parsePagination, paginationMeta } = require('../utils/pagination');
const { sanitizeLocation } = require('../utils/locationPrivacy');
const { uploadLimiter } = require('../middleware/rateLimit.middleware');
const { getDrivingRoute } = require('../services/routing.service');
const { SIGNATURE_SCHEME, verifyManifest, fingerprintManifest } = require('../services/traceability.service');

const EVIDENCE_DIR = path.join(__dirname, '../../private/order-evidence');
const MAX_EVIDENCE_FILE_BYTES = 5 * 1024 * 1024;
const EVIDENCE_MIME_EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};
const evidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_EVIDENCE_FILE_BYTES, files: 5 },
  fileFilter: (req, file, callback) => {
    if (EVIDENCE_MIME_EXTENSIONS[file.mimetype]) return callback(null, true);
    const error = new Error('Evidence must be a JPEG, PNG, WebP image, or PDF');
    error.statusCode = 400;
    callback(error);
  },
});

const fileSignatureMatches = (file) => {
  const bytes = file.buffer;
  if (file.mimetype === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (file.mimetype === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (file.mimetype === 'image/webp') return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (file.mimetype === 'application/pdf') return bytes.toString('ascii', 0, 5) === '%PDF-';
  return false;
};

const isOrderParticipant = (order, user) =>
  order.farmer.toString() === user._id.toString() ||
  order.buyer.toString() === user._id.toString() ||
  user.role === ROLES.ADMIN;

const safeOriginalName = (name) => path.basename(name).replace(/[\r\n"\\]/g, '_').slice(0, 180) || 'evidence';

// GET /api/orders/trace/:batchNumber — Public Farm-to-Fork traceability passport
router.get(
  '/trace/:batchNumber',
  asyncHandler(async (req, res) => {
    const { batchNumber } = req.params;
    const order = await Order.findOne({ 'traceability.batchNumber': batchNumber })
      .populate('farmer', 'name')
      .populate('listing', 'crop images harvestDate storage');
    if (!order) return notFound(res, 'Batch traceability record not found');

    const authenticity = order.traceability?.authenticity;
    const manifest = authenticity?.manifest;
    const hasAuthenticationRecord = Boolean(manifest || authenticity?.signature);
    const signatureValid = Boolean(
      manifest &&
      authenticity?.signature &&
      authenticity.scheme === SIGNATURE_SCHEME &&
      manifest.batchNumber === order.traceability?.batchNumber &&
      manifest.orderNumber === order.orderNumber &&
      manifest.version === 1 &&
      verifyManifest(manifest, authenticity.signature)
    );
    const verificationStatus = hasAuthenticationRecord
      ? (signatureValid ? 'verified' : 'invalid')
      : 'legacy_unverified';

    const farm = manifest
      ? null
      : await Farm.findOne({ farmer: order.farmer._id }).select('farmName location certifications isVerified').lean();

    const traceData = {
      batchNumber: order.traceability?.batchNumber,
      orderNumber: order.orderNumber,
      crop: manifest?.crop || order.crop,
      quantity: {
        expected: manifest?.quantity?.expected ?? order.quantity?.expected,
        actual: order.quantity?.actual,
        unit: manifest?.quantity?.unit || order.quantity?.unit,
        weightVerified: order.quantity?.weightVerified,
      },
      status: order.status,
      packingDate: manifest?.packingDate || order.traceability?.packingDate || order.createdAt,
      farm: manifest?.farm || {
        name: farm?.farmName || `${order.farmer.name}'s Farm`,
        location: sanitizeLocation(farm?.location || null),
        certifications: farm?.certifications || [],
        farmReview: farm?.isVerified ? 'verified' : 'not_verified',
      },
      farmerName: manifest?.farmerName || order.farmer.name,
      harvestDate: manifest?.harvestDate || order.traceability?.harvestDate || order.listing?.harvestDate || order.createdAt,
      issuedAt: manifest?.issuedAt || null,
      verificationStatus,
      signatureScheme: authenticity?.scheme || null,
      verifiedWeight: order.quantity?.weightVerified ? order.quantity.actual : null,
      createdAt: order.createdAt,
    };
    if (manifest) traceData.recordFingerprint = fingerprintManifest(manifest);

    success(res, { trace: traceData }, 'Batch traceability retrieved successfully');
  })
);

// POST /api/orders — buy directly from listing
router.post(
  '/',
  protect,
  authorize(ROLES.BUYER),
  [
    body('listingId').isMongoId().withMessage('Valid listing ID required'),
    body('quantity').isFloat({ min: 0.1 }).withMessage('Quantity required'),
    body('deliveryLocation.address').trim().notEmpty().withMessage('Delivery address required'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { order, contract } = await ms.createOrderFromListing(
      req.user._id,
      req.body.listingId,
      req.body.quantity,
      req.body.deliveryLocation,
      req
    );
    const { success: s } = require('../utils/apiResponse');
    s(res, { order, contract }, 'Order created', 201);
  })
);

// GET /api/orders/mine
router.get(
  '/mine',
  protect,
  authorize(ROLES.FARMER, ROLES.BUYER),
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req.query);
    const userId = req.user._id;
    const role = req.user.role;

    const filter = role === 'FARMER' ? { farmer: userId } : { buyer: userId };
    if (req.query.status) filter.status = req.query.status;
    const search = String(req.query.search || '').trim().slice(0, 80);
    if (search) {
      const expression = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const counterpartRole = role === 'FARMER' ? 'BUYER' : 'FARMER';
      const counterpartIds = await User.find({ role: counterpartRole, name: expression }).distinct('_id');
      filter.$or = [
        { orderNumber: expression },
        { 'crop.name': expression },
        { [role === 'FARMER' ? 'buyer' : 'farmer']: { $in: counterpartIds } },
      ];
    }

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate('farmer', 'name phone')
        .populate('buyer', 'name phone')
        .populate('listing', 'crop images')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Order.countDocuments(filter),
    ]);

    paginated(res, { orders }, paginationMeta(page, limit, total));
  })
);

// GET /api/orders/:id
router.get(
  '/:id/route',
  protect,
  param('id').isMongoId().withMessage('Valid order ID required'),
  validate,
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id).select('farmer buyer deliveryLocation');
    if (!order) return notFound(res, 'Order not found');
    if (!isOrderParticipant(order, req.user)) return notFound(res, 'Order not found');

    const farm = await Farm.findOne({ farmer: order.farmer }).select('location.coordinates').lean();
    const route = farm?.location?.coordinates?.coordinates && order.deliveryLocation?.coordinates?.coordinates
      ? await getDrivingRoute(
        farm.location.coordinates.coordinates,
        order.deliveryLocation.coordinates.coordinates
      )
      : null;
    success(res, { route }, route ? 'Driving route found' : 'Driving route is unavailable');
  })
);

router.get(
  '/:id',
  protect,
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id)
      .populate('farmer', 'name phone email')
      .populate('buyer', 'name phone email')
      .populate('listing', 'crop images pricePerUnit')
      .populate('bid')
      .populate('contract')
      .populate('evidence.addedBy', 'name role');

    if (!order) return notFound(res, 'Order not found');

    const isFarmer = order.farmer._id.toString() === req.user._id.toString();
    const isBuyer = order.buyer._id.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'ADMIN';

    if (!isFarmer && !isBuyer && !isAdmin) return notFound(res, 'Order not found');

    const farm = await Farm.findOne({ farmer: order.farmer._id }).select('farmName location').lean();
    const orderView = order.toObject();
    orderView.farmLocation = farm?.location || null;
    success(res, { order: orderView });
  })
);

// POST /api/orders/:id/evidence — private delivery/weight evidence shared with order participants.
router.post(
  '/:id/evidence',
  protect,
  authorize(ROLES.FARMER, ROLES.BUYER),
  param('id').isMongoId().withMessage('Valid order ID required'),
  validate,
  uploadLimiter,
  evidenceUpload.array('files', 5),
  asyncHandler(async (req, res) => {
    if (!req.files?.length) {
      return res.status(400).json({ success: false, message: 'Choose at least one supported photo or PDF file' });
    }
    if (req.files.some((file) => !fileSignatureMatches(file))) {
      return res.status(400).json({ success: false, message: 'One or more files do not match their declared file type' });
    }
    const category = String(req.body.category || 'OTHER');
    if (!['DELIVERY_PHOTO', 'WEIGHT_RECORD', 'OTHER'].includes(category)) {
      return res.status(400).json({ success: false, message: 'Invalid evidence category' });
    }
    const description = String(req.body.description || '').trim().slice(0, 300);
    const order = await Order.findById(req.params.id);
    if (!order) return notFound(res, 'Order not found');
    if (!isOrderParticipant(order, req.user)) return notFound(res, 'Order not found');
    if (order.status === ORDER_STATUS.CANCELLED) {
      return res.status(400).json({ success: false, message: 'Evidence cannot be added to a cancelled order' });
    }

    if (config.storage.provider !== 'r2') await fs.promises.mkdir(EVIDENCE_DIR, { recursive: true });
    const savedNames = [];
    try {
      for (const file of req.files) {
        const fileName = `${crypto.randomUUID()}${EVIDENCE_MIME_EXTENSIONS[file.mimetype]}`;
        if (config.storage.provider === 'r2') {
          await objectStorage.putObject({ key: `order-evidence/${fileName}`, body: file.buffer, contentType: file.mimetype });
        } else {
          await fs.promises.writeFile(path.join(EVIDENCE_DIR, fileName), file.buffer, { flag: 'wx' });
        }
        savedNames.push(fileName);
        order.evidence.push({
          fileName,
          originalName: safeOriginalName(file.originalname),
          mimeType: file.mimetype,
          size: file.size,
          category,
          description,
          addedBy: req.user._id,
        });
      }
      await order.save();
    } catch (error) {
      await Promise.all(savedNames.map((fileName) => (
        config.storage.provider === 'r2'
          ? objectStorage.deleteObject(`order-evidence/${fileName}`).catch(() => undefined)
          : fs.promises.unlink(path.join(EVIDENCE_DIR, fileName)).catch(() => undefined)
      )));
      throw error;
    }
    const populated = await order.populate('evidence.addedBy', 'name role');
    created(res, { evidence: populated.evidence }, 'Order evidence uploaded');
  })
);

// GET /api/orders/:id/evidence/:evidenceId/file — authorization is checked on every download.
router.get(
  '/:id/evidence/:evidenceId/file',
  protect,
  [param('id').isMongoId(), param('evidenceId').isMongoId()],
  validate,
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order || !isOrderParticipant(order, req.user)) return notFound(res, 'Evidence not found');
    const evidence = order.evidence.id(req.params.evidenceId);
    if (!evidence) return notFound(res, 'Evidence not found');
    if (config.storage.provider === 'r2') {
      let object;
      try {
        object = await objectStorage.getObject(`order-evidence/${path.basename(evidence.fileName)}`);
      } catch (storageError) {
        if (storageError.name === 'NoSuchKey' || storageError.$metadata?.httpStatusCode === 404) {
          return notFound(res, 'Evidence file not found');
        }
        throw storageError;
      }
      res.attachment(evidence.originalName);
      res.set('Content-Type', evidence.mimeType);
      res.set('X-Content-Type-Options', 'nosniff');
      object.Body.on('error', (streamError) => {
        if (!res.headersSent) return next(streamError);
        res.destroy(streamError);
      });
      object.Body.pipe(res);
      return;
    }
    const filePath = path.join(EVIDENCE_DIR, path.basename(evidence.fileName));
    res.set('Content-Type', evidence.mimeType);
    res.set('X-Content-Type-Options', 'nosniff');
    res.download(filePath, evidence.originalName, (error) => {
      if (error && !res.headersSent) res.status(error.code === 'ENOENT' ? 404 : 500).end();
    });
  })
);

// PATCH /api/orders/:id/status
router.patch(
  '/:id/status',
  protect,
  [
    body('status').isIn(Object.values(ORDER_STATUS)).withMessage('Invalid status'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const order = await ms.updateOrderStatus(
      req.user._id,
      req.user.role,
      req.params.id,
      req.body.status,
      req.body.note,
      req
    );
    success(res, { order }, 'Order status updated');
  })
);

// PATCH /api/orders/:id/verify-weight
router.patch(
  '/:id/verify-weight',
  protect,
  [body('actualQuantity').isFloat({ min: 0.01 }).withMessage('Actual quantity required')],
  validate,
  asyncHandler(async (req, res) => {
    const order = await ms.verifyWeight(req.user._id, req.params.id, req.body.actualQuantity, req);
    success(res, { order }, 'Weight verified — final amount calculated');
  })
);

// GET /api/orders/:id/contract
router.get(
  '/:id/contract',
  protect,
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id).populate('contract');
    if (!order) return notFound(res, 'Order not found');

    const isFarmer = order.farmer.toString() === req.user._id.toString();
    const isBuyer = order.buyer.toString() === req.user._id.toString();
    if (!isFarmer && !isBuyer && req.user.role !== 'ADMIN') return notFound(res, 'Not authorized');

    success(res, { contract: order.contract });
  })
);

module.exports = router;
