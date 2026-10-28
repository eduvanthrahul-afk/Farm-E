'use strict';

// Older User schemas created a TTL index on an embedded refreshTokens.createdAt
// field. MongoDB TTL deletes the containing User document when any array
// element expires, so remove that index before deploying the corrected schema.
const mongoose = require('mongoose');
const config = require('../src/config/env');

(async () => {
  if (process.env.MONGO_MEMORY === 'true') {
    throw new Error('This migration needs the persistent MONGO_URI database, not the temporary in-memory database');
  }
  await mongoose.connect(config.mongo.uri, { serverSelectionTimeoutMS: 10000 });
  const collection = mongoose.connection.db.collection('users');
  const indexes = await collection.indexes();
  const legacyIndexes = indexes.filter((index) =>
    index.key?.['refreshTokens.createdAt'] === 1 && index.expireAfterSeconds !== undefined
  );

  if (legacyIndexes.length === 0) {
    process.stdout.write('users: no refresh-token TTL index found\n');
  }
  for (const index of legacyIndexes) {
    await collection.dropIndex(index.name);
    process.stdout.write(`users: removed unsafe TTL index ${index.name}\n`);
  }
})().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}).finally(async () => {
  await mongoose.disconnect();
});
