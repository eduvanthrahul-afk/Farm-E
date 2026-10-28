'use strict';

const express = require('express');
const { query } = require('express-validator');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/apiResponse');
const { reverseGeocode } = require('../services/geocoding.service');

router.get('/reverse', protect, [
  query('lat').isFloat({ min: -90, max: 90 }).withMessage('Latitude must be between -90 and 90'),
  query('lng').isFloat({ min: -180, max: 180 }).withMessage('Longitude must be between -180 and 180'),
], validate, asyncHandler(async (req, res) => {
  const location = await reverseGeocode(Number(req.query.lat), Number(req.query.lng));
  success(res, { location }, 'Location details found');
}));

module.exports = router;
