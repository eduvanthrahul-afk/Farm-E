'use strict';

const { verifyAccessToken } = require('../utils/generateToken');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const BuyerRequirement = require('../models/BuyerRequirement');
const logger = require('../utils/logger');

const connectedUsers = new Map(); // userId → Set<socketId>

const setupSocket = (io) => {

  // Auth middleware for socket connections
  io.use(async (socket, next) => {
    try {
      // Never accept credentials from query strings: URLs are routinely logged
      // by proxies, browser history, and monitoring tools.
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));

      const decoded = verifyAccessToken(token);
      const user = await User.findById(decoded.sub).select('name role isActive');
      if (!user || !user.isActive) return next(new Error('User not found'));

      socket.userId = user._id.toString();
      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.userId;
    logger.info(`Socket connected: ${userId}`);

    // Track connected sockets per user (multi-tab/device)
    if (!connectedUsers.has(userId)) connectedUsers.set(userId, new Set());
    connectedUsers.get(userId).add(socket.id);

    // Join personal notification room
    socket.join(`user:${userId}`);

    // ─── CHAT EVENTS ─────────────────────────────────────────────

    socket.on('join:conversation', async (conversationId) => {
      try {
        const conv = await Conversation.findOne({
          _id: conversationId,
          participants: userId,
        });
        if (conv) {
          socket.join(`conv:${conversationId}`);
          socket.emit('joined:conversation', { conversationId });
        }
      } catch (err) {
        socket.emit('error', { message: 'Could not join conversation' });
      }
    });

    socket.on('leave:conversation', (conversationId) => {
      if (conversationId && /^[a-f\d]{24}$/i.test(conversationId)) socket.leave(`conv:${conversationId}`);
    });

    socket.on('typing:start', ({ conversationId } = {}) => {
      if (conversationId && socket.rooms.has(`conv:${conversationId}`)) {
        socket.to(`conv:${conversationId}`).emit('user:typing', { userId, conversationId });
      }
    });

    socket.on('typing:stop', ({ conversationId } = {}) => {
      if (conversationId && socket.rooms.has(`conv:${conversationId}`)) {
        socket.to(`conv:${conversationId}`).emit('user:stopped-typing', { userId, conversationId });
      }
    });

    // ─── LIVE AUCTION ARENA EVENTS ─────────────────────────────────
    socket.on('auction:join', async ({ requirementId } = {}) => {
      try {
        if (!requirementId || !/^[a-f\d]{24}$/i.test(requirementId)) return;
        const requirement = await BuyerRequirement.findById(requirementId).select('buyer isPublic isLiveAuction');
        const isOwner = requirement?.buyer?.toString() === userId;
        // Public auction listings remain viewable after bidding closes; the bid
        // API separately enforces the auction's status and end time.
        const canObserve = requirement && (requirement.isPublic || isOwner || socket.user.role === 'ADMIN');
        if (!requirement?.isLiveAuction || !canObserve) {
          return socket.emit('auction:error', { requirementId, message: 'Auction is unavailable' });
        }
        socket.join(`auction:${requirementId}`);
        socket.emit('auction:joined', { requirementId });
      } catch {
        socket.emit('auction:error', { requirementId, message: 'Could not join auction' });
      }
    });

    socket.on('auction:leave', ({ requirementId } = {}) => {
      if (requirementId && /^[a-f\d]{24}$/i.test(requirementId)) socket.leave(`auction:${requirementId}`);
    });

    // Bid writes go through the authenticated REST service so each bid has
    // normal validation, history, notifications, and a persisted Bid record.
    socket.on('auction:place_bid', () => socket.emit('auction:error', {
      message: 'Refresh the page to use the secure bid form.',
    }));

    // ─── DISCONNECT ───────────────────────────────────────────────

    socket.on('disconnect', () => {
      const sockets = connectedUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) connectedUsers.delete(userId);
      }
      logger.info(`Socket disconnected: ${userId}`);
    });
  });

  return { connectedUsers };
};

/**
 * Emit a notification to a specific user's sockets (if online)
 */
const emitToUser = (io, userId, event, data) => {
  io.to(`user:${userId}`).emit(event, data);
};

module.exports = { setupSocket, emitToUser };
