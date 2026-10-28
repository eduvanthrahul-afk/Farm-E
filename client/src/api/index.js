import api from '@/config/axios';

export const listingsApi = {
  getAll: (params) => api.get('/listings', { params }),
  getOne: (id) => api.get(`/listings/${id}`),
  getMine: (params) => api.get('/listings/mine', { params }),
  create: (data) => api.post('/listings', data),
    uploadImages: (id, files) => {
      const formData = new FormData();
      files.forEach((file) => formData.append('images', file));
      return api.post(`/listings/${id}/images`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
  update: (id, data) => api.put(`/listings/${id}`, data),
  updateStatus: (id, status) => api.patch(`/listings/${id}/status`, { status }),
  activateDecayFlash: (id, data) => api.post(`/listings/${id}/decay-flash`, data),
  stopDecayFlash: (id) => api.post(`/listings/${id}/decay-flash/stop`),
};

export const requirementsApi = {
  getAll: (params) => api.get('/requirements', { params }),
  getOne: (id) => api.get(`/requirements/${id}`),
  getMine: (params) => api.get('/requirements/mine', { params }),
  create: (data) => api.post('/requirements', data),
  update: (id, data) => api.put(`/requirements/${id}`, data),
  updateStatus: (id, status) => api.patch(`/requirements/${id}/status`, { status }),
  getBids: (id) => api.get(`/requirements/${id}/bids`),
  getMatches: (id) => api.get(`/requirements/${id}/matches`),
  previewMatches: (criteria) => api.post('/requirements/matches/preview', criteria),
};

export const bidsApi = {
  submit: (data) => api.post('/bids', data),
  getMine: () => api.get('/bids/mine'),
  getOne: (id) => api.get(`/bids/${id}`),
  accept: (id) => api.patch(`/bids/${id}/accept`),
  reject: (id, reason) => api.patch(`/bids/${id}/reject`, { reason }),
  withdraw: (id) => api.patch(`/bids/${id}/withdraw`),
};

export const ordersApi = {
  create: (data) => api.post('/orders', data),
  getMine: (params) => api.get('/orders/mine', { params }),
  getOne: (id) => api.get(`/orders/${id}`),
  getRoute: (id) => api.get(`/orders/${id}/route`),
  updateStatus: (id, status, note) => api.patch(`/orders/${id}/status`, { status, note }),
  verifyWeight: (id, actualQuantity) => api.patch(`/orders/${id}/verify-weight`, { actualQuantity }),
  getContract: (id) => api.get(`/orders/${id}/contract`),
  uploadEvidence: (id, formData) => api.post(`/orders/${id}/evidence`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  downloadEvidence: (id, evidenceId) => api.get(`/orders/${id}/evidence/${evidenceId}/file`, { responseType: 'blob' }),
};

export const analyticsApi = {
  getMine: () => api.get('/analytics/mine'),
};

export const farmsApi = {
  create: (data) => api.post('/farms', data),
  getMine: () => api.get('/farms/mine'),
  getOne: (id) => api.get(`/farms/${id}`),
  update: (id, data) => api.put(`/farms/${id}`, data),
};

export const locationsApi = {
  reverseGeocode: (coordinates) => api.get('/location/reverse', { params: { lat: coordinates[1], lng: coordinates[0] } }),
};

export const notificationsApi = {
  getAll: (params) => api.get('/notifications', { params }),
  getPreferences: () => api.get('/notifications/preferences'),
  updatePreferences: (data) => api.patch('/notifications/preferences', data),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
};

export const conversationsApi = {
  getAll: () => api.get('/conversations'),
  create: (data) => api.post('/conversations', data),
  getMessages: (id, params) => api.get(`/conversations/${id}/messages`, { params }),
  sendMessage: (id, data) => api.post(`/conversations/${id}/messages`, data),
  markRead: (id) => api.patch(`/conversations/${id}/read`),
};

export const reviewsApi = {
  create: (data) => api.post('/reviews', data),
  getByUser: (userId) => api.get(`/reviews/user/${userId}`),
};

export const disputesApi = {
  create: (data) => api.post('/disputes', data),
  getMine: () => api.get('/disputes/mine'),
  getOne: (id) => api.get(`/disputes/${id}`),
  addMessage: (id, content) => api.post(`/disputes/${id}/messages`, { content }),
};

export const adminApi = {
  getStats: () => api.get('/admin/dashboard/stats'),
  getUsers: (params) => api.get('/admin/users', { params }),
  verifyUser: (id) => api.patch(`/admin/users/${id}/verify`),
  toggleUserStatus: (id, isActive) => api.patch(`/admin/users/${id}/status`, { isActive }),
  getDisputes: (params) => api.get('/admin/disputes', { params }),
  resolveDispute: (id, data) => api.patch(`/disputes/${id}/resolve`, data),
  getOrders: (params) => api.get('/admin/orders', { params }),
  getAuditLogs: (params) => api.get('/admin/audit-logs', { params }),
};
