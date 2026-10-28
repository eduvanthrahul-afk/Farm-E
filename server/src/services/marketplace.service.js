'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');
const Farm = require('../models/Farm');
const CropListing = require('../models/CropListing');
const BuyerRequirement = require('../models/BuyerRequirement');
const Bid = require('../models/Bid');
const Order = require('../models/Order');
const Contract = require('../models/Contract');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { parsePagination, paginationMeta } = require('../utils/pagination');
const { LISTING_STATUS, REQUIREMENT_STATUS, BID_STATUS, ORDER_STATUS } = require('../config/constants');
const audit = require('./audit.service');
const { notifyFarmerOfOrder } = require('./order-notification.service');
const { AUDIT_ACTIONS, NOTIFICATION_TYPES } = require('../config/constants');
const { applyCurrentListingPrice, getCurrentListingPrice } = require('../utils/priceDecay');
const { createBatchAuthenticity } = require('./traceability.service');
const logger = require('../utils/logger');

const copyDefined = (source = {}, keys = []) => Object.fromEntries(
  keys.filter((key) => Object.prototype.hasOwnProperty.call(source, key)).map((key) => [key, source[key]])
);

const createReference = (prefix) => `${prefix}${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

let transactionsSupported = null;
let transactionFallbackLogged = false;

const sessionOptions = (session, options = {}) => (session ? { ...options, session } : options);
const withSession = (query, session) => (session ? query.session(session) : query);
const isUnsupportedTransactionError = (error) =>
  /This MongoDB deployment does not support retryable writes|Transaction numbers are only allowed|replica set member or mongos/i.test(error?.message || '');

const runTransaction = async (work) => {
  if (transactionsSupported === false) return work(null);

  const session = await mongoose.startSession();
  let result;
  let sessionEnded = false;
  const endSession = async () => {
    if (!sessionEnded) {
      sessionEnded = true;
      await session.endSession();
    }
  };

  try {
    await session.withTransaction(async () => { result = await work(session); });
    transactionsSupported = true;
    return result;
  } catch (error) {
    if (!isUnsupportedTransactionError(error)) throw error;

    transactionsSupported = false;
    if (!transactionFallbackLogged) {
      transactionFallbackLogged = true;
      logger.warn('MongoDB transactions are unavailable; retrying this operation with conditional standalone writes.');
    }
    await endSession();
    return work(null);
  } finally {
    await endSession();
  }
};

const restoreListingStock = async (listingId, quantity, session) => {
  const listing = await CropListing.findByIdAndUpdate(
    listingId,
    { $inc: { 'quantity.available': quantity } },
    sessionOptions(session, { returnDocument: 'after' })
  );
  if (!listing) {
    const err = new Error('The listing for this order no longer exists, so its stock could not be restored');
    err.statusCode = 409;
    throw err;
  }
  if (listing?.status === LISTING_STATUS.SOLD_OUT && listing.quantity.available > 0) {
    await CropListing.updateOne(
      { _id: listing._id, status: LISTING_STATUS.SOLD_OUT, 'quantity.available': { $gt: 0 } },
      { $set: { status: LISTING_STATUS.ACTIVE } },
      sessionOptions(session)
    );
  }
};

// ─── FARM ───────────────────────────────────────────────────────────────────

const createFarm = async (farmerId, data) => {
  const existing = await Farm.findOne({ farmer: farmerId });
  if (existing) {
    const err = new Error('Farm profile already exists');
    err.statusCode = 409;
    throw err;
  }
  return Farm.create({
    ...copyDefined(data, ['farmName', 'description', 'totalArea', 'areaUnit', 'location', 'crops', 'certifications', 'yearEstablished']),
    bankDetails: copyDefined(data.bankDetails, ['accountHolder', 'bankName', 'ifscCode', 'upiId']),
    farmer: farmerId,
  });
};

const updateFarm = async (farmerId, data) => {
  const farm = await Farm.findOne({ farmer: farmerId });
  if (!farm) {
    const err = new Error('Farm not found');
    err.statusCode = 404;
    throw err;
  }
  const topLevel = copyDefined(data, ['farmName', 'description', 'totalArea', 'areaUnit', 'crops', 'certifications', 'yearEstablished']);
  Object.assign(farm, topLevel);
  if (data.location && typeof data.location === 'object') {
    const location = copyDefined(data.location, ['address', 'village', 'district', 'state', 'pincode', 'coordinates']);
    farm.location = { ...(farm.location?.toObject?.() || farm.location?.toJSON?.() || {}), ...location };
  }
  if (data.bankDetails && typeof data.bankDetails === 'object') {
    for (const [key, value] of Object.entries(copyDefined(data.bankDetails, ['accountHolder', 'bankName', 'ifscCode', 'upiId']))) {
      farm.set(`bankDetails.${key}`, value);
    }
  }
  await farm.save();
  return farm;
};

const getFarm = async (farmerId) => {
  const farm = await Farm.findOne({ farmer: farmerId }).populate('farmer', 'name email phone');
  if (!farm) {
    const err = new Error('Farm not found');
    err.statusCode = 404;
    throw err;
  }
  return farm;
};

const getFarmById = async (farmId) => {
  const farm = await Farm.findById(farmId).populate('farmer', 'name email phone');
  if (!farm) {
    const err = new Error('Farm not found');
    err.statusCode = 404;
    throw err;
  }
  return farm;
};

// ─── CROP LISTINGS ───────────────────────────────────────────────────────────

const createListing = async (farmerId, data, req) => {
  const expectedQuantity = Number(data.quantity?.expected);
  const expectedPrice = Number(data.pricePerUnit?.expected);
  const minimumPrice = data.pricePerUnit?.minimum == null ? null : Number(data.pricePerUnit.minimum);
  if (!Number.isFinite(expectedQuantity) || expectedQuantity <= 0 || !Number.isFinite(expectedPrice) || expectedPrice <= 0 ||
      (minimumPrice !== null && (!Number.isFinite(minimumPrice) || minimumPrice < 0 || minimumPrice > expectedPrice))) {
    const err = new Error('Listing quantity and price must be valid, and minimum price cannot exceed expected price');
    err.statusCode = 400;
    throw err;
  }
  const farm = await Farm.findOne({ farmer: farmerId });
  if (!farm) {
    const err = new Error('You must create a farm profile first');
    err.statusCode = 400;
    throw err;
  }

  // Default expiry = 60 days from now
  if (!data.expiresAt) {
    const d = new Date();
    d.setDate(d.getDate() + 60);
    data.expiresAt = d;
  }

  const quantity = copyDefined(data.quantity, ['expected', 'unit']);
  quantity.available = quantity.expected;
  const listing = await CropListing.create({
    crop: copyDefined(data.crop, ['name', 'variety', 'category']),
    description: data.description,
    images: Array.isArray(data.images) ? data.images.filter((image) => typeof image === 'string').slice(0, 10) : [],
    quantity,
    pricePerUnit: copyDefined(data.pricePerUnit, ['expected', 'minimum']),
    quality: copyDefined(data.quality, ['grade', 'description', 'certifications']),
    harvestDate: copyDefined(data.harvestDate, ['expected', 'earliest', 'latest']),
    expiresAt: data.expiresAt,
    tags: Array.isArray(data.tags) ? data.tags.filter((tag) => typeof tag === 'string').slice(0, 20) : [],
    location: farm.location?.toObject?.() || farm.location,
    farmer: farmerId,
    farm: farm._id,
  });

  await audit.log({
    actor: farmerId,
    actorRole: 'FARMER',
    action: AUDIT_ACTIONS.LISTING_CREATED,
    resource: { model: 'CropListing', id: listing._id },
    after: listing.toObject(),
    req,
  });

  return listing;
};

const updateListing = async (listingId, farmerId, data, req) => {
  const listing = await CropListing.findOne({ _id: listingId, farmer: farmerId });
  if (!listing) {
    const err = new Error('Listing not found or not owned by you');
    err.statusCode = 404;
    throw err;
  }

  const before = listing.toObject();

  if (data.pricePerUnit) {
    const expectedPrice = Number(data.pricePerUnit.expected ?? listing.pricePerUnit.expected);
    const minimumPrice = Number(data.pricePerUnit.minimum ?? listing.pricePerUnit.minimum ?? 0);
    if (!Number.isFinite(expectedPrice) || expectedPrice <= 0 || !Number.isFinite(minimumPrice) || minimumPrice < 0) {
      const err = new Error('Listing prices must be valid and greater than zero');
      err.statusCode = 400;
      throw err;
    }
  }

  // NEVER allow price to be set below minimum — server enforces this.
  const nextExpectedPrice = data.pricePerUnit?.expected ?? listing.pricePerUnit.expected;
  const nextMinimumPrice = data.pricePerUnit?.minimum ?? listing.pricePerUnit.minimum;
  if (nextMinimumPrice != null) {
    if (nextMinimumPrice > nextExpectedPrice) {
      const err = new Error('Minimum price cannot exceed expected price');
      err.statusCode = 400;
      throw err;
    }
  }

  if (data.crop) listing.crop = { ...listing.crop.toObject(), ...copyDefined(data.crop, ['name', 'variety', 'category']) };
  if (data.description !== undefined) listing.description = data.description;
  if (Array.isArray(data.images)) listing.images = data.images.filter((image) => typeof image === 'string').slice(0, 10);
  if (data.quantity?.expected !== undefined) {
    const reserved = Math.max(0, listing.quantity.expected - listing.quantity.available);
    const updatedExpected = Number(data.quantity.expected);
    if (!Number.isFinite(updatedExpected) || updatedExpected < reserved) {
      const err = new Error('Expected quantity cannot be less than already ordered stock');
      err.statusCode = 400;
      throw err;
    }
    if (data.quantity?.unit && data.quantity.unit !== listing.quantity.unit && reserved > 0) {
      const err = new Error('Unit cannot change after stock has been ordered');
      err.statusCode = 400;
      throw err;
    }
    listing.quantity.expected = updatedExpected;
    listing.quantity.available = updatedExpected - reserved;
  }
  if (data.quantity?.unit !== undefined) listing.quantity.unit = data.quantity.unit;
  if (data.pricePerUnit) {
    const priceChanged = data.pricePerUnit.expected !== undefined &&
      Number(data.pricePerUnit.expected) !== Number(listing.pricePerUnit.expected);
    listing.pricePerUnit = { ...listing.pricePerUnit.toObject(), ...copyDefined(data.pricePerUnit, ['expected', 'minimum']) };
    if (priceChanged && listing.priceDecay?.enabled) listing.priceDecay.enabled = false;
  }
  if (data.quality) listing.quality = { ...listing.quality.toObject(), ...copyDefined(data.quality, ['grade', 'description', 'certifications']) };
  if (data.harvestDate) listing.harvestDate = { ...listing.harvestDate.toObject(), ...copyDefined(data.harvestDate, ['expected', 'earliest', 'latest']) };
  if (Array.isArray(data.tags)) listing.tags = data.tags.filter((tag) => typeof tag === 'string').slice(0, 20);
  await listing.save();

  await audit.log({
    actor: farmerId,
    actorRole: 'FARMER',
    action: AUDIT_ACTIONS.LISTING_MODIFIED,
    resource: { model: 'CropListing', id: listing._id },
    before,
    after: listing.toObject(),
    req,
  });

  return listing;
};

const updateListingStatus = async (listingId, farmerId, status, req) => {
  const listing = await CropListing.findOne({ _id: listingId, farmer: farmerId });
  if (!listing) {
    const err = new Error('Listing not found or not owned by you');
    err.statusCode = 404;
    throw err;
  }
  const transitions = {
    [LISTING_STATUS.ACTIVE]: [LISTING_STATUS.PAUSED, LISTING_STATUS.SOLD_OUT, LISTING_STATUS.CLOSED],
    [LISTING_STATUS.PAUSED]: [LISTING_STATUS.ACTIVE, LISTING_STATUS.CLOSED],
    [LISTING_STATUS.DRAFT]: [LISTING_STATUS.ACTIVE, LISTING_STATUS.CLOSED],
    [LISTING_STATUS.EXPIRED]: [LISTING_STATUS.ACTIVE, LISTING_STATUS.CLOSED],
    [LISTING_STATUS.SOLD_OUT]: [LISTING_STATUS.ACTIVE, LISTING_STATUS.CLOSED],
    [LISTING_STATUS.CLOSED]: [],
  };
  if (!transitions[listing.status]?.includes(status)) {
    const err = new Error(`Cannot transition listing from ${listing.status} to ${status}`);
    err.statusCode = 400;
    throw err;
  }
  if (status === LISTING_STATUS.ACTIVE && listing.quantity.available <= 0) {
    const err = new Error('Add available stock before activating this listing');
    err.statusCode = 400;
    throw err;
  }
  if (status === LISTING_STATUS.ACTIVE && listing.expiresAt && listing.expiresAt <= new Date()) {
    const err = new Error('Expired listings cannot be reactivated. Create a new listing instead.');
    err.statusCode = 400;
    throw err;
  }
  const before = { status: listing.status };
  listing.status = status;
  await listing.save();

  await audit.log({
    actor: farmerId,
    actorRole: 'FARMER',
    action: AUDIT_ACTIONS.LISTING_STATUS_CHANGED,
    resource: { model: 'CropListing', id: listing._id },
    before,
    after: { status },
    req,
  });

  return listing;
};

const getMyListings = async (farmerId, query) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = { farmer: farmerId };
  if (query.status) filter.status = query.status;

  const [listings, total] = await Promise.all([
    CropListing.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    CropListing.countDocuments(filter),
  ]);

  return { listings: listings.map(applyCurrentListingPrice), pagination: paginationMeta(page, limit, total) };
};

// ─── BUYER REQUIREMENTS ──────────────────────────────────────────────────────

const createRequirement = async (buyerId, data, req) => {
  const expiresAt = new Date(data.expiresAt);
  if (Number.isFinite(expiresAt.getTime())) expiresAt.setHours(23, 59, 59, 999);
  const deliveryAt = new Date(data.deliveryDate?.required);
  const preferredPrice = data.priceTarget?.preferred == null ? undefined : Number(data.priceTarget.preferred);
  if (!Number.isFinite(Number(data.priceTarget?.max)) || Number(data.priceTarget.max) <= 0 ||
      !Number.isFinite(Number(data.quantity?.required)) || Number(data.quantity.required) <= 0 ||
      !Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date() ||
      !Number.isFinite(deliveryAt.getTime()) || deliveryAt < new Date(new Date().setHours(0, 0, 0, 0)) ||
      expiresAt >= deliveryAt ||
      (preferredPrice !== undefined && (!Number.isFinite(preferredPrice) || preferredPrice <= 0 || preferredPrice > Number(data.priceTarget.max)))) {
    const err = new Error('Check the quantity, prices, delivery date, and expiry date');
    err.statusCode = 400;
    throw err;
  }
  const isLiveAuction = data.isLiveAuction === true;
  let auctionEndsAt;
  if (isLiveAuction) {
    const durationHours = Number(data.auctionDurationHours ?? 2);
    const reserveFloor = Number(data.reserveFloorPrice);
    if (!Number.isFinite(durationHours) || durationHours < 0.25 || durationHours > 24 ||
        !Number.isFinite(reserveFloor) || reserveFloor <= 0 || reserveFloor + 1 > Number(data.priceTarget.max)) {
      const err = new Error('Auction duration must be 15 minutes to 24 hours and reserve floor must leave at least ₹1 below the max price');
      err.statusCode = 400;
      throw err;
    }
    const endsAt = new Date();
    endsAt.setTime(endsAt.getTime() + durationHours * 60 * 60 * 1000);
    auctionEndsAt = endsAt < expiresAt ? endsAt : expiresAt;
  }

  const requirement = await BuyerRequirement.create({
    crop: copyDefined(data.crop, ['name', 'variety', 'category']),
    description: data.description,
    quantity: copyDefined(data.quantity, ['required', 'unit', 'flexibility']),
    priceTarget: copyDefined(data.priceTarget, ['max', 'preferred']),
    quality: copyDefined(data.quality, ['grade', 'certifications', 'specifications']),
    deliveryDate: copyDefined(data.deliveryDate, ['required', 'flexible']),
    deliveryLocation: copyDefined(data.deliveryLocation, ['address', 'district', 'state', 'pincode', 'coordinates']),
    expiresAt,
    isPublic: data.isPublic !== false,
    tags: Array.isArray(data.tags) ? data.tags.filter((tag) => typeof tag === 'string').slice(0, 20) : [],
    isLiveAuction,
    ...(isLiveAuction ? {
      auctionType: ['REVERSE_DUTCH', 'REVERSE_ENGLISH'].includes(data.auctionType) ? data.auctionType : 'REVERSE_ENGLISH',
      auctionEndsAt,
      currentLowestBid: { pricePerUnit: data.priceTarget.max },
      reserveFloorPrice: Number(data.reserveFloorPrice),
    } : {}),
    bidStep: 1,
    buyer: buyerId,
  });

  await audit.log({
    actor: buyerId,
    actorRole: 'BUYER',
    action: AUDIT_ACTIONS.REQUIREMENT_CREATED,
    resource: { model: 'BuyerRequirement', id: requirement._id },
    after: requirement.toObject(),
    req,
  });

  return requirement;
};

const getMyRequirements = async (buyerId, query) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = { buyer: buyerId };
  if (query.status) filter.status = query.status;

  const [requirements, total] = await Promise.all([
    BuyerRequirement.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    BuyerRequirement.countDocuments(filter),
  ]);

  return { requirements, pagination: paginationMeta(page, limit, total) };
};

// ─── BIDDING ─────────────────────────────────────────────────────────────────

const submitBid = async (farmerId, requirementId, data, req) => {
  const requirement = await BuyerRequirement.findById(requirementId);
  if (!requirement) {
    const err = new Error('Requirement not found');
    err.statusCode = 404;
    throw err;
  }
  if (!requirement.isPublic ||
      ![REQUIREMENT_STATUS.OPEN, REQUIREMENT_STATUS.RECEIVING_BIDS].includes(requirement.status) ||
      requirement.expiresAt <= new Date() ||
      (requirement.isLiveAuction && (!requirement.auctionEndsAt || requirement.auctionEndsAt <= new Date()))) {
    const err = new Error('This requirement is no longer accepting bids');
    err.statusCode = 400;
    throw err;
  }
  if (requirement.buyer.toString() === farmerId.toString()) {
    const err = new Error('You cannot bid on your own requirement');
    err.statusCode = 403;
    throw err;
  }
  if (!Number.isFinite(Number(data.quantity?.offered)) || Number(data.quantity.offered) <= 0 ||
      Number(data.quantity.offered) > requirement.quantity.required * 1.2) {
    const err = new Error('Bid quantity must be positive and within 20% of the requested quantity');
    err.statusCode = 400;
    throw err;
  }
  const flexibility = requirement.quantity.flexibility;
  const minFactor = flexibility === 'EXACT' ? 1 : flexibility === '±10%' ? 0.9 : flexibility === '±20%' ? 0.8 : 0.1;
  const maxFactor = flexibility === 'EXACT' ? 1 : flexibility === '±10%' ? 1.1 : flexibility === '±20%' ? 1.2 : 1.2;
  if (Number(data.quantity.offered) < requirement.quantity.required * minFactor ||
      Number(data.quantity.offered) > requirement.quantity.required * maxFactor) {
    const err = new Error(`Bid quantity must be within the buyer’s ${flexibility || 'flexible'} quantity range`);
    err.statusCode = 400;
    throw err;
  }
  if (data.quantity?.unit !== requirement.quantity.unit) {
    const err = new Error(`Bid quantity must use ${requirement.quantity.unit}`);
    err.statusCode = 400;
    throw err;
  }
  if (new Date(data.harvestDate) > requirement.deliveryDate.required) {
    const err = new Error('Harvest date must be on or before the requested delivery date');
    err.statusCode = 400;
    throw err;
  }

  const isLiveAuction = requirement.isLiveAuction && requirement.auctionEndsAt > new Date();

  // Live auctions allow a farmer to improve their own bid. The prior bid is
  // superseded only after the replacement has been committed successfully.
  const existingBid = await Bid.findOne({
    requirement: requirementId,
    farmer: farmerId,
    status: { $in: [BID_STATUS.PENDING, BID_STATUS.SEEN, BID_STATUS.SHORTLISTED] },
  });
  if (existingBid && !isLiveAuction) {
    const err = new Error('You already have an active bid on this requirement');
    err.statusCode = 409;
    throw err;
  }

  // SECURITY: Never trust price from client — validate against requirement max
  if (!Number.isFinite(Number(data.price?.perUnit)) || Number(data.price.perUnit) <= 0 ||
      Number(data.price.perUnit) > requirement.priceTarget.max) {
    const err = new Error('Bid price must be positive and within the buyer’s maximum price');
    err.statusCode = 400;
    throw err;
  }

  if (isLiveAuction) {
    const price = Number(data.price.perUnit);
    const currentPrice = requirement.currentLowestBid?.pricePerUnit || requirement.priceTarget.max;
    if (price < Number(requirement.reserveFloorPrice || 0)) {
      const err = new Error('Bid cannot be below the reserve floor price');
      err.statusCode = 400;
      throw err;
    }
    if (price >= currentPrice || currentPrice - price < Number(requirement.bidStep || 1)) {
      const err = new Error(`Bid must beat the current lowest price by at least ₹${requirement.bidStep || 1}`);
      err.statusCode = 400;
      throw err;
    }
  }

  const farm = await Farm.findOne({ farmer: farmerId });
  if (!farm) {
    const err = new Error('Farm profile required to submit bids');
    err.statusCode = 400;
    throw err;
  }

  // Default bid expiry = 7 days
  if (!data.expiresAt) {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    data.expiresAt = d;
  }

  const bid = await Bid.create({
    requirement: requirementId,
    farmer: farmerId,
    farm: farm._id,
    listing: data.listing || null,
    price: { perUnit: Number(data.price.perUnit) },
    quantity: { offered: Number(data.quantity.offered), unit: data.quantity.unit },
    harvestDate: data.harvestDate,
    deliveryInfo: copyDefined(data.deliveryInfo, ['canDeliver', 'estimatedDate', 'deliveryCost', 'notes']),
    quality: copyDefined(data.quality, ['grade', 'description']),
    message: typeof data.message === 'string' ? data.message.slice(0, 1000) : undefined,
    attachments: Array.isArray(data.attachments) ? data.attachments.slice(0, 5) : [],
    expiresAt: isLiveAuction ? requirement.auctionEndsAt : (data.expiresAt || new Date(Date.now() + 7 * 86400000)),
    history: [{ status: BID_STATUS.PENDING, changedBy: farmerId, changedAt: new Date() }],
  });

  // Commit the live auction leader with a compare-and-set so simultaneous bids
  // cannot both become the current lowest bid.
  if (isLiveAuction) {
    const liveFilter = {
      _id: requirementId,
      isPublic: true,
      isLiveAuction: true,
      status: { $in: [REQUIREMENT_STATUS.OPEN, REQUIREMENT_STATUS.RECEIVING_BIDS] },
      auctionEndsAt: { $gt: new Date() },
      $or: [
        { 'currentLowestBid.pricePerUnit': { $gt: bid.price.perUnit + Number(requirement.bidStep || 1) - 0.000001 } },
        { 'currentLowestBid.pricePerUnit': { $exists: false } },
      ],
    };
    const updated = await BuyerRequirement.findOneAndUpdate(liveFilter, {
      $set: {
        currentLowestBid: { pricePerUnit: bid.price.perUnit, farmer: farmerId, bidId: bid._id },
        status: REQUIREMENT_STATUS.RECEIVING_BIDS,
      },
      $inc: { bidsCount: 1 },
    }, { returnDocument: 'after' });
    if (!updated) {
      await Bid.deleteOne({ _id: bid._id });
      const err = new Error('Another bid was placed first. Refresh the auction and try again.');
      err.statusCode = 409;
      throw err;
    }
    if (existingBid) {
      await Bid.updateOne({ _id: existingBid._id, status: existingBid.status }, {
        $set: { status: BID_STATUS.WITHDRAWN },
        $push: { history: { status: BID_STATUS.WITHDRAWN, note: 'Superseded by a lower live-auction bid', changedBy: farmerId } },
      });
    }
  } else {
    requirement.bidsCount += 1;
    if (requirement.status === REQUIREMENT_STATUS.OPEN) requirement.status = REQUIREMENT_STATUS.RECEIVING_BIDS;
    await requirement.save();
  }

  // Notify buyer
  await Notification.create({
    recipient: requirement.buyer,
    type: NOTIFICATION_TYPES.NEW_BID,
    title: 'New bid received',
    body: `A farmer has submitted a bid on your requirement for ${requirement.crop.name}`,
    data: { relatedId: bid._id, relatedModel: 'Bid', actionUrl: `/requirements/${requirementId}/bids` },
  });

  await audit.log({
    actor: farmerId,
    actorRole: 'FARMER',
    action: AUDIT_ACTIONS.BID_CREATED,
    resource: { model: 'Bid', id: bid._id },
    after: bid.toObject(),
    req,
  });

  return bid;
};

const acceptBid = async (buyerId, bidId, req) => {
  const ids = {};
  const { bid, order, contract } = await runTransaction(async (session) => {
    const bid = await withSession(Bid.findById(bidId), session).populate('requirement farmer farm');
    if (!bid) {
      const err = new Error('Bid not found');
      err.statusCode = 404;
      throw err;
    }
    if (bid.requirement.buyer.toString() !== buyerId.toString()) {
      const err = new Error('Not authorized to accept this bid');
      err.statusCode = 403;
      throw err;
    }
    if (![REQUIREMENT_STATUS.OPEN, REQUIREMENT_STATUS.RECEIVING_BIDS, REQUIREMENT_STATUS.NEGOTIATING].includes(bid.requirement.status) ||
        !bid.requirement.isPublic || bid.requirement.expiresAt <= new Date()) {
      const err = new Error('This requirement is no longer accepting bid decisions');
      err.statusCode = 400;
      throw err;
    }
    if (![BID_STATUS.PENDING, BID_STATUS.SHORTLISTED, BID_STATUS.SEEN, BID_STATUS.COUNTER_OFFERED].includes(bid.status)) {
      const err = new Error(`Cannot accept bid in status: ${bid.status}`);
      err.statusCode = 400;
      throw err;
    }

    const priorRequirementStatus = bid.requirement.status;
    const claimedRequirement = await BuyerRequirement.findOneAndUpdate({
      _id: bid.requirement._id, buyer: buyerId, status: priorRequirementStatus,
      isPublic: true, expiresAt: { $gt: new Date() },
    }, { $set: { status: REQUIREMENT_STATUS.FULFILLED } }, sessionOptions(session, { returnDocument: 'after' }));
    if (!claimedRequirement) {
      const err = new Error('Another action already changed this requirement. Refresh and try again.');
      err.statusCode = 409;
      throw err;
    }

    const acceptedBid = await Bid.findOneAndUpdate({
      _id: bid._id,
      status: { $in: [BID_STATUS.PENDING, BID_STATUS.SHORTLISTED, BID_STATUS.SEEN, BID_STATUS.COUNTER_OFFERED] },
    }, {
      $set: { status: BID_STATUS.ACCEPTED },
      $push: { history: { status: BID_STATUS.ACCEPTED, changedBy: buyerId, changedAt: new Date() } },
    }, sessionOptions(session, { returnDocument: 'after' }));
    if (!acceptedBid) {
      const err = new Error('This bid was already updated. Refresh and try again.');
      err.statusCode = 409;
      throw err;
    }

    const buyer = await withSession(User.findById(buyerId), session);
    const orderNumber = createReference('FE');
    const issuedAt = new Date();
    const cropSnapshot = { ...(bid.requirement.crop.toObject?.() || bid.requirement.crop), grade: bid.quality?.grade };
    const quantitySnapshot = { expected: bid.quantity.offered, unit: bid.quantity.unit };
    const authenticity = createBatchAuthenticity({
      orderNumber,
      crop: cropSnapshot,
      quantity: quantitySnapshot,
      farm: bid.farm,
      farmerName: bid.farmer.name,
      harvestDate: bid.harvestDate,
      issuedAt,
    });
    const [order] = await Order.create([{
      orderNumber, farmer: bid.farmer._id, buyer: buyerId, bid: bid._id,
      crop: cropSnapshot,
      quantity: quantitySnapshot,
      price: { perUnit: bid.price.perUnit, expectedTotal: bid.price.perUnit * bid.quantity.offered },
      deliveryLocation: bid.requirement.deliveryLocation,
      deliveryDate: { scheduled: bid.requirement.deliveryDate.required },
      status: ORDER_STATUS.PENDING,
      statusHistory: [{ status: ORDER_STATUS.PENDING, changedBy: buyerId, changedAt: new Date() }],
      traceability: {
        batchNumber: authenticity.manifest.batchNumber,
        packingDate: issuedAt,
        harvestDate: bid.harvestDate,
        farmName: bid.farm?.farmName,
        certifications: bid.farm?.certifications || [],
        authenticity,
      },
    }], sessionOptions(session));
    const [contract] = await Contract.create([{
      contractNumber: createReference('CT'), order: order._id,
      farmer: { ref: bid.farmer._id, snapshot: { name: bid.farmer.name, email: bid.farmer.email, phone: bid.farmer.phone, farmName: bid.farm.farmName } },
      buyer: { ref: buyerId, snapshot: { name: buyer?.name, email: buyer?.email, phone: buyer?.phone, businessName: buyer?.businessName } }, crop: bid.requirement.crop,
      terms: {
        quantity: bid.quantity.offered, unit: bid.quantity.unit,
        pricePerUnit: bid.price.perUnit, expectedTotal: bid.price.perUnit * bid.quantity.offered,
        harvestDate: bid.harvestDate, deliveryDate: bid.requirement.deliveryDate.required,
        qualityGrade: bid.quality?.grade,
      },
    }], sessionOptions(session));
    order.contract = contract._id;
    await order.save(sessionOptions(session));
    await Bid.updateMany(
      { requirement: bid.requirement._id, _id: { $ne: bid._id }, status: { $in: [BID_STATUS.PENDING, BID_STATUS.SEEN, BID_STATUS.SHORTLISTED] } },
      { $set: { status: BID_STATUS.REJECTED }, $push: { history: { status: BID_STATUS.REJECTED, note: 'Another bid was accepted', changedAt: new Date() } } },
      sessionOptions(session)
    );
    ids.requirementCropName = bid.requirement.crop.name;
    await notifyFarmerOfOrder({ farmer: bid.farmer, order, cropName: ids.requirementCropName, bidAccepted: true, session });
    return { bid: acceptedBid, order, contract };
  });

  await audit.log({
    actor: buyerId,
    actorRole: 'BUYER',
    action: AUDIT_ACTIONS.BID_ACCEPTED,
    resource: { model: 'Bid', id: bid._id },
    after: { bidId: bid._id, orderId: order._id },
    req,
  });

  return { bid, order, contract };
};

const rejectBid = async (buyerId, bidId, reason, req) => {
  const bid = await Bid.findById(bidId).populate('requirement');
  if (!bid) {
    const err = new Error('Bid not found');
    err.statusCode = 404;
    throw err;
  }
  if (bid.requirement.buyer.toString() !== buyerId.toString()) {
    const err = new Error('Not authorized');
    err.statusCode = 403;
    throw err;
  }
  if (![BID_STATUS.PENDING, BID_STATUS.SEEN, BID_STATUS.SHORTLISTED, BID_STATUS.COUNTER_OFFERED].includes(bid.status)) {
    const err = new Error(`Cannot reject bid in status: ${bid.status}`);
    err.statusCode = 400;
    throw err;
  }

  bid.status = BID_STATUS.REJECTED;
  bid.history.push({ status: BID_STATUS.REJECTED, note: reason, changedBy: buyerId, changedAt: new Date() });
  await bid.save();

  await Notification.create({
    recipient: bid.farmer,
    type: NOTIFICATION_TYPES.BID_REJECTED,
    title: 'Bid not selected',
    body: `Your bid for ${bid.requirement.crop.name} was not selected.`,
    data: { relatedId: bid._id, relatedModel: 'Bid' },
  });

  await audit.log({
    actor: buyerId,
    actorRole: 'BUYER',
    action: AUDIT_ACTIONS.BID_REJECTED,
    resource: { model: 'Bid', id: bid._id },
    req,
  });

  return bid;
};

const withdrawBid = async (farmerId, bidId, req) => {
  const bid = await Bid.findOne({ _id: bidId, farmer: farmerId });
  if (!bid) {
    const err = new Error('Bid not found');
    err.statusCode = 404;
    throw err;
  }
  const canWithdraw = [BID_STATUS.PENDING, BID_STATUS.SEEN, BID_STATUS.SHORTLISTED];
  if (!canWithdraw.includes(bid.status)) {
    const err = new Error(`Cannot withdraw bid in status: ${bid.status}`);
    err.statusCode = 400;
    throw err;
  }

  bid.status = BID_STATUS.WITHDRAWN;
  bid.history.push({ status: BID_STATUS.WITHDRAWN, changedBy: farmerId, changedAt: new Date() });
  await bid.save();

  await audit.log({
    actor: farmerId,
    actorRole: 'FARMER',
    action: AUDIT_ACTIONS.BID_WITHDRAWN,
    resource: { model: 'Bid', id: bid._id },
    req,
  });

  return bid;
};

// ─── ORDERS ──────────────────────────────────────────────────────────────────

const createOrderFromListing = async (buyerId, listingId, quantity, deliveryLocation, req) => {
  const listing = await CropListing.findById(listingId).populate('farmer farm');
  if (!listing || listing.status !== LISTING_STATUS.ACTIVE) {
    const err = new Error('Listing not found or not available');
    err.statusCode = 404;
    throw err;
  }
  if (listing.farmer._id.toString() === buyerId.toString()) {
    const err = new Error('Cannot purchase your own listing');
    err.statusCode = 400;
    throw err;
  }

  const requestedQuantity = Number(quantity);
  if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0 || requestedQuantity > Number(listing.quantity.available || 0)) {
    const err = new Error('Requested quantity exceeds the available stock');
    err.statusCode = 400;
    throw err;
  }
  if (listing.expiresAt && listing.expiresAt <= new Date()) {
    const err = new Error('This listing has expired');
    err.statusCode = 400;
    throw err;
  }

  const unitPrice = getCurrentListingPrice(listing);

  const orderNumber = createReference('FE');
  const issuedAt = new Date();
  const cropSnapshot = { ...(listing.crop.toObject?.() || listing.crop), grade: listing.quality?.grade };
  const quantitySnapshot = { expected: requestedQuantity, unit: listing.quantity.unit };
  const authenticity = createBatchAuthenticity({
    orderNumber,
    crop: cropSnapshot,
    quantity: quantitySnapshot,
    farm: listing.farm,
    farmerName: listing.farmer.name,
    harvestDate: listing.harvestDate?.expected,
    issuedAt,
  });
  const { order, contract } = await runTransaction(async (session) => {
    const reservedListing = await CropListing.findOneAndUpdate(
      { _id: listing._id, status: LISTING_STATUS.ACTIVE, 'quantity.available': { $gte: requestedQuantity }, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
      { $inc: { 'quantity.available': -requestedQuantity } },
      sessionOptions(session, { returnDocument: 'after' })
    );
    if (!reservedListing) {
      const err = new Error('This quantity is no longer available. Refresh the listing and try again.');
      err.statusCode = 409;
      throw err;
    }
    if (reservedListing.quantity.available <= 0) {
      await CropListing.updateOne({ _id: listing._id, status: LISTING_STATUS.ACTIVE, 'quantity.available': { $lte: 0 } }, { $set: { status: LISTING_STATUS.SOLD_OUT } }, sessionOptions(session));
    }

    const buyer = await withSession(User.findById(buyerId), session);
    const [createdOrder] = await Order.create([{
      orderNumber,
      farmer: listing.farmer._id,
      buyer: buyerId,
      listing: listing._id,
      crop: cropSnapshot,
      quantity: quantitySnapshot,
      price: { perUnit: unitPrice, expectedTotal: unitPrice * requestedQuantity },
      deliveryLocation: {
        address: deliveryLocation.address,
        district: deliveryLocation.district,
        state: deliveryLocation.state,
        ...(deliveryLocation.coordinates ? { coordinates: deliveryLocation.coordinates } : {}),
      },
      status: ORDER_STATUS.PENDING,
      statusHistory: [{ status: ORDER_STATUS.PENDING, changedBy: buyerId, changedAt: new Date() }],
      traceability: {
        batchNumber: authenticity.manifest.batchNumber,
        packingDate: issuedAt,
        harvestDate: listing.harvestDate?.expected,
        farmName: listing.farm?.farmName,
        certifications: listing.farm?.certifications || [],
        authenticity,
      },
    }], sessionOptions(session));

    const [createdContract] = await Contract.create([{
      contractNumber: createReference('CT'),
      order: createdOrder._id,
      farmer: { ref: listing.farmer._id, snapshot: { name: listing.farmer.name, farmName: listing.farm?.farmName } },
      buyer: { ref: buyerId, snapshot: { name: buyer?.name, email: buyer?.email, phone: buyer?.phone, businessName: buyer?.businessName } },
      crop: listing.crop,
      terms: {
        quantity: requestedQuantity,
        unit: listing.quantity.unit,
        pricePerUnit: unitPrice,
        expectedTotal: unitPrice * requestedQuantity,
      },
    }], sessionOptions(session));

    createdOrder.contract = createdContract._id;
    await createdOrder.save(sessionOptions(session));
    await notifyFarmerOfOrder({ farmer: listing.farmer, order: createdOrder, cropName: listing.crop.name, session });
    return { order: createdOrder, contract: createdContract };
  });

  await audit.log({
    actor: buyerId,
    actorRole: 'BUYER',
    action: AUDIT_ACTIONS.ORDER_CREATED,
    resource: { model: 'Order', id: order._id },
    after: { orderNumber, listingId },
    req,
  });

  return { order, contract };
};

const updateOrderStatus = async (userId, userRole, orderId, newStatus, note, req) => {
  const { ORDER_TRANSITIONS } = require('../config/constants');

  const order = await Order.findById(orderId);
  if (!order) {
    const err = new Error('Order not found');
    err.statusCode = 404;
    throw err;
  }

  // Ownership check
  const isFarmer = order.farmer.toString() === userId.toString();
  const isBuyer = order.buyer.toString() === userId.toString();
  const isAdmin = userRole === 'ADMIN';
  if (!isFarmer && !isBuyer && !isAdmin) {
    const err = new Error('Order not found');
    err.statusCode = 404;
    throw err;
  }

  if (!isFarmer && !isBuyer && !isAdmin) {
    const err = new Error('Not authorized to update this order');
    err.statusCode = 403;
    throw err;
  }

  // State and role-specific transition checks; weight verification must use its dedicated endpoint.
  const allowed = ORDER_TRANSITIONS[order.status] || [];
  const farmerTransitions = {
    [ORDER_STATUS.PENDING]: ORDER_STATUS.CONFIRMED,
    [ORDER_STATUS.CONFIRMED]: ORDER_STATUS.HARVESTING,
    [ORDER_STATUS.HARVESTING]: ORDER_STATUS.READY_FOR_DELIVERY,
    [ORDER_STATUS.READY_FOR_DELIVERY]: ORDER_STATUS.IN_TRANSIT,
    [ORDER_STATUS.IN_TRANSIT]: ORDER_STATUS.DELIVERED,
    [ORDER_STATUS.PAYMENT_SETTLED]: ORDER_STATUS.COMPLETED,
  };
  const buyerTransitions = {
    [ORDER_STATUS.IN_TRANSIT]: ORDER_STATUS.DELIVERED,
    [ORDER_STATUS.WEIGHT_VERIFIED]: ORDER_STATUS.PAYMENT_SETTLED,
    [ORDER_STATUS.PAYMENT_SETTLED]: ORDER_STATUS.COMPLETED,
  };
  const roleAllows = isAdmin ||
    (isFarmer && farmerTransitions[order.status] === newStatus) ||
    (isBuyer && buyerTransitions[order.status] === newStatus) ||
    (newStatus === ORDER_STATUS.CANCELLED && (isFarmer || isBuyer));
  if (!allowed.includes(newStatus) || newStatus === ORDER_STATUS.WEIGHT_VERIFIED || !roleAllows) {
    const err = new Error(`Cannot transition order from ${order.status} to ${newStatus}`);
    err.statusCode = 400;
    throw err;
  }

  const before = { status: order.status };
  const update = {
    $set: { status: newStatus },
    $push: { statusHistory: { status: newStatus, note, changedBy: userId, changedAt: new Date() } },
  };
  if (newStatus === ORDER_STATUS.DELIVERED) update.$set['deliveryDate.actual'] = new Date();
  if (newStatus === ORDER_STATUS.PAYMENT_SETTLED) {
    update.$set['payment.status'] = 'COMPLETED';
    update.$set['payment.settledAt'] = new Date();
    update.$set['payment.method'] = 'SIMULATED';
    update.$set['payment.transactionId'] = `SIM-${order.orderNumber}`;
    update.$set['payment.isSimulated'] = true;
  }
  // Restock and cancel in one transaction. A failed stock restoration must not
  // leave a cancelled order whose reserved quantity has disappeared.
  const shouldRestoreStock = newStatus === ORDER_STATUS.CANCELLED && order.listing && order.status !== ORDER_STATUS.DISPUTED;
  const updatedOrder = shouldRestoreStock
    ? await runTransaction(async (session) => {
      const cancelledOrder = await Order.findOneAndUpdate(
        { _id: order._id, status: order.status },
        update,
        sessionOptions(session, { returnDocument: 'after', runValidators: true })
      );
      if (!cancelledOrder) return null;
      await restoreListingStock(order.listing, order.quantity.expected, session);
      return cancelledOrder;
    })
    : await Order.findOneAndUpdate(
      { _id: order._id, status: order.status },
      update,
      { returnDocument: 'after', runValidators: true }
    );
  if (!updatedOrder) {
    const err = new Error('This order was updated by someone else. Refresh and try again.');
    err.statusCode = 409;
    throw err;
  }

  // Notify other party
  const notifyUser = isFarmer ? order.buyer : order.farmer;
  await Notification.create({
    recipient: notifyUser,
    type: NOTIFICATION_TYPES.ORDER_STATUS_CHANGED,
    title: 'Order status updated',
    body: `Order #${order.orderNumber} is now: ${newStatus}`,
    data: { relatedId: order._id, relatedModel: 'Order', actionUrl: `/orders/${order._id}` },
  });

  await audit.log({
    actor: userId,
    actorRole: userRole,
    action: AUDIT_ACTIONS.ORDER_STATUS_CHANGED,
    resource: { model: 'Order', id: order._id },
    before,
    after: { status: newStatus },
    req,
  });

  return updatedOrder;
};

const verifyWeight = async (userId, orderId, actualQuantity, req) => {
  const measuredQuantity = Number(actualQuantity);
  if (!Number.isFinite(measuredQuantity) || measuredQuantity <= 0) {
    const err = new Error('Actual quantity must be greater than zero');
    err.statusCode = 400;
    throw err;
  }
  const order = await Order.findById(orderId);
  if (!order) {
    const err = new Error('Order not found');
    err.statusCode = 404;
    throw err;
  }
  if (order.buyer.toString() !== userId.toString()) {
    const err = new Error('Only the buyer can verify weight');
    err.statusCode = 403;
    throw err;
  }
  if (order.status !== ORDER_STATUS.DELIVERED) {
    const err = new Error('Order must be DELIVERED before weight verification');
    err.statusCode = 400;
    throw err;
  }
  const maximumQuantity = order.quantity.expected * (1 + Number(order.catchWeight?.tolerance ?? 5) / 100);
  const minimumQuantity = order.quantity.expected * (1 - Number(order.catchWeight?.tolerance ?? 5) / 100);
  if (measuredQuantity < minimumQuantity || measuredQuantity > maximumQuantity) {
    const err = new Error(`Actual quantity must be within ±${order.catchWeight?.tolerance ?? 5}% of the expected quantity (${minimumQuantity.toFixed(2)}–${maximumQuantity.toFixed(2)} ${order.quantity.unit})`);
    err.statusCode = 400;
    throw err;
  }

  const verifiedOrder = await Order.findOneAndUpdate({ _id: order._id, buyer: userId, status: ORDER_STATUS.DELIVERED }, {
    $set: {
      'quantity.actual': measuredQuantity,
      'quantity.weightVerified': true,
      'quantity.verifiedBy': userId,
      'quantity.verifiedAt': new Date(),
      'price.actualTotal': Math.round(measuredQuantity * order.price.perUnit * 100) / 100,
      status: ORDER_STATUS.WEIGHT_VERIFIED,
    },
    $push: { statusHistory: { status: ORDER_STATUS.WEIGHT_VERIFIED, changedBy: userId, changedAt: new Date() } },
  }, { returnDocument: 'after', runValidators: true });
  if (!verifiedOrder) {
    const err = new Error('Order was updated while verifying weight. Refresh and try again.');
    err.statusCode = 409;
    throw err;
  }

  await audit.log({
    actor: userId,
    actorRole: 'BUYER',
    action: AUDIT_ACTIONS.WEIGHT_VERIFIED,
    resource: { model: 'Order', id: order._id },
    before: { quantity: order.quantity.expected },
    after: { actual: measuredQuantity, finalAmount: verifiedOrder.price.actualTotal },
    req,
  });

  return verifiedOrder;
};

module.exports = {
  createFarm, updateFarm, getFarm, getFarmById,
  createListing, updateListing, updateListingStatus, getMyListings,
  createRequirement, getMyRequirements,
  submitBid, acceptBid, rejectBid, withdrawBid,
  createOrderFromListing, updateOrderStatus, verifyWeight,
};
