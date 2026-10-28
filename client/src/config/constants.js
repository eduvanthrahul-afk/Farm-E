export const ROLES = { FARMER: 'FARMER', BUYER: 'BUYER', ADMIN: 'ADMIN' };

export const ORDER_STATUS = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  HARVESTING: 'HARVESTING',
  READY_FOR_DELIVERY: 'READY_FOR_DELIVERY',
  IN_TRANSIT: 'IN_TRANSIT',
  DELIVERED: 'DELIVERED',
  WEIGHT_VERIFIED: 'WEIGHT_VERIFIED',
  PAYMENT_SETTLED: 'PAYMENT_SETTLED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  DISPUTED: 'DISPUTED',
};

export const BID_STATUS = {
  PENDING: 'PENDING',
  SEEN: 'SEEN',
  SHORTLISTED: 'SHORTLISTED',
  COUNTER_OFFERED: 'COUNTER_OFFERED',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  WITHDRAWN: 'WITHDRAWN',
  EXPIRED: 'EXPIRED',
};

export const LISTING_STATUS = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  SOLD_OUT: 'SOLD_OUT',
  EXPIRED: 'EXPIRED',
  CLOSED: 'CLOSED',
};

export const REQUIREMENT_STATUS = {
  OPEN: 'OPEN',
  RECEIVING_BIDS: 'RECEIVING_BIDS',
  NEGOTIATING: 'NEGOTIATING',
  FULFILLED: 'FULFILLED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
};

// Organic status is selected separately as a certification, not ranked as a grade.
export const QUALITY_GRADES = ['A', 'B', 'C', 'Premium'];
export const QUALITY_CERTIFICATIONS = ['Organic'];

export const UNITS = ['kg', 'quintal', 'ton', 'piece', 'dozen', 'box'];

export const CROP_CATEGORIES = [
  'Vegetables',
  'Fruits',
  'Grains & Cereals',
  'Pulses & Legumes',
  'Spices & Herbs',
  'Oilseeds',
  'Flowers',
  'Dairy',
  'Other',
];

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'ta', label: 'தமிழ்' },
  { code: 'te', label: 'తెలుగు' },
  { code: 'mr', label: 'मराठी' },
];

export const ORDER_STATUS_LABELS = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  HARVESTING: 'Harvesting',
  READY_FOR_DELIVERY: 'Ready for Pickup',
  IN_TRANSIT: 'In Transit',
  DELIVERED: 'Delivered',
  WEIGHT_VERIFIED: 'Weight Verified',
  PAYMENT_SETTLED: 'Payment Settled',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  DISPUTED: 'Disputed',
};

export const ORDER_STATUS_COLOR = {
  PENDING: 'badge-gray',
  CONFIRMED: 'badge-blue',
  HARVESTING: 'badge-amber',
  READY_FOR_DELIVERY: 'badge-amber',
  IN_TRANSIT: 'badge-blue',
  DELIVERED: 'badge-green',
  WEIGHT_VERIFIED: 'badge-green',
  PAYMENT_SETTLED: 'badge-green',
  COMPLETED: 'badge-green',
  CANCELLED: 'badge-red',
  DISPUTED: 'badge-red',
};
