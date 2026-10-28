'use strict';

/**
 * Parse and normalise pagination params from query string
 */
const parsePagination = (query, defaults = {}) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(
    parseInt(query.limit, 10) || defaults.limit || 20,
    defaults.maxLimit || 100
  );
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

/**
 * Build a standard pagination metadata object
 */
const paginationMeta = (page, limit, total) => ({
  page,
  limit,
  total,
  pages: Math.ceil(total / limit),
  hasNext: page * limit < total,
  hasPrev: page > 1,
});

module.exports = { parsePagination, paginationMeta };
