import { useState, useEffect, useCallback } from 'react';
import api from '@/config/axios';
import { clearAccessToken, setAccessToken } from './tokenStore';
import AuthContext from './AuthContext';

let authBootstrapPromise = null;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore user from stored tokens on mount
  useEffect(() => {
    let active = true;

    const init = async () => {
      // React StrictMode remounts effects once in development. Share the same
      // bootstrap request across that remount (and any concurrent provider mount).
      if (!authBootstrapPromise) {
        authBootstrapPromise = api.post('/auth/refresh-token')
          .then(({ data }) => {
            setAccessToken(data.data.accessToken);
            return api.get('/auth/me');
          })
          .then(({ data }) => data.data.user)
          .catch(() => {
            clearAccessToken();
            return null;
          })
          .finally(() => {
            authBootstrapPromise = null;
          });
      }

      const restoredUser = await authBootstrapPromise;
      if (active) {
        if (restoredUser) setUser(restoredUser);
        setLoading(false);
      }
    };
    init();

    return () => { active = false; };
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    const payload = data?.data;
    const u = payload?.user;
    const accessToken = payload?.accessToken;
    if (!u || !accessToken) {
      throw new Error('Login response was incomplete. Please try again.');
    }
    setAccessToken(accessToken);
    setUser(u);
    return u;
  }, []);

  const googleLogin = useCallback(async (credential, profile = {}) => {
    const { data } = await api.post('/auth/google', { credential, ...profile });
    const payload = data?.data;
    const u = payload?.user;
    const accessToken = payload?.accessToken;
    if (!u || !accessToken) throw new Error('Google sign-in response was incomplete. Please try again.');
    setAccessToken(accessToken);
    setUser(u);
    return u;
  }, []);

  const register = useCallback(async (payload) => {
    const { data } = await api.post('/auth/register', payload);
    const { user: u, accessToken } = data.data;
    setAccessToken(accessToken);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch { /* ignore */ } finally {
      clearAccessToken();
      setUser(null);
    }
  }, []);

  const updateUser = useCallback((updates) => {
    setUser((prev) => ({ ...prev, ...updates }));
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, googleLogin, register, logout, updateUser, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
};
