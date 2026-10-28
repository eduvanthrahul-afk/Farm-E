'use strict';

/**
 * Standardised API response helpers
 */

const success = (res, data = {}, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

const created = (res, data = {}, message = 'Created successfully') => {
  return success(res, data, message, 201);
};

const paginated = (res, data, pagination, message = 'Success') => {
  return res.status(200).json({
    success: true,
    message,
    data,
    pagination,
  });
};

const error = (res, message = 'Something went wrong', statusCode = 500, errors = null) => {
  const body = { success: false, message };
  if (errors) body.errors = errors;
  return res.status(statusCode).json(body);
};

const notFound = (res, message = 'Resource not found') => error(res, message, 404);

const unauthorized = (res, message = 'Unauthorized') => error(res, message, 401);

const forbidden = (res, message = 'Forbidden') => error(res, message, 403);

const validationError = (res, errors, message = 'Validation failed') =>
  error(res, message, 422, errors);

/**
 * Build a pagination meta object
 */
const buildPagination = (page, limit, total) => ({
  page: parseInt(page, 10),
  limit: parseInt(limit, 10),
  total,
  pages: Math.ceil(total / limit),
});

module.exports = {
  success,
  created,
  paginated,
  error,
  notFound,
  unauthorized,
  forbidden,
  validationError,
  buildPagination,
};
