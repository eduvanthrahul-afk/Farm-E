'use strict';

const { validationResult } = require('express-validator');
const { validationError } = require('../utils/apiResponse');

/**
 * Run after express-validator checks — return 422 if any errors
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formatted = errors.array().map((e) => ({
      field: e.path,
      message: e.msg,
    }));
    return validationError(res, formatted);
  }
  next();
};

module.exports = { validate };
