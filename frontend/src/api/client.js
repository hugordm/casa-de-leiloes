// TODA chamada à API passa por aqui: token, ApiError com a mensagem em português,
// aviso de sessão expirada (401) e relógio do servidor ficam num lugar só.
import { updateServerOffset } from '../utils/serverClock';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3333').replace(/\/$/, '');
const TOKEN_KEY = 'leiloes.token';

export const apiUrl = (path) => `${API_URL}${path}`;

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Token no localStorage para sobreviver a um F5.
export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // localStorage indisponível (ex.: modo privado restrito): a sessão vale só nesta aba.
  }
}

// O AuthContext registra aqui o que fazer num 401 (sair e ir para o login).
let onUnauthorized = null;
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

// silent401: não dispara o "sessão expirada" (usado ao validar o token na abertura do site).
export async function request(path, { method = 'GET', body, signal, silent401 = false } = {}) {
  const token = getToken();
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const sentAt = Date.now();
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err; // requisição cancelada de propósito (ex.: saiu da página)
    throw new ApiError(0, 'NETWORK_ERROR', 'Não foi possível conectar ao servidor. Verifique sua conexão.');
  }
  const receivedAt = Date.now();

  const data = await response.json().catch(() => null);

  if (data?.serverTime) updateServerOffset(data.serverTime, sentAt, receivedAt);

  if (!response.ok) {
    // Token enviado e recusado = sessão expirada/inválida. (Sem token, 401 é só "faça login".)
    if (response.status === 401 && token && !silent401 && onUnauthorized) {
      onUnauthorized();
    }
    const message = data?.error?.message || 'Algo deu errado. Tente novamente.';
    throw new ApiError(response.status, data?.error?.code || 'UNKNOWN', message);
  }

  return data;
}
