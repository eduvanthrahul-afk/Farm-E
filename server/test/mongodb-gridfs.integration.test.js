'use strict';

process.env.NODE_ENV = 'test';
process.env.STORAGE_PROVIDER = 'mongodb';
process.env.JWT_ACCESS_SECRET = 'farm-e-gridfs-integration-access-secret-32-bytes';
process.env.JWT_REFRESH_SECRET = 'farm-e-gridfs-integration-refresh-secret-32-bytes';

const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const app = require('../src/app');
const User = require('../src/models/User');
const Farm = require('../src/models/Farm');
const CropListing = require('../src/models/CropListing');
const Order = require('../src/models/Order');
const { generateAccessToken } = require('../src/utils/generateToken');
const objectStorage = require('../src/services/objectStorage.service');

let replicaSet;
let server;
let baseUrl;
let sequence = 1;

const createUser = async (role, label = role.toLowerCase()) => User.create({
  name: `GridFS ${label}`,
  email: `gridfs-${label}-${sequence}@example.test`,
  phone: `98765${String(sequence++).padStart(5, '0')}`,
  passwordHash: 'IntegrationTestPassword123!',
  role,
  isActive: true,
});

const tokenFor = (user) => generateAccessToken({
  sub: user._id.toString(),
  role: user.role,
  email: user.email,
});

const makeImageForm = () => {
  const form = new FormData();
  form.append('images', new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }), 'tomato.jpg');
  return form;
};

before(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replicaSet.getUri(), { retryWrites: false });
  await objectStorage.checkObjectStorage();
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (replicaSet) await replicaSet.stop();
});

test('MongoDB GridFS stores, streams, and deletes objects with content type metadata', async () => {
  const key = `integration/${crypto.randomUUID()}.txt`;
  const expectedBody = Buffer.from('Farm-E GridFS upload');

  await objectStorage.putObject({ key, body: expectedBody, contentType: 'text/plain' });
  const stored = await objectStorage.getObject(key);
  const chunks = [];
  for await (const chunk of stored.Body) chunks.push(chunk);
  assert.equal(stored.ContentType, 'text/plain');
  assert.deepEqual(Buffer.concat(chunks), expectedBody);

  await objectStorage.deleteObject(key);
  await assert.rejects(objectStorage.getObject(key), (error) => error.name === 'NoSuchKey');
});

test('listing photos are persisted in GridFS and served from the public upload route', async () => {
  const farmer = await createUser('FARMER', 'listing-farmer');
  const farm = await Farm.create({ farmer: farmer._id, farmName: 'GridFS Test Farm' });
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

  const uploaded = await fetch(`${baseUrl}/api/listings/${listing._id}/images`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenFor(farmer)}` },
    body: makeImageForm(),
  });
  assert.equal(uploaded.status, 200);
  const response = await uploaded.json();
  const imageUrl = response.data.listing.images[0];
  assert.match(imageUrl, /^\/uploads\/listings\/[\w-]+\.jpg$/);

  const image = await fetch(`${baseUrl}${imageUrl}`);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
});

test('order evidence stays private while GridFS serves it to the order participants', async () => {
  const farmer = await createUser('FARMER', 'evidence-farmer');
  const buyer = await createUser('BUYER', 'evidence-buyer');
  const outsider = await createUser('BUYER', 'evidence-outsider');
  const order = await Order.create({
    orderNumber: `GRIDFS-${Date.now()}-${sequence}`,
    farmer: farmer._id,
    buyer: buyer._id,
    crop: { name: 'Tomato', category: 'Vegetables' },
    quantity: { expected: 20, unit: 'kg' },
    price: { perUnit: 40, expectedTotal: 800 },
    deliveryLocation: { address: 'Test delivery address' },
  });
  const form = new FormData();
  form.append('files', new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }), 'delivery.jpg');
  form.append('category', 'DELIVERY_PHOTO');

  const uploaded = await fetch(`${baseUrl}/api/orders/${order._id}/evidence`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenFor(buyer)}` },
    body: form,
  });
  assert.equal(uploaded.status, 201);
  const response = await uploaded.json();
  const evidence = response.data.evidence[0];

  const denied = await fetch(`${baseUrl}/api/orders/${order._id}/evidence/${evidence._id}/file`, {
    headers: { Authorization: `Bearer ${tokenFor(outsider)}` },
  });
  assert.equal(denied.status, 404);

  const allowed = await fetch(`${baseUrl}/api/orders/${order._id}/evidence/${evidence._id}/file`, {
    headers: { Authorization: `Bearer ${tokenFor(buyer)}` },
  });
  assert.equal(allowed.status, 200);
  assert.match(allowed.headers.get('content-disposition'), /delivery\.jpg/);
  assert.deepEqual(Buffer.from(await allowed.arrayBuffer()), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
});
