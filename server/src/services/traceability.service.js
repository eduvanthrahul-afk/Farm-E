'use strict';

const crypto = require('crypto');
const config = require('../config/env');
const { sanitizeLocation } = require('../utils/locationPrivacy');

const SIGNATURE_SCHEME = 'HMAC-SHA256';

const sortKeys = (value) => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((sorted, key) => {
      if (value[key] !== undefined) sorted[key] = sortKeys(value[key]);
      return sorted;
    }, {});
  }
  return value;
};

const canonicalizeManifest = (manifest) => JSON.stringify(sortKeys(manifest));

const signingSecret = () => {
  if (!config.traceSigningSecret) {
    throw new Error('TRACE_SIGNING_SECRET or JWT_REFRESH_SECRET must be configured to issue batch records');
  }
  return config.traceSigningSecret;
};

const signManifest = (manifest) => crypto
  .createHmac('sha256', signingSecret())
  .update(canonicalizeManifest(manifest))
  .digest('hex');

const verifyManifest = (manifest, signature) => {
  if (!manifest || typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  try {
    const expected = Buffer.from(signManifest(manifest), 'hex');
    const received = Buffer.from(signature, 'hex');
    return expected.length === received.length && crypto.timingSafeEqual(expected, received);
  } catch {
    return false;
  }
};

const dateString = (value) => value ? new Date(value).toISOString() : null;

const createBatchAuthenticity = ({ orderNumber, crop, quantity, farm, farmerName, harvestDate, issuedAt = new Date() }) => {
  const issuedDate = new Date(issuedAt);
  const location = sanitizeLocation(
    typeof farm?.location?.toObject === 'function' ? farm.location.toObject() : farm?.location || null
  );
  const manifest = {
    version: 1,
    batchNumber: `BATCH-${orderNumber}`,
    orderNumber,
    issuedAt: issuedDate.toISOString(),
    crop: {
      name: crop?.name || 'Unspecified crop',
      variety: crop?.variety || null,
      category: crop?.category || null,
      grade: crop?.grade || null,
    },
    quantity: {
      expected: Number(quantity?.expected),
      unit: quantity?.unit || null,
    },
    farm: {
      name: farm?.farmName || 'Farm name not provided',
      location: location ? {
        district: location.district || null,
        state: location.state || null,
        coordinates: location.coordinates?.coordinates || null,
      } : null,
      farmReview: farm?.isVerified ? 'verified' : 'not_verified',
      listedCertifications: Array.isArray(farm?.certifications) ? [...farm.certifications] : [],
    },
    farmerName: farmerName || 'Farmer name not provided',
    harvestDate: dateString(harvestDate),
    packingDate: issuedDate.toISOString(),
  };

  return {
    manifest,
    signature: signManifest(manifest),
    scheme: SIGNATURE_SCHEME,
  };
};

const fingerprintManifest = (manifest) => crypto
  .createHash('sha256')
  .update(canonicalizeManifest(manifest))
  .digest('hex');

module.exports = {
  SIGNATURE_SCHEME,
  createBatchAuthenticity,
  verifyManifest,
  fingerprintManifest,
};
