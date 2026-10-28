'use strict';

const config = require('../config/env');

let client;

const getClient = () => {
  if (config.storage.provider !== 'r2') {
    throw new Error('Remote object storage is not configured');
  }
  if (client) return client;

  const { S3Client } = require('@aws-sdk/client-s3');
  client = new S3Client({
    region: 'auto',
    endpoint: config.storage.r2.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.storage.r2.accessKeyId,
      secretAccessKey: config.storage.r2.secretAccessKey,
    },
  });
  return client;
};

const putObject = async ({ key, body, contentType }) => {
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  await getClient().send(new PutObjectCommand({
    Bucket: config.storage.r2.bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));
};

const getObject = async (key) => {
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  return getClient().send(new GetObjectCommand({ Bucket: config.storage.r2.bucket, Key: key }));
};

const deleteObject = async (key) => {
  const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
  await getClient().send(new DeleteObjectCommand({ Bucket: config.storage.r2.bucket, Key: key }));
};

const checkObjectStorage = async () => {
  if (config.storage.provider !== 'r2') return;
  const { HeadBucketCommand } = require('@aws-sdk/client-s3');
  await getClient().send(new HeadBucketCommand({ Bucket: config.storage.r2.bucket }));
};

module.exports = { putObject, getObject, deleteObject, checkObjectStorage };
