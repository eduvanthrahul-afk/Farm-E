'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'farm-e-chat-test-secret-access-32-bytes';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'farm-e-chat-test-secret-refresh-32-bytes';

const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const conversationRoutes = require('../src/routes/conversation.routes');
const User = require('../src/models/User');
const Conversation = require('../src/models/Conversation');
const Message = require('../src/models/Message');
const { generateAccessToken } = require('../src/utils/generateToken');
const { errorHandler, notFoundHandler } = require('../src/middleware/error.middleware');

let replicaSet;
let server;
let baseUrl;
let emittedEvents;
let sequence = 1;

const clearCollections = async () => Promise.all(
  Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({}))
);

const createUser = async (role) => {
  const index = sequence++;
  return User.create({
    name: `Chat ${role} ${index}`,
    email: `chat-${role.toLowerCase()}-${index}@example.test`,
    phone: `98765${String(index).padStart(5, '0')}`,
    passwordHash: 'ChatIntegrationTestPassword123!',
    role,
    isActive: true,
  });
};

const authHeader = (user) => `Bearer ${generateAccessToken({
  sub: user._id.toString(),
  role: user.role,
  email: user.email,
})}`;

const request = (path, token, options = {}) => fetch(`${baseUrl}${path}`, {
  ...options,
  headers: {
    Authorization: token,
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...options.headers,
  },
});

before(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replicaSet.getUri());

  emittedEvents = [];
  const app = express();
  app.use(express.json());
  app.use('/api/conversations', conversationRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  app.set('connectedUsers', new Map());
  app.set('io', {
    to: (room) => ({
      emit: (event, data) => emittedEvents.push({ room, event, data }),
    }),
  });

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (replicaSet) await replicaSet.stop();
});

test('chat persists messages, updates unread counts, and publishes live message/read events', async () => {
  await clearCollections();
  emittedEvents.length = 0;
  const farmer = await createUser('FARMER');
  const buyer = await createUser('BUYER');
  const conversation = await Conversation.create({
    participants: [farmer._id, buyer._id],
    unreadCount: { [farmer._id.toString()]: 0, [buyer._id.toString()]: 0 },
  });
  const farmerAuth = authHeader(farmer);
  const buyerAuth = authHeader(buyer);

  const response = await request(`/api/conversations/${conversation._id}/messages`, buyerAuth, {
    method: 'POST',
    body: JSON.stringify({ content: 'The tomatoes arrived in good condition.' }),
  });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.data.message.content, 'The tomatoes arrived in good condition.');
  assert.equal(body.data.message.sender.name, buyer.name);
  assert.ok(emittedEvents.some((event) => event.room === `conv:${conversation._id}` && event.event === 'new:message'));

  const updatedConversation = await Conversation.findById(conversation._id);
  assert.equal(updatedConversation.unreadCount.get(farmer._id.toString()), 1);

  const readResponse = await request(`/api/conversations/${conversation._id}/read`, farmerAuth, { method: 'PATCH' });
  assert.equal(readResponse.status, 200);
  const readConversation = await Conversation.findById(conversation._id);
  assert.equal(readConversation.unreadCount.get(farmer._id.toString()), 0);

  const persistedMessage = await Message.findOne({ conversation: conversation._id });
  assert.ok(persistedMessage.readBy.some((entry) => entry.user.toString() === farmer._id.toString()));
  assert.ok(emittedEvents.some((event) => event.room === `user:${buyer._id}` && event.event === 'messages:read' && event.data.readerId === farmer._id.toString()));

  const historyResponse = await request(`/api/conversations/${conversation._id}/messages`, farmerAuth);
  assert.equal(historyResponse.status, 200);
  const history = await historyResponse.json();
  assert.equal(history.data.messages.length, 1);
  assert.equal(history.data.messages[0].content, 'The tomatoes arrived in good condition.');
});
