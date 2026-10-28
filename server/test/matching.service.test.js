'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { computeMatchScore } = require('../src/services/matching.service');

const day = (offset) => {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offset);
  return date;
};

const requirement = (overrides = {}) => ({
  crop: { name: 'Tomato', variety: '', category: 'Vegetables' },
  quantity: { required: 100, unit: 'kg', flexibility: '±10%' },
  priceTarget: { max: 50 },
  quality: {},
  deliveryDate: { required: day(10), flexible: false },
  deliveryLocation: { coordinates: { coordinates: [73.8567, 18.5204] } },
  ...overrides,
});

const listing = (overrides = {}) => ({
  crop: { name: 'Tomato', variety: '', category: 'Vegetables' },
  quantity: { expected: 100, available: 100, unit: 'kg' },
  pricePerUnit: { expected: 40 },
  quality: { grade: 'A', certifications: [] },
  harvestDate: { expected: day(5) },
  location: { coordinates: { coordinates: [73.7898, 19.9975] } },
  ...overrides,
});

const breakdownFor = (req, item) => computeMatchScore(req, item).breakdown;

test('normalizes kg, quintal, and ton when comparing quantity and unit price', () => {
  const result = breakdownFor(
    requirement({ quantity: { required: 1000, unit: 'kg', flexibility: 'EXACT' }, priceTarget: { max: 50 } }),
    listing({ quantity: { expected: 1, available: 1, unit: 'ton' }, pricePerUnit: { expected: 40000 } })
  );
  assert.equal(result.quantity.score, 100);
  assert.equal(result.price.score, 100);
});

test('does not compare unrelated units such as boxes and kilograms', () => {
  const result = breakdownFor(
    requirement({ quantity: { required: 10, unit: 'kg', flexibility: 'FLEXIBLE' } }),
    listing({ quantity: { expected: 10, available: 10, unit: 'box' } })
  );
  assert.equal(result.quantity.score, 0);
  assert.match(result.quantity.reason, /not convertible/i);
});

test('treats the buyer maximum price as a hard limit', () => {
  const underBudget = computeMatchScore(
    requirement({ priceTarget: { max: 50 } }),
    listing({ pricePerUnit: { expected: 50 } })
  );
  const overBudget = computeMatchScore(
    requirement({ priceTarget: { max: 50 } }),
    listing({ pricePerUnit: { expected: 50.01 } })
  );

  assert.equal(underBudget.eligible, true);
  assert.equal(underBudget.breakdown.price.score, 85);
  assert.equal(overBudget.eligible, false);
  assert.equal(overBudget.breakdown.price.score, 0);
  assert.match(overBudget.breakdown.price.reason, /exceeds.*maximum/i);
});

test('rejects a different category when the crop name is the same', () => {
  const match = computeMatchScore(
    requirement({ crop: { name: 'Apple', category: 'Fruits' } }),
    listing({ crop: { name: 'Apple', category: 'Vegetables' } })
  );

  assert.equal(match.eligible, false);
  assert.equal(match.breakdown.crop.score, 0);
  assert.match(match.breakdown.crop.reason, /category mismatch/i);
});

test('applies exact and percentage quantity tolerance instead of ignoring the requirement setting', () => {
  const item = listing({ quantity: { expected: 85, available: 85, unit: 'kg' } });
  assert.equal(breakdownFor(requirement({ quantity: { required: 100, unit: 'kg', flexibility: 'EXACT' } }), item).quantity.score, 0);
  assert.match(breakdownFor(requirement({ quantity: { required: 100, unit: 'kg', flexibility: '±20%' } }), item).quantity.reason, /tolerance/i);
  const strictMatch = computeMatchScore(requirement({ quantity: { required: 100, unit: 'kg', flexibility: '±10%' } }), item);
  assert.equal(strictMatch.eligible, false);
  assert.equal(strictMatch.score, 0);
  assert.match(strictMatch.breakdown.quantity.reason, /below.*tolerance/i);
});

test('requires a requested certification and does not rank Organic as a grade above Premium', () => {
  const organicRequirement = requirement({ quality: { certifications: ['Organic'] } });
  const certifiedListing = listing({ quality: { grade: 'Premium', certifications: ['Organic'] } });
  const uncertifiedListing = listing({ quality: { grade: 'Premium', certifications: [] } });
  const certifiedMatch = computeMatchScore(organicRequirement, certifiedListing);
  const uncertifiedMatch = computeMatchScore(organicRequirement, uncertifiedListing);
  assert.equal(certifiedMatch.breakdown.quality.score, 100);
  assert.equal(certifiedMatch.eligible, true);
  assert.equal(uncertifiedMatch.breakdown.quality.score, 0);
  assert.equal(uncertifiedMatch.eligible, false);

  const legacyOrganicListing = listing({ quality: { grade: 'Organic', certifications: [] } });
  const premiumRequirement = requirement({ quality: { grade: 'Premium' } });
  assert.equal(breakdownFor(premiumRequirement, legacyOrganicListing).quality.score, 60);
});

test('only allows late harvest dates when the buyer marks delivery as flexible', () => {
  const item = listing({ harvestDate: { expected: day(12) } });
  assert.equal(breakdownFor(requirement({ deliveryDate: { required: day(10), flexible: false } }), item).date.score, 0);
  assert.equal(breakdownFor(requirement({ deliveryDate: { required: day(10), flexible: true } }), item).date.score, 60);
});

test('rejects past harvest dates regardless of delivery flexibility', () => {
  const result = breakdownFor(
    requirement({ deliveryDate: { required: day(10), flexible: true } }),
    listing({ harvestDate: { expected: day(-1) } })
  );
  assert.equal(result.date.score, 0);
  assert.match(result.date.reason, /passed/i);
});
