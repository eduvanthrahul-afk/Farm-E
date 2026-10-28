'use strict';

const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const { protect } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { validate } = require('../middleware/validate.middleware');
const { success, created, notFound, paginated } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const Review = require('../models/Review');
const Order = require('../models/Order');
const Farm = require('../models/Farm');
const { ORDER_STATUS } = require('../config/constants');

// POST /api/reviews
router.post(
  '/',
  protect,
  [
    body('orderId').isMongoId().withMessage('Valid order ID required'),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1-5'),
    body('comment').optional().trim().isLength({ max: 2000 }),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { orderId, rating, comment, tags } = req.body;

    const order = await Order.findById(orderId);
    if (!order) return notFound(res, 'Order not found');

    if (order.status !== ORDER_STATUS.COMPLETED && order.status !== ORDER_STATUS.PAYMENT_SETTLED) {
      const err = new Error('Can only review completed orders');
      err.statusCode = 400;
      throw err;
    }

    const isFarmer = order.farmer.toString() === req.user._id.toString();
    const isBuyer = order.buyer.toString() === req.user._id.toString();

    if (!isFarmer && !isBuyer) {
      const err = new Error('Not part of this order');
      err.statusCode = 403;
      throw err;
    }

    if (await Review.exists({ order: orderId, reviewer: req.user._id })) {
      const err = new Error('You have already reviewed this order');
      err.statusCode = 409;
      throw err;
    }

    const reviewee = isBuyer ? order.farmer : order.buyer;
    const role = isBuyer ? 'BUYER_REVIEWING_FARMER' : 'FARMER_REVIEWING_BUYER';

    let review;
    try {
      review = await Review.create({
        order: orderId,
        reviewer: req.user._id,
        reviewee,
        role,
        rating,
        comment,
        tags: Array.isArray(tags) ? tags.filter((tag) => typeof tag === 'string').slice(0, 20) : [],
      });
    } catch (error) {
      if (error.code === 11000) {
        error.statusCode = 409;
        error.message = 'You have already reviewed this order';
      }
      throw error;
    }

    // Update farm avgRating if buyer reviewed farmer
    if (isBuyer) {
      const reviews = await Review.find({ reviewee: order.farmer, role: 'BUYER_REVIEWING_FARMER' });
      const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
      await Farm.findOneAndUpdate(
        { farmer: order.farmer },
        { avgRating: Math.round(avg * 10) / 10, totalReviews: reviews.length }
      );
    }

    created(res, { review }, 'Review submitted');
  })
);

// GET /api/reviews/user/:userId
router.get(
  '/user/:userId',
  protect,
  asyncHandler(async (req, res) => {
    const reviews = await Review.find({ reviewee: req.params.userId })
      .populate('reviewer', 'name avatar')
      .populate('order', 'orderNumber crop')
      .sort({ createdAt: -1 });

    const avgRating =
      reviews.length > 0
        ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10
        : 0;

    success(res, { reviews, avgRating, total: reviews.length });
  })
);

module.exports = router;
