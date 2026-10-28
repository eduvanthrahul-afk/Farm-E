'use strict';

const User = require('../src/models/User');
const Farm = require('../src/models/Farm');
const CropListing = require('../src/models/CropListing');
const BuyerRequirement = require('../src/models/BuyerRequirement');
const Bid = require('../src/models/Bid');
const {
  ROLES,
  LISTING_STATUS,
  REQUIREMENT_STATUS,
  BID_STATUS,
} = require('../src/config/constants');

const DEMO_ACCOUNTS = [
  { key: 'farmer', name: 'Anand Patil', email: 'farmer@farm-e.local', phone: '9876500001', role: ROLES.FARMER },
  { key: 'farmerTwo', name: 'Kavita Jadhav', email: 'farmer2@farm-e.local', phone: '9876500002', role: ROLES.FARMER },
  { key: 'farmerThree', name: 'Suresh Pawar', email: 'farmer3@farm-e.local', phone: '9876500005', role: ROLES.FARMER },
  { key: 'buyer', name: 'Pune Fresh Basket', email: 'buyer@farm-e.local', phone: '9876500003', role: ROLES.BUYER },
  { key: 'buyerTwo', name: 'Mumbai Harvest Kitchen', email: 'buyer2@farm-e.local', phone: '9876500006', role: ROLES.BUYER },
  { key: 'admin', name: 'Farm-E Presentation Admin', email: 'admin@farm-e.local', phone: '9876500004', role: ROLES.ADMIN },
];

const inDays = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

const upsertUser = async (account, password) => {
  let user = await User.findOne({ email: account.email });
  if (!user) user = new User(account);
  Object.assign(user, account, { passwordHash: password, isActive: true, isVerified: true });
  await user.save();
  return user;
};

const upsertFarm = async (farmer, details) => Farm.findOneAndUpdate(
  { farmer: farmer._id },
  { $set: { farmer: farmer._id, ...details } },
  { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true }
);

const upsertListing = async (farmer, farm, details) => CropListing.findOneAndUpdate(
  { farmer: farmer._id, 'crop.name': details.crop.name, tags: 'farm-e-demo' },
  { $set: { farmer: farmer._id, farm: farm._id, ...details, tags: ['farm-e-demo', 'presentation'] } },
  { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true }
);

const upsertRequirement = async (buyer, details) => {
  const filter = {
    buyer: buyer._id,
    'crop.name': details.crop.name,
    $or: [
      { tags: 'farm-e-demo' },
      ...(details.crop.name === 'Tomato' ? [{ description: 'Farm-E seeded demo requirement' }] : []),
    ],
  };
  return BuyerRequirement.findOneAndUpdate(
    filter,
    { $set: { buyer: buyer._id, ...details, tags: ['farm-e-demo', 'presentation'] } },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true }
  );
};

const upsertBid = async (requirement, farmer, farm, listing, details) => Bid.findOneAndUpdate(
  { requirement: requirement._id, farmer: farmer._id, message: details.message },
  {
    $set: {
      requirement: requirement._id,
      farmer: farmer._id,
      farm: farm._id,
      listing: listing._id,
      ...details,
      price: { perUnit: details.pricePerUnit, total: details.pricePerUnit * details.quantity },
      quantity: { offered: details.quantity, unit: details.unit },
    },
  },
  { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true }
);

const seedDemoData = async () => {
  if (process.env.NODE_ENV === 'production') throw new Error('Demo seeding is disabled in production');
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 12) throw new Error('Set DEMO_PASSWORD to a local-only password of at least 12 characters');

  const users = {};
  for (const account of DEMO_ACCOUNTS) users[account.key] = await upsertUser(account, password);

  const farms = {
    pune: await upsertFarm(users.farmer, {
      farmName: 'Sahyadri Harvest Farm',
      description: 'A family-run vegetable farm supplying Pune markets through planned harvests.',
      location: { address: 'Narayangaon, Junnar', village: 'Narayangaon', district: 'Pune', state: 'Maharashtra', pincode: '410504', coordinates: { type: 'Point', coordinates: [73.976, 19.117] } },
      totalArea: 7,
      areaUnit: 'acres',
      crops: ['Tomato', 'Onion', 'Green Chilli'],
      yearEstablished: 2012,
      avgRating: 4.7,
      totalReviews: 18,
      isVerified: true,
    }),
    nashik: await upsertFarm(users.farmerTwo, {
      farmName: 'Godavari Orchard',
      description: 'Seasonal fruit and grape grower serving wholesale buyers across Maharashtra.',
      location: { address: 'Pimpalgaon Baswant', village: 'Pimpalgaon Baswant', district: 'Nashik', state: 'Maharashtra', pincode: '422209', coordinates: { type: 'Point', coordinates: [73.99, 20.167] } },
      totalArea: 12,
      areaUnit: 'acres',
      crops: ['Tomato', 'Grapes', 'Pomegranate', 'Mango'],
      yearEstablished: 2008,
      avgRating: 4.8,
      totalReviews: 26,
      isVerified: true,
    }),
    sangli: await upsertFarm(users.farmerThree, {
      farmName: 'Krishna Valley Growers',
      description: 'Mixed-crop farm with seasonal vegetables, pulses, and turmeric from Sangli district.',
      location: { address: 'Tasgaon', village: 'Tasgaon', district: 'Sangli', state: 'Maharashtra', pincode: '416312', coordinates: { type: 'Point', coordinates: [74.601, 17.039] } },
      totalArea: 10,
      areaUnit: 'acres',
      crops: ['Turmeric', 'Soybean', 'Green Chilli'],
      yearEstablished: 2015,
      avgRating: 4.6,
      totalReviews: 11,
      isVerified: true,
    }),
  };

  const listingSpecs = [
    { key: 'tomato', farmer: 'farmer', farm: 'pune', name: 'Tomato', variety: 'Pusa Ruby', category: 'Vegetables', quantity: 900, unit: 'kg', price: 36, minimum: 32, grade: 'A', harvestIn: 3, description: 'Firm, field-ripened Pusa Ruby tomatoes, hand-sorted and packed in ventilated crates. Farm-gate pickup near Narayangaon.' },
    { key: 'onion', farmer: 'farmer', farm: 'pune', name: 'Onion', variety: 'Nashik Red', category: 'Vegetables', quantity: 2400, unit: 'kg', price: 28, minimum: 25, grade: 'A', harvestIn: 7, description: 'Cured red onions with dry outer skins, suitable for wholesale kitchens and retail packing. Loading can be arranged in Pune.' },
    { key: 'chilli', farmer: 'farmer', farm: 'pune', name: 'Green Chilli', variety: 'G4', category: 'Vegetables', quantity: 320, unit: 'kg', price: 52, minimum: 46, grade: 'A', harvestIn: 2, description: 'Fresh, medium-hot green chillies harvested to order and packed in 10 kg crates.' },
    { key: 'nashikTomato', farmer: 'farmerTwo', farm: 'nashik', name: 'Tomato', variety: 'Abhinav', category: 'Vegetables', quantity: 750, unit: 'kg', price: 39, minimum: 35, grade: 'A', harvestIn: 4, description: 'Uniform red Abhinav tomatoes, graded at the farm and available in a single delivery lot.' },
    { key: 'grapes', farmer: 'farmerTwo', farm: 'nashik', name: 'Grapes', variety: 'Thompson Seedless', category: 'Fruits', quantity: 1100, unit: 'kg', price: 78, minimum: 70, grade: 'Premium', harvestIn: 4, description: 'Green seedless bunches from a Nashik vineyard, graded for even size and packed in 5 kg cartons.' },
    { key: 'pomegranate', farmer: 'farmerTwo', farm: 'nashik', name: 'Pomegranate', variety: 'Bhagwa', category: 'Fruits', quantity: 700, unit: 'kg', price: 96, minimum: 88, grade: 'A', harvestIn: 8, description: 'Bhagwa pomegranates with deep colour and sound skins. Mixed 10–12 fruit cartons available for dispatch.' },
    { key: 'mango', farmer: 'farmerTwo', farm: 'nashik', name: 'Mango', variety: 'Kesar', category: 'Fruits', quantity: 450, unit: 'kg', price: 145, minimum: 132, grade: 'Premium', harvestIn: 12, description: 'Pre-harvest Kesar mango allocation. Fruit will be picked at mature-green stage and dispatched in ventilated boxes.' },
    { key: 'turmeric', farmer: 'farmerThree', farm: 'sangli', name: 'Turmeric', variety: 'Salem Finger', category: 'Spices & Herbs', quantity: 500, unit: 'kg', price: 118, minimum: 108, grade: 'A', harvestIn: 10, description: 'Clean, sun-dried turmeric fingers with low visible moisture, packed in 25 kg food-grade sacks.' },
    { key: 'soybean', farmer: 'farmerThree', farm: 'sangli', name: 'Soybean', variety: 'JS-335', category: 'Oilseeds', quantity: 65, unit: 'quintal', price: 5350, minimum: 5100, grade: 'A', harvestIn: 14, description: 'Machine-cleaned JS-335 soybean from the upcoming lot. Moisture and sample can be confirmed before dispatch.' },
  ];

  const listings = {};
  for (const spec of listingSpecs) {
    const farm = farms[spec.farm];
    listings[spec.key] = await upsertListing(users[spec.farmer], farm, {
      crop: { name: spec.name, variety: spec.variety, category: spec.category },
      description: spec.description,
      quantity: { expected: spec.quantity, available: spec.quantity, unit: spec.unit },
      pricePerUnit: { expected: spec.price, minimum: spec.minimum },
      quality: { grade: spec.grade, description: `Grade ${spec.grade}; final sample available before confirmation.`, certifications: [] },
      harvestDate: { expected: inDays(spec.harvestIn), earliest: inDays(spec.harvestIn - 1), latest: inDays(spec.harvestIn + 2) },
      location: farm.location,
      status: LISTING_STATUS.ACTIVE,
      expiresAt: inDays(45),
      views: 16 + (spec.quantity % 37),
      inquiries: ['tomato', 'grapes'].includes(spec.key) ? 3 : 1,
    });
  }

  const requirementSpecs = [
    { key: 'puneTomato', buyer: 'buyer', crop: { name: 'Tomato', variety: 'Pusa Ruby or similar', category: 'Vegetables' }, description: 'Weekly requirement for a Pune meal-prep kitchen. Firm fruit, sorted by size, delivered in reusable crates.', quantity: { required: 800, unit: 'kg', flexibility: '±10%' }, priceTarget: { max: 44, preferred: 38 }, grade: 'A', delivery: { address: 'Market Yard, Gultekdi', district: 'Pune', state: 'Maharashtra', pincode: '411037', coordinates: [73.864, 18.501] }, daysUntil: 5 },
    { key: 'mumbaiMango', buyer: 'buyerTwo', crop: { name: 'Mango', variety: 'Kesar', category: 'Fruits' }, description: 'Looking for Kesar mangoes for a seasonal retail launch. Please quote packed price and dispatch window.', quantity: { required: 350, unit: 'kg', flexibility: '±10%' }, priceTarget: { max: 175, preferred: 150 }, grade: 'Premium', delivery: { address: 'Vashi APMC Market', district: 'Thane', state: 'Maharashtra', pincode: '400703', coordinates: [73.009, 19.067] }, daysUntil: 12 },
    { key: 'puneOnion', buyer: 'buyer', crop: { name: 'Onion', variety: 'Nashik Red', category: 'Vegetables' }, description: 'Monthly kitchen supply. Prefer dry, cured bulbs in 25 kg mesh bags with consistent medium sizing.', quantity: { required: 1500, unit: 'kg', flexibility: '±20%' }, priceTarget: { max: 34, preferred: 28 }, grade: 'A', delivery: { address: 'Hadapsar Industrial Estate', district: 'Pune', state: 'Maharashtra', pincode: '411013', coordinates: [73.927, 18.508] }, daysUntil: 8 },
    { key: 'mumbaiGrapes', buyer: 'buyerTwo', crop: { name: 'Grapes', variety: 'Thompson Seedless', category: 'Fruits' }, description: 'Green seedless grapes for two retail outlets. Share carton size, grading details, and a sample before booking.', quantity: { required: 600, unit: 'kg', flexibility: '±10%' }, priceTarget: { max: 92, preferred: 80 }, grade: 'Premium', delivery: { address: 'Turbe Wholesale Market', district: 'Thane', state: 'Maharashtra', pincode: '400705', coordinates: [73.021, 19.078] }, daysUntil: 6 },
    { key: 'sangliTurmeric', buyer: 'buyer', crop: { name: 'Turmeric', variety: 'Salem Finger', category: 'Spices & Herbs' }, description: 'Seeking a clean turmeric finger lot for a spice processor. Include moisture details and available sample size.', quantity: { required: 300, unit: 'kg', flexibility: 'FLEXIBLE' }, priceTarget: { max: 130, preferred: 118 }, grade: 'A', delivery: { address: 'Kupwad MIDC', district: 'Sangli', state: 'Maharashtra', pincode: '416436', coordinates: [74.584, 16.866] }, daysUntil: 15 },
  ];

  const requirements = {};
  for (const spec of requirementSpecs) {
    requirements[spec.key] = await upsertRequirement(users[spec.buyer], {
      crop: spec.crop,
      description: spec.description,
      quantity: spec.quantity,
      priceTarget: spec.priceTarget,
      quality: { grade: spec.grade, certifications: [], specifications: `Grade ${spec.grade}; sample review before dispatch.` },
      deliveryDate: { required: inDays(spec.daysUntil), flexible: false },
      deliveryLocation: { ...spec.delivery, coordinates: { type: 'Point', coordinates: spec.delivery.coordinates } },
      status: REQUIREMENT_STATUS.OPEN,
      expiresAt: inDays(30),
      bidsCount: 0,
      isPublic: true,
      isLiveAuction: false,
    });
  }

  const bidSpecs = [
    { requirement: 'puneTomato', farmer: 'farmer', farm: 'pune', listing: 'tomato', price: 37, quantity: 600, days: 3, message: 'Can deliver 600 kg in 20 kg ventilated crates. A sample lot is ready for inspection.' },
    { requirement: 'puneTomato', farmer: 'farmerTwo', farm: 'nashik', listing: 'nashikTomato', price: 39, quantity: 700, days: 4, message: 'I can supply 700 kg of graded Abhinav tomatoes in one delivery lot.' },
    { requirement: 'mumbaiMango', farmer: 'farmerTwo', farm: 'nashik', listing: 'mango', price: 152, quantity: 350, days: 12, message: 'Kesar lot can be picked mature-green and dispatched in ventilated cartons on the requested date.' },
    { requirement: 'puneOnion', farmer: 'farmer', farm: 'pune', listing: 'onion', price: 27, quantity: 1200, days: 7, message: 'Cured Nashik Red onions are available in 25 kg mesh bags; balance quantity can follow next morning.' },
    { requirement: 'mumbaiGrapes', farmer: 'farmerTwo', farm: 'nashik', listing: 'grapes', price: 82, quantity: 600, days: 4, message: 'Thompson Seedless grapes are available in 5 kg cartons. We can send a sample carton first.' },
    { requirement: 'sangliTurmeric', farmer: 'farmerThree', farm: 'sangli', listing: 'turmeric', price: 116, quantity: 300, days: 10, message: 'Clean Salem Finger lot available. Moisture reading and a 1 kg sample can be shared before booking.' },
  ];

  const bidCounts = new Map();
  for (const spec of bidSpecs) {
    const requirement = requirements[spec.requirement];
    const farmer = users[spec.farmer];
    const listing = listings[spec.listing];
    await upsertBid(requirement, farmer, farms[spec.farm], listing, {
      pricePerUnit: spec.price,
      quantity: spec.quantity,
      unit: listing.quantity.unit,
      harvestDate: inDays(spec.days),
      deliveryInfo: { canDeliver: true, estimatedDate: inDays(spec.days + 1), deliveryCost: 0, notes: 'Delivery timing to be confirmed with the buyer.' },
      quality: { grade: listing.quality.grade, description: listing.quality.description },
      status: BID_STATUS.PENDING,
      message: spec.message,
      attachments: [],
      expiresAt: requirement.expiresAt,
    });
    bidCounts.set(spec.requirement, (bidCounts.get(spec.requirement) || 0) + 1);
  }
  await Promise.all(Object.entries(requirements).map(([key, requirement]) =>
    BuyerRequirement.updateOne({ _id: requirement._id }, { $set: { bidsCount: bidCounts.get(key) || 0 } })
  ));

  return DEMO_ACCOUNTS.map(({ key, email, role }) => ({ key, email, role }));
};

module.exports = { seedDemoData };
