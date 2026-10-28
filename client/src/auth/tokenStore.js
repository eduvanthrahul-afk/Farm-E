let accessToken = null;
const accessTokenListeners = new Set();

export const getAccessToken = () => accessToken;
const publishAccessToken = () => accessTokenListeners.forEach((listener) => listener(accessToken));

export const setAccessToken = (token) => {
  accessToken = token || null;
  publishAccessToken();
};

export const clearAccessToken = () => {
  accessToken = null;
  publishAccessToken();
};

export const subscribeAccessToken = (listener) => {
  accessTokenListeners.add(listener);
  return () => accessTokenListeners.delete(listener);
};
