const publicAppOrigin = import.meta.env.VITE_PUBLIC_APP_URL?.replace(/\/$/, '')
  || window.location.origin;

export const appUrl = (path = '') => `${publicAppOrigin}${path.startsWith('/') || !path ? path : `/${path}`}`;
