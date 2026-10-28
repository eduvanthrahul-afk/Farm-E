'use strict';

const { forbidden } = require('../utils/apiResponse');

/**
 * Restrict access to specified roles
 * Usage: authorize(ROLES.ADMIN, ROLES.FARMER)
 */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return forbidden(res, 'Not authenticated');
  if (!roles.includes(req.user.role)) {
    return forbidden(res, `Role '${req.user.role}' is not allowed to access this resource`);
  }
  next();
};

module.exports = { authorize };
