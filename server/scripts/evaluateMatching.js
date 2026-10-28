'use strict';

const { computeMatchScore } = require('../src/services/matching.service');

const future = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);
const makeRequirement = (values = {}) => ({
  crop: { name: 'Tomato', variety: '', category: 'Vegetables' },
  quantity: { required: 100, unit: 'kg', flexibility: '±10%' },
  priceTarget: { max: 50 },
  quality: {},
  deliveryDate: { required: future(10), flexible: false },
  deliveryLocation: { coordinates: { coordinates: [73.8567, 18.5204] } },
  ...values,
});
const makeListing = (name, values = {}) => ({
  id: name,
  crop: { name: 'Tomato', variety: '', category: 'Vegetables' },
  quantity: { expected: 100, available: 100, unit: 'kg' },
  pricePerUnit: { expected: 40 },
  quality: { grade: 'A', certifications: [] },
  harvestDate: { expected: future(5) },
  location: { coordinates: { coordinates: [73.7898, 19.9975] } },
  ...values,
});

// These synthetic labels are deliberately small and transparent. They are a
// smoke evaluation set, not evidence of real-world marketplace performance.
const scenarios = [
  {
    name: 'tomato procurement with ±10% quantity tolerance',
    requirement: makeRequirement(),
    listings: [
      { relevant: true, listing: makeListing('tomato-100kg', { quantity: { expected: 100, available: 100, unit: 'kg' } }) },
      { relevant: true, listing: makeListing('tomato-90kg', { quantity: { expected: 90, available: 90, unit: 'kg' }, pricePerUnit: { expected: 45 } }) },
      { relevant: false, listing: makeListing('tomato-over-budget', { pricePerUnit: { expected: 75 } }) },
      { relevant: false, listing: makeListing('potato', { crop: { name: 'Potato', variety: '', category: 'Vegetables' } }) },
    ],
  },
  {
    name: 'organic certification requirement',
    requirement: makeRequirement({ quality: { certifications: ['Organic'] } }),
    listings: [
      { relevant: true, listing: makeListing('organic-tomato', { quality: { grade: 'A', certifications: ['Organic'] } }) },
      { relevant: false, listing: makeListing('conventional-tomato', { quality: { grade: 'A', certifications: [] }, pricePerUnit: { expected: 30 } }) },
      { relevant: false, listing: makeListing('low-quantity-organic', { quantity: { expected: 20, available: 20, unit: 'kg' }, quality: { grade: 'A', certifications: ['Organic'] } }) },
      { relevant: false, listing: makeListing('organic-potato', { crop: { name: 'Potato', variety: '', category: 'Vegetables' }, quality: { grade: 'A', certifications: ['Organic'] } }) },
    ],
  },
  {
    name: 'mass conversion and flexible bulk delivery',
    requirement: makeRequirement({ quantity: { required: 1000, unit: 'kg', flexibility: '±20%' } }),
    listings: [
      { relevant: true, listing: makeListing('tomato-1-ton', { quantity: { expected: 1, available: 1, unit: 'ton' }, pricePerUnit: { expected: 40000 } }) },
      { relevant: true, listing: makeListing('tomato-800kg', { quantity: { expected: 800, available: 800, unit: 'kg' } }) },
      { relevant: false, listing: makeListing('tomato-700kg', { quantity: { expected: 700, available: 700, unit: 'kg' } }) },
      { relevant: false, listing: makeListing('tomato-boxes', { quantity: { expected: 100, available: 100, unit: 'box' } }) },
    ],
  },
];

const topK = 3;
const results = scenarios.map(({ name, requirement, listings }) => {
  const ranked = listings
    .map(({ listing, relevant }) => ({ id: listing.id, relevant, ...computeMatchScore(requirement, listing) }))
    .filter((item) => item.eligible)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  const top = ranked.slice(0, topK);
  const firstRelevantIndex = ranked.findIndex((item) => item.relevant);
  return {
    name,
    eligibleCount: ranked.length,
    topKPrecision: top.filter((item) => item.relevant).length / Math.max(1, top.length),
    reciprocalRank: firstRelevantIndex < 0 ? 0 : 1 / (firstRelevantIndex + 1),
    top: top.map(({ id, score, relevant }) => ({ id, score, relevant })),
  };
});

const mean = (field) => results.reduce((sum, result) => sum + result[field], 0) / results.length;
const report = {
  label: 'synthetic smoke evaluation; hand-labeled cases; not real-world accuracy',
  scenarios: results,
  summary: {
    scenarioCount: results.length,
    precisionAt3: Number(mean('topKPrecision').toFixed(3)),
    meanReciprocalRank: Number(mean('reciprocalRank').toFixed(3)),
  },
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
