/**
 * Format a number as Indian Rupees
 */
export const formatINR = (amount, decimals = 2) => {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
};

/**
 * Format date to readable string
 */
export const formatDate = (date, opts = {}) => {
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...opts,
  }).format(new Date(date));
};

/**
 * Format date as relative time (e.g. "3 days ago")
 */
export const formatRelative = (date) => {
  if (!date) return '—';
  const diff = Date.now() - new Date(date).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(date);
};

/**
 * Format quantity with unit
 */
export const formatQty = (amount, unit) => {
  if (amount === null || amount === undefined) return '—';
  return `${Number(amount).toLocaleString('en-IN')} ${unit || ''}`.trim();
};

/**
 * Format days from now
 */
export const daysFromNow = (date) => {
  if (!date) return null;
  const diff = new Date(date).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

/**
 * Whether a date is still in the future
 */
export const isFutureDate = (date) => Boolean(date && new Date(date).getTime() > Date.now());

/**
 * Truncate text
 */
export const truncate = (str, n = 80) =>
  str && str.length > n ? `${str.slice(0, n)}…` : str;

/**
 * Get initials from name
 */
export const initials = (name = '') =>
  name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

/**
 * Catch-weight final calculation
 */
export const catchWeightTotal = (actualQty, pricePerUnit) =>
  actualQty != null && pricePerUnit != null ? actualQty * pricePerUnit : null;
