'use strict';

const mongoose = require('mongoose');
const { AUDIT_ACTIONS } = require('../config/constants');

const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    actorRole: { type: String, required: true },
    action: { type: String, enum: Object.values(AUDIT_ACTIONS), required: true },
    resource: {
      model: { type: String, required: true },
      id: { type: mongoose.Schema.Types.ObjectId },
    },
    before: { type: mongoose.Schema.Types.Mixed },
    after: { type: mongoose.Schema.Types.Mixed },
    ip: { type: String },
    userAgent: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  {
    timestamps: true,
    // Audit logs are immutable — disable updates
    statics: {
      noUpdate: true,
    },
  }
);

auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ 'resource.model': 1, 'resource.id': 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
