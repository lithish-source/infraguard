import api from './api';

export const authService = {
  register: (payload) => api.post('/auth/register', payload).then((r) => r.data),
  login: (payload) => api.post('/auth/login', payload).then((r) => r.data),
  refresh: (refreshToken) => api.post('/auth/refresh', { refresh_token: refreshToken }).then((r) => r.data),
  logout: () => api.post('/auth/logout').then((r) => r.data),
};

export const reportService = {
  list: (params = {}) => api.get('/reports', { params }).then((r) => r.data),
  get: (id) => api.get(`/reports/${id}`).then((r) => r.data),
  getMapData: (params = {}) => api.get('/reports/map', { params }).then((r) => r.data),
  getHeatmap: (params = {}) => api.get('/reports/heatmap', { params }).then((r) => r.data),
  myReports: () => api.get('/reports/me/my-reports').then((r) => r.data),
  create: (formData) =>
    api.post('/reports', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    }).then((r) => r.data),
  verify: (id, formData) =>
    api.post(`/reports/${id}/verifications`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data),
};

export const referenceService = {
  infrastructureTypes: () => api.get('/reference/infrastructure-types').then((r) => r.data),
  states: () => api.get('/reference/states').then((r) => r.data),
  districts: (state) => api.get('/reference/districts', { params: state ? { state } : {} }).then((r) => r.data),
  reverseGeocode: (lat, lon) =>
    api.get('/reference/reverse-geocode', { params: { latitude: lat, longitude: lon } }).then((r) => r.data),
};

export const adminService = {
  dashboardSummary: () => api.get('/admin/dashboard/summary').then((r) => r.data),
  severityDist: () => api.get('/admin/analytics/severity').then((r) => r.data),
  categoryDist: () => api.get('/admin/analytics/category').then((r) => r.data),
  monthlyTrend: (months = 6) => api.get('/admin/analytics/monthly', { params: { months } }).then((r) => r.data),
  districtAnalytics: () => api.get('/admin/analytics/districts').then((r) => r.data),
  responseTime: () => api.get('/admin/analytics/response-time').then((r) => r.data),
  repeatIncidents: () => api.get('/admin/analytics/repeat-incidents').then((r) => r.data),
  participation: () => api.get('/admin/analytics/participation').then((r) => r.data),
  updateStatus: (id, payload) => api.post(`/admin/reports/${id}/status`, payload).then((r) => r.data),
  updateSeverity: (id, payload) => api.post(`/admin/reports/${id}/severity`, payload).then((r) => r.data),
  assignTeam: (id, payload) => api.post(`/admin/reports/${id}/assign`, payload).then((r) => r.data),
  recomputePriorities: () => api.post('/admin/priority/recompute').then((r) => r.data),
};

export const notificationService = {
  list: (unreadOnly = false) =>
    api.get('/notifications', { params: { unread_only: unreadOnly } }).then((r) => r.data),
  markRead: (id) => api.post(`/notifications/${id}/read`).then((r) => r.data),
  markAllRead: () => api.post('/notifications/read-all').then((r) => r.data),
};
