'use strict';

const mongoose = require('mongoose');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const config = require('../config/env');

let s3Client;
let gridFSBucket;
let gridFSDatabase;
const GRIDFS_BUCKET_NAME = 'farmEUploads';

const getS3Client = () => {
  if (s3Client) return s3Client;

  const { S3Client } = require('@aws-sdk/client-s3');
  s3Client = new S3Client({
    region: 'auto',
    endpoint: config.storage.r2.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.storage.r2.accessKeyId,
      secretAccessKey: config.storage.r2.secretAccessKey,
    },
  });
  return s3Client;
};

const getGridFSBucket = () => {
  const db = mongoose.connection.db;
  if (!db || mongoose.connection.readyState !== 1) {
    throw new Error('MongoDB must be connected before using MongoDB file storage');
  }
  if (!gridFSBucket || gridFSDatabase !== db) {
    gridFSBucket = new mongoose.mongo.GridFSBucket(db, { bucketName: GRIDFS_BUCKET_NAME });
    gridFSDatabase = db;
  }
  return gridFSBucket;
};

const missingObjectError = (key) => Object.assign(new Error(`File not found: ${key}`), {
  name: 'NoSuchKey',
  code: 'ENOENT',
});

const putMongoObject = async ({ key, body, contentType }) => {
  const bucket = getGridFSBucket();
  const upload = bucket.openUploadStream(key, {
    metadata: { contentType: contentType || 'application/octet-stream' },
  });
  try {
    await pipeline(Readable.from([Buffer.isBuffer(body) ? body : Buffer.from(body)]), upload);
  } catch (error) {
    const db = mongoose.connection.db;
    if (db) {
      await Promise.all([
        db.collection(`${GRIDFS_BUCKET_NAME}.chunks`).deleteMany({ files_id: upload.id }),
        db.collection(`${GRIDFS_BUCKET_NAME}.files`).deleteOne({ _id: upload.id }),
      ]).catch(() => undefined);
    }
    throw error;
  }
  return upload.id;
};

const getMongoObject = async (key) => {
  const bucket = getGridFSBucket();
  const file = await bucket.find({ filename: key }).sort({ uploadDate: -1, _id: -1 }).limit(1).next();
  if (!file) throw missingObjectError(key);
  return {
    Body: bucket.openDownloadStream(file._id),
    ContentType: file.metadata?.contentType || 'application/octet-stream',
  };
};

const deleteMongoObject = async (key) => {
  const bucket = getGridFSBucket();
  const files = await bucket.find({ filename: key }, { projection: { _id: 1 } }).toArray();
  await Promise.all(files.map(({ _id }) => bucket.delete(_id)));
};

const putObject = async ({ key, body, contentType }) => {
  if (config.storage.provider === 'mongodb') return putMongoObject({ key, body, contentType });
  if (config.storage.provider === 'r2') {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    return getS3Client().send(new PutObjectCommand({
      Bucket: config.storage.r2.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }));
  }
  throw new Error('Durable object storage is not configured');
};

const getObject = async (key) => {
  if (config.storage.provider === 'mongodb') return getMongoObject(key);
  if (config.storage.provider === 'r2') {
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    return getS3Client().send(new GetObjectCommand({ Bucket: config.storage.r2.bucket, Key: key }));
  }
  throw new Error('Durable object storage is not configured');
};

const deleteObject = async (key) => {
  if (config.storage.provider === 'mongodb') return deleteMongoObject(key);
  if (config.storage.provider === 'r2') {
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    await getS3Client().send(new DeleteObjectCommand({ Bucket: config.storage.r2.bucket, Key: key }));
    return;
  }
  throw new Error('Durable object storage is not configured');
};

const checkObjectStorage = async () => {
  if (config.storage.provider === 'mongodb') {
    const db = mongoose.connection.db;
    if (!db || mongoose.connection.readyState !== 1) {
      throw new Error('MongoDB must be connected before initializing MongoDB file storage');
    }
    await db.command({ ping: 1 });
    return;
  }
  if (config.storage.provider === 'r2') {
    const { HeadBucketCommand } = require('@aws-sdk/client-s3');
    await getS3Client().send(new HeadBucketCommand({ Bucket: config.storage.r2.bucket }));
  }
};

module.exports = { putObject, getObject, deleteObject, checkObjectStorage };
