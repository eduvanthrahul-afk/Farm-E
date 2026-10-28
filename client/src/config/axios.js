import axios from 'axios';
import { clearAccessToken, getAccessToken, setAccessToken } from '@/auth/tokenStore';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

const AUTH_PUBLIC_PATHS = ['/auth/login', '/auth/register', '/auth/google', '/auth/refresh-token'];

const isAuthPublicRequest = (config) => {
  const url = config?.url || '';
  return AUTH_PUBLIC_PATHS.some((path) => url.includes(path));
};

// Attach access token to every request except public auth endpoints
api.interceptors.request.use((config) => {
  if (isAuthPublicRequest(config)) return config;
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401 (never for login/register/refresh themselves)
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (!originalRequest) return Promise.reject(error);

    const status = error.response?.status;
    if (status !== 401 || originalRequest._retry || isAuthPublicRequest(originalRequest)) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        })
        .catch((err) => Promise.reject(err));
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const { data } = await axios.post('/api/auth/refresh-token', {}, { withCredentials: true });
      const { accessToken } = data.data;
      setAccessToken(accessToken);

      api.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
      processQueue(null, accessToken);

      return api(originalRequest);
    } catch (err) {
      processQueue(err, null);
      clearAccessToken();
      const onAuthPage = ['/login', '/register'].some((p) =>
        window.location.pathname.startsWith(p)
      );
      if (!onAuthPage) window.location.href = '/login';
      return Promise.reject(err);
    } finally {
      isRefreshing = false;
    }
  }
);

export default api;
