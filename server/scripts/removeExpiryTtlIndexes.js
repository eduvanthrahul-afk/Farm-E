'use strict';

// Expiry controls marketplace visibility; it must not delete business records.
// Run once against the configured Mongo database to replace legacy TTL indexes.
const mongoose = require('mongoose');
const config = require('../src/config/env');

const COLLECTIONS = ['croplistings', 'buyerrequirements', 'bids'];

(async () => {
  await mongoose.connect(config.mongo.uri, { serverSelectionTimeoutMS: 10000 });
  for (const collectionName of COLLECTIONS) {
    const collection = mongoose.connection.db.collection(collectionName);
    const indexes = await collection.indexes();
    const expiryIndex = indexes.find((index) => index.key?.expiresAt === 1 && index.expireAfterSeconds !== undefined);
    if (!expiryIndex) {
      process.stdout.write(`${collectionName}: no TTL expiry index found\n`);
      continue;
    }
    await collection.dropIndex(expiryIndex.name);
    await collection.createIndex({ expiresAt: 1 }, { name: 'expiresAt_1' });
    process.stdout.write(`${collectionName}: removed TTL behavior; records are retained\n`);
  }
})().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}).finally(async () => {
  await mongoose.disconnect();
});
