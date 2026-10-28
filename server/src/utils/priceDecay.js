'use strict';

const toListingView = (listing) => (
  typeof listing?.toObject === 'function' ? listing.toObject() : { ...listing }
);

const applyCurrentListingPrice = (listing, now = Date.now()) => {
  const view = toListingView(listing);
  const decay = view?.priceDecay;
  if (!decay?.enabled || !view.pricePerUnit) return view;

  const startingPrice = Number(decay.startingPrice ?? view.pricePerUnit.expected);
  const minimumPrice = Number(view.pricePerUnit.minimum) || 0;
  const floorPrice = Math.max(Number(decay.floorPrice) || 0, minimumPrice);
  const intervalMs = (Number(decay.intervalMinutes) || 30) * 60 * 1000;
  const decrementAmount = Number(decay.decrementAmount) || 2;
  const startTime = new Date(decay.startTime || view.createdAt || now).getTime();
  const intervalsPassed = Number.isFinite(startTime) && now >= startTime
    ? Math.floor((now - startTime) / intervalMs)
    : 0;
  const currentPrice = Math.max(floorPrice, startingPrice - intervalsPassed * decrementAmount);
  const isAtFloor = currentPrice <= floorPrice;

  decay.currentPrice = currentPrice;
  decay.floorPrice = floorPrice;
  decay.intervalsPassed = intervalsPassed;
  decay.isAtFloor = isAtFloor;
  decay.nextDropAt = isAtFloor
    ? null
    : new Date(startTime + (intervalsPassed + 1) * intervalMs);
  view.pricePerUnit.expected = currentPrice;
  return view;
};

const getCurrentListingPrice = (listing, now = Date.now()) => {
  const view = applyCurrentListingPrice(listing, now);
  return Number(view.pricePerUnit?.expected);
};

module.exports = { applyCurrentListingPrice, getCurrentListingPrice };
