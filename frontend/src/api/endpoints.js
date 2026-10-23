// Uma função por endpoint da API. As páginas chamam estas funções, nunca o fetch direto.
import { request } from './client';

const qs = (params) => {
  const clean = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return clean.length ? `?${new URLSearchParams(clean)}` : '';
};

export const authApi = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  register: (data) => request('/auth/register', { method: 'POST', body: data }),
  me: () => request('/auth/me', { silent401: true }),
};

export const lotsApi = {
  // filtros: { status, search, minPrice, maxPrice } — preços em centavos
  list: (filters = {}, signal) => request(`/lots${qs(filters)}`, { signal }),
  get: (id, signal) => request(`/lots/${id}`, { signal }),
  create: (data) => request('/lots', { method: 'POST', body: data }),
  cancel: (id) => request(`/lots/${id}/cancel`, { method: 'POST' }),
  bid: (id, amountCents) => request(`/lots/${id}/bids`, { method: 'POST', body: { amountCents } }),
};

export const catalogApi = {
  search: (q, signal) => request(`/catalog/search${qs({ q })}`, { signal }),
};

export const walletApi = {
  get: () => request('/wallet'),
  deposit: (amountCents) => request('/wallet/deposit', { method: 'POST', body: { amountCents } }),
};

export const meApi = {
  bids: () => request('/me/bids'),
  lots: () => request('/me/lots'),
};

export const publicApi = {
  audit: (lotId) => request(`/audit/${lotId}`),
  receipt: (code) => request(`/receipts/${encodeURIComponent(code)}`),
};
