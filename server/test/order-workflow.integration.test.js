'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'farm-e-integration-test-secret-access-32-bytes';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'farm-e-integration-test-secret-refresh-32-bytes';

const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const http = require('node:http');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const User = require('../src/models/User');
const Farm = require('../src/models/Farm');
const CropListing = require('../src/models/CropListing');
const BuyerRequirement = require('../src/models/BuyerRequirement');
const Order = require('../src/models/Order');
const orderRoutes = require('../src/routes/order.routes');
const listingRoutes = require('../src/routes/listing.routes');
const requirementRoutes = require('../src/routes/requirement.routes');
const { errorHandler, notFoundHandler } = require('../src/middleware/error.middleware');
const { generateAccessToken } = require('../src/utils/generateToken');
const marketplace = require('../src/services/marketplace.service');

let replicaSet;
let server;
let baseUrl;
const uploadedPaths = [];
let sequence = 1;

const clearCollections = async () => Promise.all(
  Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({}))
);

const createUser = async (role, label = role.toLowerCase()) => User.create({
  name: `Test ${label}`,
  email: `${label}-${sequence}@example.test`,
  phone: `98765${String(sequence++).padStart(5, '0')}`,
  passwordHash: 'IntegrationTestPassword123!',
  role,
  isActive: true,
});

const createOrderFixture = async () => {
  const farmer = await createUser('FARMER', 'farmer');
  const buyer = await createUser('BUYER', 'buyer');
  const outsider = await createUser('BUYER', 'outsider');
  const order = await Order.create({
    orderNumber: `TEST-${Date.now()}-${sequence}`,
    farmer: farmer._id,
    buyer: buyer._id,
    crop: { name: 'Tomato', category: 'Vegetables' },
    quantity: { expected: 20, unit: 'kg' },
    price: { perUnit: 40, expectedTotal: 800 },
    deliveryLocation: { address: 'Test delivery address' },
  });
  return { farmer, buyer, outsider, order };
};

before(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replicaSet.getUri());

  const app = express();
  app.use(express.json());
  app.use('/api/orders', orderRoutes);
  app.use('/api/listings', listingRoutes);
  app.use('/api/requirements', requirementRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await Promise.all(uploadedPaths.map((filePath) => fs.unlink(filePath).catch(() => undefined)));
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (replicaSet) await replicaSet.stop();
});

test('concurrent listing orders reserve stock once and cancellation restores it', async () => {
  await clearCollections();
  const farmer = await createUser('FARMER', 'stock-farmer');
  const buyerOne = await createUser('BUYER', 'stock-buyer-one');
  const buyerTwo = await createUser('BUYER', 'stock-buyer-two');
  const farm = await Farm.create({ farmer: farmer._id, farmName: 'Test Farm' });
  const listing = await CropListing.create({
    farmer: farmer._id,
    farm: farm._id,
    crop: { name: 'Tomato', category: 'Vegetables' },
    quantity: { expected: 10, available: 10, unit: 'kg' },
    pricePerUnit: { expected: 40, minimum: 30 },
    quality: { grade: 'A' },
    harvestDate: { expected: new Date(Date.now() + 5 * 86400000) },
    status: 'ACTIVE',
    expiresAt: new Date(Date.now() + 30 * 86400000),
  });
  const location = { address: 'Pune market' };
  const attempts = await Promise.allSettled([
    marketplace.createOrderFromListing(buyerOne._id, listing._id, 8, location),
    marketplace.createOrderFromListing(buyerTwo._id, listing._id, 8, location),
  ]);

  assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 1);
  assert.equal(attempts.filter((attempt) => attempt.status === 'rejected').length, 1);
  assert.equal((await CropListing.findById(listing._id)).quantity.available, 2);
  const [order] = await Order.find({ listing: listing._id });
  const successfulBuyer = attempts.find((attempt) => attempt.status === 'fulfilled').value.order.buyer;

  await marketplace.updateOrderStatus(successfulBuyer, 'BUYER', order._id, 'CANCELLED');
  assert.equal((await Order.findById(order._id)).status, 'CANCELLED');
  assert.equal((await CropListing.findById(listing._id)).quantity.available, 10);
});

test('an unrelated user cannot change an order status', async () => {
  await clearCollections();
  const { outsider, order } = await createOrderFixture();
  await assert.rejects(
    marketplace.updateOrderStatus(outsider._id, 'BUYER', order._id, 'CANCELLED'),
    (error) => error.statusCode === 404
  );
  assert.equal((await Order.findById(order._id)).status, 'PENDING');
});

test('buyers can preview ranked active listings without publishing a requirement', async () => {
  await clearCollections();
  const buyer = await createUser('BUYER', 'quick-match-buyer');
  const farmer = await createUser('FARMER', 'quick-match-farmer');
  const farm = await Farm.create({ farmer: farmer._id, farmName: 'Preview Farm' });
  const harvestDate = new Date(Date.now() + 5 * 86400000);
  const expiresAt = new Date(Date.now() + 30 * 86400000);
  const listing = await CropListing.create({
    farmer: farmer._id,
    farm: farm._id,
    crop: { name: 'Tomato', variety: 'Roma', category: 'Vegetables' },
    quantity: { expected: 20, available: 20, unit: 'kg' },
    pricePerUnit: { expected: 40, minimum: 30 },
    quality: { grade: 'A' },
    harvestDate: { expected: harvestDate },
    status: 'ACTIVE',
    expiresAt,
  });
  await CropListing.create({
    farmer: farmer._id,
    farm: farm._id,
    crop: { name: 'Potato', category: 'Vegetables' },
    quantity: { expected: 20, available: 20, unit: 'kg' },
    pricePerUnit: { expected: 35, minimum: 25 },
    quality: { grade: 'A' },
    harvestDate: { expected: harvestDate },
    status: 'ACTIVE',
    expiresAt,
  });
  await CropListing.create({
    farmer: farmer._id,
    farm: farm._id,
    crop: { name: 'Tomato', category: 'Vegetables' },
    quantity: { expected: 20, available: 20, unit: 'kg' },
    pricePerUnit: { expected: 40, minimum: 30 },
    quality: { grade: 'A' },
    harvestDate: { expected: harvestDate },
    status: 'PAUSED',
    expiresAt,
  });

  const token = generateAccessToken({ sub: buyer._id.toString(), role: buyer.role, email: buyer.email });
  const response = await fetch(`${baseUrl}/api/requirements/matches/preview`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      crop: { name: 'tomato', variety: 'Roma', category: 'Vegetables' },
      quantity: { required: 15, unit: 'kg', flexibility: '±10%' },
      priceTarget: { max: 50 },
      quality: { grade: 'A', certifications: [] },
      deliveryDate: { required: new Date(Date.now() + 10 * 86400000).toISOString(), flexible: false },
    }),
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.data.matches.map(({ listing: match }) => match._id), [listing._id.toString()]);
  assert.equal(body.data.eligibleCandidates, 1);
  assert.equal(await BuyerRequirement.countDocuments(), 0);

  const farmerToken = generateAccessToken({ sub: farmer._id.toString(), role: farmer.role, email: farmer.email });
  const denied = await fetch(`${baseUrl}/api/requirements/matches/preview`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${farmerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(denied.status, 403);
});

test('only order participants can add and download evidence', async () => {
  await clearCollections();
  const { farmer, buyer, outsider, order } = await createOrderFixture();
  const unrelatedFarmer = await createUser('FARMER', 'unrelated-farmer');
  const outsiderToken = generateAccessToken({ sub: outsider._id.toString(), role: outsider.role, email: outsider.email });
  const buyerToken = generateAccessToken({ sub: buyer._id.toString(), role: buyer.role, email: buyer.email });
  const unrelatedFarmerToken = generateAccessToken({ sub: unrelatedFarmer._id.toString(), role: unrelatedFarmer.role, email: unrelatedFarmer.email });
  const outsiderForm = new FormData();
  outsiderForm.append('files', new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }), 'evidence.jpg');
  outsiderForm.append('category', 'DELIVERY_PHOTO');
  const deniedUpload = await fetch(`${baseUrl}/api/orders/${order._id}/evidence`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${outsiderToken}` },
    body: outsiderForm,
  });
  assert.equal(deniedUpload.status, 404);

  const unrelatedFarmerForm = new FormData();
  unrelatedFarmerForm.append('files', new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }), 'evidence.jpg');
  const unrelatedFarmerUpload = await fetch(`${baseUrl}/api/orders/${order._id}/evidence`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${unrelatedFarmerToken}` },
    body: unrelatedFarmerForm,
  });
  assert.equal(unrelatedFarmerUpload.status, 404);

  const participantForm = new FormData();
  participantForm.append('files', new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }), 'delivery.jpg');
  participantForm.append('category', 'DELIVERY_PHOTO');
  participantForm.append('description', 'Weight visible at delivery');
  const uploaded = await fetch(`${baseUrl}/api/orders/${order._id}/evidence`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyerToken}` },
    body: participantForm,
  });
  assert.equal(uploaded.status, 201);
  const uploadedBody = await uploaded.json();
  const evidence = uploadedBody.data.evidence[0];
  assert.equal(evidence.originalName, 'delivery.jpg');
  assert.equal(evidence.description, 'Weight visible at delivery');
  uploadedPaths.push(path.join(__dirname, '../private/order-evidence', evidence.fileName));

  const deniedDownload = await fetch(`${baseUrl}/api/orders/${order._id}/evidence/${evidence._id}/file`, {
    headers: { Authorization: `Bearer ${outsiderToken}` },
  });
  assert.equal(deniedDownload.status, 404);
  const allowedDownload = await fetch(`${baseUrl}/api/orders/${order._id}/evidence/${evidence._id}/file`, {
    headers: { Authorization: `Bearer ${buyerToken}` },
  });
  assert.equal(allowedDownload.status, 200);
  assert.equal((await allowedDownload.arrayBuffer()).byteLength, 4);
  assert.equal(farmer.role, 'FARMER');
});

test('farmers can add validated photos only to their own listings', async () => {
  await clearCollections();
  const farmer = await createUser('FARMER', 'photo-farmer');
  const outsider = await createUser('FARMER', 'photo-outsider');
  const farm = await Farm.create({ farmer: farmer._id, farmName: 'Photo Test Farm' });
  const listing = await CropListing.create({
    farmer: farmer._id,
    farm: farm._id,
    crop: { name: 'Tomato', category: 'Vegetables' },
    quantity: { expected: 20, available: 20, unit: 'kg' },
    pricePerUnit: { expected: 40, minimum: 30 },
    quality: { grade: 'A' },
    harvestDate: { expected: new Date(Date.now() + 5 * 86400000) },
    status: 'ACTIVE',
    expiresAt: new Date(Date.now() + 30 * 86400000),
  });
  const makeToken = (user) => generateAccessToken({ sub: user._id.toString(), role: user.role, email: user.email });
  const makeForm = (bytes, mime = 'image/jpeg') => {
    const form = new FormData();
    form.append('images', new Blob([bytes], { type: mime }), 'tomato.jpg');
    return form;
  };

  const denied = await fetch(`${baseUrl}/api/listings/${listing._id}/images`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${makeToken(outsider)}` },
    body: makeForm(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])),
  });
  assert.equal(denied.status, 404);

  const invalid = await fetch(`${baseUrl}/api/listings/${listing._id}/images`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${makeToken(farmer)}` },
    body: makeForm(new Uint8Array([0, 1, 2, 3])),
  });
  assert.equal(invalid.status, 400);
  assert.equal((await CropListing.findById(listing._id)).images.length, 0);

  const uploaded = await fetch(`${baseUrl}/api/listings/${listing._id}/images`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${makeToken(farmer)}` },
    body: makeForm(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])),
  });
  assert.equal(uploaded.status, 200);
  const body = await uploaded.json();
  const imageUrl = body.data.listing.images[0];
  assert.match(imageUrl, /^\/uploads\/listings\/[\w-]+\.jpg$/);
  uploadedPaths.push(path.join(__dirname, '../uploads/listings', path.basename(imageUrl)));
  assert.equal((await CropListing.findById(listing._id)).images.length, 1);
  assert.equal(await fs.readFile(uploadedPaths.at(-1)).then((bytes) => bytes.length), 4);
});
