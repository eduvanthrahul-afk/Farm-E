'use strict';

const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

/**
 * Write an audit log entry — never throws (fire-and-forget safety)
 */
const log = async ({ actor, actorRole, action, resource, before, after, req, metadata } = {}) => {
  try {
    await AuditLog.create({
      actor,
      actorRole,
      action,
      resource,
      before,
      after,
      ip: req?.ip,
      userAgent: req?.headers?.['user-agent'],
      metadata,
    });
  } catch (err) {
    logger.error('Audit log write failed:', err.message);
  }
};

module.exports = { log };
