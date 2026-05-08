import axios from 'axios';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000') + '/api';

const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Auth
export const login  = (email, password) => api.post('/auth/login', { email, password });
export const getMe  = () => api.get('/auth/me');
export const createDemo = () => api.post('/auth/demo');

// WhatsApp
export const getWAStatus = () => api.get('/whatsapp/status');
export const connectWA   = () => api.post('/whatsapp/connect');
export const disconnectWA = () => api.post('/whatsapp/disconnect');
export const getGroups   = () => api.get('/whatsapp/groups');
export const syncGroups  = () => api.post('/whatsapp/groups/sync');
export const getContacts = (forceSync = false) =>
  api.get(`/whatsapp/contacts${forceSync ? '?sync=true' : ''}`);

// Messages
export const getMessages   = (params = {}) => api.get('/messages', { params });
export const createMessage = (formData) =>
  api.post('/messages', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const sendNow = (formData) =>
  api.post('/messages/send-now', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const deleteMessage = (id)       => api.delete(`/messages/${id}`);
export const updateMessage = (id, data) => api.put(`/messages/${id}`, data);

// Users (admin)
export const listUsers      = ()           => api.get('/users');
export const createUser     = (data)       => api.post('/users', data);
export const updateUser     = (id, data)   => api.put(`/users/${id}`, data);
export const changePassword = (id, data)   => api.put(`/users/${id}/password`, data);
export const deleteUser     = (id)         => api.delete(`/users/${id}`);

export default api;
