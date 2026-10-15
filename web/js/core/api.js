// The API client — the most important file for students to understand.
//
// Every request:
//   • goes to ANBANI_CONFIG.apiBaseUrl
//   • sends X-API-KEY (which sandbox) and Accept-Language (ka | en)
//   • sends Authorization: Bearer <accessToken> when signed in
//   • on 401 TOKEN_EXPIRED: refreshes the token ONCE and retries the request
//   • turns error responses into ApiError { status, code, detail, errors }
// Every call is also recorded in `netlog`, which the dev panel displays.
import { getLang } from './i18n.js';

const config = window.ANBANI_CONFIG ?? {};
export const API_BASE = (config.apiBaseUrl ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(status, body, fallback) {
    super(body?.detail || body?.title || fallback || `HTTP ${status}`);
    this.status = status;
    this.code = body?.code ?? (status === 0 ? 'NETWORK_ERROR' : `HTTP_${status}`);
    this.detail = body?.detail ?? this.message;
    this.errors = body?.errors ?? null;
    this.body = body;
  }
}

// ── network log for the dev panel ────────────────────────────────────────────
const logListeners = new Set();
let logId = 0;
export const netlog = {
  entries: [],
  subscribe(fn) { logListeners.add(fn); return () => logListeners.delete(fn); },
  clear() { this.entries = []; logListeners.forEach((fn) => fn()); },
  push(entry) {
    this.entries.unshift(entry);
    if (this.entries.length > 80) this.entries.length = 80;
    logListeners.forEach((fn) => fn());
  },
  update() { logListeners.forEach((fn) => fn()); },
};

const SECRET_FIELDS = /password|cvc|number|refreshToken|code/i;
function maskBody(body) {
  if (!body || typeof body !== 'object' || body instanceof FormData) return body instanceof FormData ? '[multipart/form-data]' : body;
  const out = Array.isArray(body) ? [] : {};
  for (const [k, v] of Object.entries(body)) {
    if (v && typeof v === 'object') out[k] = maskBody(v);
    else if (SECRET_FIELDS.test(k) && typeof v === 'string') out[k] = k === 'number' ? `•••• ${v.slice(-4)}` : '••••••';
    else out[k] = v;
  }
  return out;
}

// ── auth hooks (installed by session.js, avoids a circular import) ───────────
let hooks = {
  getAccessToken: () => null,
  refresh: async () => false,
  onAuthLost: () => {},
};
export const configureAuth = (h) => { hooks = { ...hooks, ...h }; };

function buildUrl(path, query) {
  const url = new URL(API_BASE + path, location.href);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '' || v === false) continue;
      url.searchParams.set(k, v);
    }
  }
  return url.toString();
}

/**
 * api('GET', '/api/books', { query: { page: 2 } })
 * options: query, body (object or FormData), auth (default true), retry (internal), signal
 */
export async function api(method, path, options = {}) {
  const { query, body, auth = true, signal } = options;
  const url = buildUrl(path, query);
  const headers = { 'X-API-KEY': config.apiKey ?? '', 'Accept-Language': getLang() };
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const token = auth ? hooks.getAccessToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  const entry = {
    id: ++logId, method, url, path: url.replace(API_BASE, ''), status: null, ms: null,
    requestHeaders: { ...headers, ...(token ? { Authorization: `Bearer ${token.slice(0, 12)}…` } : {}) },
    requestBody: maskBody(body), responseBody: undefined, retried: !!options.retry, started: Date.now(),
  };
  netlog.push(entry);

  let res;
  try {
    res = await fetch(url, { method, headers, body: payload, signal });
  } catch (err) {
    entry.status = 0;
    entry.ms = Date.now() - entry.started;
    entry.responseBody = { error: String(err.message || err) };
    netlog.update();
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, { code: 'NETWORK_ERROR', detail: getLang() === 'en' ? 'Cannot reach the API. Is it running?' : 'API მიუწვდომელია. გაშვებულია სერვერი?' });
  }

  const text = res.status === 204 ? '' : await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  entry.status = res.status;
  entry.ms = Date.now() - entry.started;
  entry.responseBody = data;
  netlog.update();

  if (res.ok) return data;

  // The access token lives 15 minutes. When it expires: refresh once, then repeat the request.
  if (res.status === 401 && data?.code === 'TOKEN_EXPIRED' && auth && !options.retry) {
    entry.hint = 'TOKEN_EXPIRED → POST /api/auth/refresh → retry';
    if (await hooks.refresh()) return api(method, path, { ...options, retry: true });
  }
  if (res.status === 401 && token && ['TOKEN_INVALID', 'TOKEN_WRONG_SANDBOX', 'USER_NOT_FOUND', 'TOKEN_EXPIRED'].includes(data?.code)) {
    hooks.onAuthLost(data.code);
    // public endpoints still work for guests — try again without the token
    if (!options.retry && method === 'GET') return api(method, path, { ...options, retry: true, auth: false });
  }
  throw new ApiError(res.status, typeof data === 'object' ? data : null, typeof data === 'string' ? data : undefined);
}

export const get = (path, opts) => api('GET', path, opts);
export const post = (path, body, opts) => api('POST', path, { ...opts, body });
export const put = (path, body, opts) => api('PUT', path, { ...opts, body });
export const del = (path, opts) => api('DELETE', path, opts);

/** File upload with multipart/form-data (field "file"). */
export function upload(path, file, { method = 'PUT', field = 'file' } = {}) {
  const form = new FormData();
  form.append(field, file);
  return api(method, path, { body: form });
}
