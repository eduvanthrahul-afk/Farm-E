'use strict';

const sanitizeLocation = (location, { includeExact = false } = {}) => {
  if (!location) return location;
  const safe = { ...location };
  if (includeExact) return safe;

  delete safe.address;
  delete safe.village;
  delete safe.pincode;
  const coordinates = safe.coordinates?.coordinates;
  if (Array.isArray(coordinates) && coordinates.length === 2 && coordinates.some((value) => Number(value) !== 0)) {
    safe.coordinates = {
      ...safe.coordinates,
      coordinates: coordinates.map((value) => Math.round(Number(value) * 100) / 100),
    };
  } else {
    delete safe.coordinates;
  }
  return safe;
};

const sanitizeFarm = (farm, { includeExact = false, includePrivate = false } = {}) => {
  if (!farm) return farm;
  const safe = typeof farm.toObject === 'function' ? farm.toObject() : { ...farm };
  if (!includePrivate) {
    delete safe.bankDetails;
    if (safe.farmer) {
      delete safe.farmer.email;
      delete safe.farmer.phone;
    }
  }
  if (safe.location) safe.location = sanitizeLocation(safe.location, { includeExact });
  return safe;
};

module.exports = { sanitizeLocation, sanitizeFarm };
