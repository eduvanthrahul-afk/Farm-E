'use strict';

/**
 * Matching Service — Explainable compatibility score between
 * a BuyerRequirement and a CropListing/Farmer Bid
 *
 * Score breakdown (total 100):
 *   cropMatch      35%
 *   quantityMatch  25%
 *   priceMatch     20%
 *   qualityMatch   10%
 *   dateMatch       5%
 *   locationScore   5%
 */

const WEIGHTS = {
  crop: 35,
  quantity: 25,
  price: 20,
  quality: 10,
  date: 5,
  location: 5,
};

const MASS_UNIT_TO_KG = Object.freeze({ kg: 1, quintal: 100, ton: 1000 });
const QUANTITY_TOLERANCE = Object.freeze({ EXACT: 0, '±10%': 0.1, '±20%': 0.2, FLEXIBLE: 0.9 });

const convertComparable = (amount, fromUnit, toUnit) => {
  const fromFactor = MASS_UNIT_TO_KG[fromUnit];
  const toFactor = MASS_UNIT_TO_KG[toUnit];
  if (fromFactor && toFactor) return Number(amount) * fromFactor / toFactor;
  if (fromUnit === toUnit) return Number(amount);
  return null;
};

function cropScore(requirement, listing) {
  const rCrop = requirement.crop.name.toLowerCase().trim();
  const lCrop = listing.crop.name.toLowerCase().trim();
  const rVar = (requirement.crop.variety || '').toLowerCase().trim();
  const lVar = (listing.crop.variety || '').toLowerCase().trim();

  if (rCrop !== lCrop) return { score: 0, reason: 'Crop type mismatch' };
  if (requirement.crop.category && listing.crop.category && requirement.crop.category !== listing.crop.category) {
    return { score: 0, reason: 'Crop category mismatch' };
  }
  if (rVar && lVar && rVar === lVar) return { score: 100, reason: 'Exact crop & variety match' };
  if (rVar && lVar && rVar !== lVar) return { score: 60, reason: 'Crop matches, variety differs' };
  return { score: 80, reason: 'Crop matches' };
}

function quantityScore(requirement, listing) {
  const required = requirement.quantity.required;
  const available = listing.quantity.available ?? listing.quantity.expected;
  if (!Number.isFinite(Number(required)) || required <= 0 || !Number.isFinite(Number(available)) || available <= 0) {
    return { score: 0, reason: 'No quantity available' };
  }

  const comparableAvailable = convertComparable(available, listing.quantity.unit, requirement.quantity.unit);
  if (comparableAvailable === null) return { score: 0, reason: 'Quantity units are not convertible' };
  const ratio = comparableAvailable / required;
  if (ratio >= 1 && ratio <= 1.3) return { score: 100, reason: 'Quantity covers the requirement' };
  if (ratio > 1.3) return { score: 85, reason: 'More than required available' };

  const flexibility = requirement.quantity.flexibility || '±10%';
  if (flexibility === 'EXACT' && ratio < 1) return { score: 0, reason: 'Exact quantity required; listing is short' };
  const allowedShortfall = QUANTITY_TOLERANCE[flexibility] ?? QUANTITY_TOLERANCE['±10%'];
  const minimumRatio = 1 - allowedShortfall;
  if (ratio >= minimumRatio && minimumRatio < 1) {
    const acceptedShortfallScore = 60 + 30 * ((ratio - minimumRatio) / (1 - minimumRatio));
    return {
      score: Math.round(acceptedShortfallScore),
      reason: `Quantity is within the buyer’s ${flexibility} tolerance`,
    };
  }
  return { score: 0, reason: `Quantity is below the buyer’s ${flexibility} tolerance` };
}

function priceScore(requirement, listing) {
  const maxPrice = requirement.priceTarget.max;
  const askPrice = listing.pricePerUnit.expected;
  if (!Number.isFinite(Number(askPrice)) || !Number.isFinite(Number(maxPrice)) || askPrice <= 0 || maxPrice <= 0) return { score: 0, reason: 'Invalid price data' };

  const askPerKg = MASS_UNIT_TO_KG[listing.quantity.unit]
    ? Number(askPrice) / MASS_UNIT_TO_KG[listing.quantity.unit]
    : listing.quantity.unit === requirement.quantity.unit ? Number(askPrice) : null;
  const budgetPerKg = MASS_UNIT_TO_KG[requirement.quantity.unit]
    ? Number(maxPrice) / MASS_UNIT_TO_KG[requirement.quantity.unit]
    : listing.quantity.unit === requirement.quantity.unit ? Number(maxPrice) : null;
  if (askPerKg === null || budgetPerKg === null) return { score: 0, reason: 'Price units are not convertible' };

  const ratio = askPerKg / budgetPerKg;
  if (ratio > 1) return { score: 0, reason: 'Price exceeds the buyer’s maximum' };
  if (ratio <= 0.9) return { score: 100, reason: 'Price well below budget' };
  return { score: 85, reason: 'Price within budget' };
}

function qualityScore(requirement, listing) {
  const gradeOrder = ['C', 'B', 'A', 'Premium'];
  const requestedGrade = requirement.quality?.grade;
  const offeredGrade = listing.quality?.grade;
  const requiredCertifications = Array.isArray(requirement.quality?.certifications) ? [...requirement.quality.certifications] : [];
  const offeredCertifications = Array.isArray(listing.quality?.certifications) ? [...listing.quality.certifications] : [];

  // Older records stored Organic as a grade. Treat it as certification data,
  // never as a grade above Premium.
  if (requestedGrade === 'Organic' && !requiredCertifications.includes('Organic')) requiredCertifications.push('Organic');
  if (offeredGrade === 'Organic' && !offeredCertifications.includes('Organic')) offeredCertifications.push('Organic');

  let gradeScore = 60;
  let gradeReason = requestedGrade && requestedGrade !== 'Organic'
    ? 'Listing grade is not specified'
    : 'No quality grade required';
  if (requestedGrade && requestedGrade !== 'Organic') {
    if (offeredGrade === requestedGrade) {
      gradeScore = 100;
      gradeReason = 'Exact quality grade match';
    } else if (gradeOrder.includes(requestedGrade) && gradeOrder.includes(offeredGrade)) {
      const requestedIndex = gradeOrder.indexOf(requestedGrade);
      const offeredIndex = gradeOrder.indexOf(offeredGrade);
      if (offeredIndex > requestedIndex) {
        gradeScore = 80;
        gradeReason = 'Listing quality exceeds requirement';
      } else if (offeredIndex === requestedIndex - 1) {
        gradeScore = 40;
        gradeReason = 'Listing quality one grade below';
      } else {
        gradeScore = 10;
        gradeReason = 'Listing quality below requirement';
      }
    }
  }

  if (requiredCertifications.length) {
    const missing = requiredCertifications.filter((certification) => !offeredCertifications.includes(certification));
    if (missing.length) return { score: 0, reason: `Missing required certification: ${missing.join(', ')}` };
    const score = requestedGrade && requestedGrade !== 'Organic'
      ? Math.round((gradeScore + 100) / 2)
      : 100;
    return { score, reason: `${gradeReason}; required certification confirmed` };
  }

  return { score: gradeScore, reason: gradeReason };
}

function dateScore(requirement, listing) {
  const requiredBy = new Date(requirement.deliveryDate.required);
  const harvestDate = new Date(listing.harvestDate.expected);
  const dayStamp = (date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const requiredByTime = requiredBy.getTime();
  const harvestTime = harvestDate.getTime();
  if (!Number.isFinite(requiredByTime) || !Number.isFinite(harvestTime)) {
    return { score: 0, reason: 'Invalid harvest or delivery date' };
  }

  // These fields represent calendar dates. Comparing UTC day boundaries avoids
  // treating a harvest scheduled for today as already past after midnight.
  const requiredDay = dayStamp(requiredBy);
  const harvestDay = dayStamp(harvestDate);
  const today = dayStamp(new Date());
  if (harvestDay < today) return { score: 0, reason: 'Harvest date has passed' };
  if (harvestDay <= requiredDay) return { score: 100, reason: 'Can harvest before delivery date' };
  if (!requirement.deliveryDate.flexible) return { score: 0, reason: 'Harvest is after the fixed delivery date' };
  const daysDiff = (harvestDay - requiredDay) / (1000 * 60 * 60 * 24);
  if (daysDiff <= 7) return { score: 60, reason: 'Harvest slightly after required date' };
  return { score: 10, reason: 'Harvest well after required date' };
}

function locationScore(requirement, listing) {
  try {
    const [rLng, rLat] = requirement.deliveryLocation?.coordinates?.coordinates || [0, 0];
    const [lLng, lLat] = listing.location?.coordinates?.coordinates || [0, 0];

    if (rLng === 0 && rLat === 0) return { score: 50, reason: 'No delivery location specified' };
    if (lLng === 0 && lLat === 0) return { score: 50, reason: 'No farm location specified' };

    // Haversine distance (km)
    const R = 6371;
    const dLat = ((lLat - rLat) * Math.PI) / 180;
    const dLon = ((lLng - rLng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((rLat * Math.PI) / 180) *
        Math.cos((lLat * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    if (distKm <= 50) return { score: 100, reason: `Farm is ${Math.round(distKm)}km away` };
    if (distKm <= 100) return { score: 75, reason: `Farm is ${Math.round(distKm)}km away` };
    if (distKm <= 300) return { score: 50, reason: `Farm is ${Math.round(distKm)}km away` };
    if (distKm <= 500) return { score: 25, reason: `Farm is ${Math.round(distKm)}km away` };
    return { score: 0, reason: `Farm is ${Math.round(distKm)}km away — far` };
  } catch {
    return { score: 50, reason: 'Could not compute distance' };
  }
}

/**
 * Compute overall match score between a requirement and a listing
 * Returns { score, breakdown }
 */
const computeMatchScore = (requirement, listing) => {
  const crop = cropScore(requirement, listing);
  const quantity = quantityScore(requirement, listing);
  const price = priceScore(requirement, listing);
  const quality = qualityScore(requirement, listing);
  const date = dateScore(requirement, listing);
  const location = locationScore(requirement, listing);

  // Maximum price and explicitly selected crop category are hard match filters.
  const eligible = crop.score > 0 && quantity.score > 0 && price.score > 0 && quality.score > 0 && date.score > 0;
  const total = eligible ? Math.round(
    (crop.score * WEIGHTS.crop +
      quantity.score * WEIGHTS.quantity +
      price.score * WEIGHTS.price +
      quality.score * WEIGHTS.quality +
      date.score * WEIGHTS.date +
      location.score * WEIGHTS.location) /
      100
  ) : 0;

  return {
    score: total,
    eligible,
    grade: total >= 80 ? 'Excellent' : total >= 60 ? 'Good' : total >= 40 ? 'Fair' : 'Poor',
    breakdown: {
      crop: { ...crop, weight: WEIGHTS.crop },
      quantity: { ...quantity, weight: WEIGHTS.quantity },
      price: { ...price, weight: WEIGHTS.price },
      quality: { ...quality, weight: WEIGHTS.quality },
      date: { ...date, weight: WEIGHTS.date },
      location: { ...location, weight: WEIGHTS.location },
    },
  };
};

module.exports = { computeMatchScore };
