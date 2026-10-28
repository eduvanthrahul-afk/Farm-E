'use strict';

const authService = require('../services/auth.service');
const { success, created } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const refreshCookieBaseOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/api/auth',
});
const setRefreshCookie = (res, token) => res.cookie('refreshToken', token, { ...refreshCookieBaseOptions(), maxAge: 7 * 24 * 60 * 60 * 1000 });
const clearRefreshCookie = (res) => res.clearCookie('refreshToken', refreshCookieBaseOptions());
const accessOnly = ({ user, accessToken }) => ({ user, accessToken });

const register = asyncHandler(async (req, res) => {
  const { name, email, phone, password, role } = req.body;
  const result = await authService.register({ name, email, phone, password, role }, req);
  setRefreshCookie(res, result.refreshToken);
  created(res, accessOnly(result), 'Account created successfully');
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const result = await authService.login({ email, password }, req);
  setRefreshCookie(res, result.refreshToken);
  success(res, accessOnly(result), 'Login successful');
});

const googleLogin = asyncHandler(async (req, res) => {
  const result = await authService.googleLogin(req.body, req);
  setRefreshCookie(res, result.refreshToken);
  success(res, accessOnly(result), 'Google sign-in successful');
});

const refreshToken = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.refreshToken;
  const tokens = await authService.refresh(refreshToken);
  setRefreshCookie(res, tokens.refreshToken);
  success(res, { accessToken: tokens.accessToken }, 'Tokens refreshed');
});

const logout = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.refreshToken;
  await authService.logout(req.user._id, refreshToken);
  clearRefreshCookie(res);
  success(res, {}, 'Logged out successfully');
});

const getMe = asyncHandler(async (req, res) => {
  success(res, { user: req.user }, 'Profile fetched');
});

const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  await authService.changePassword(req.user._id, currentPassword, newPassword);
  success(res, {}, 'Password changed. Please login again on all devices.');
});

module.exports = { register, login, googleLogin, refreshToken, logout, getMe, changePassword };
