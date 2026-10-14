import { apiUrl } from './config.js';

const TOKEN_KEY = 'ieum.token';

export const tokenStore = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* 저장 불가 환경 */ } },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } },
};

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let onInvalidToken = () => {};
export const setInvalidTokenHandler = (fn) => { onInvalidToken = fn; };

async function request(method, path, body, opts = {}) {
  const headers = {};
  const token = tokenStore.get();
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  let res;
  try {
    res = await fetch(apiUrl(path), {
      method, headers, keepalive: !!opts.keepalive,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network', '서버에 연결할 수 없어요. 인터넷을 확인해 주세요');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = data.error || {};
    if (res.status === 401 && e.code === 'invalid_token') onInvalidToken();
    throw new ApiError(res.status, e.code || 'error', e.message || '요청에 실패했어요');
  }
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b = {}, o) => request('POST', p, b, o),
  patch: (p, b = {}) => request('PATCH', p, b),
  del: (p) => request('DELETE', p),
};
