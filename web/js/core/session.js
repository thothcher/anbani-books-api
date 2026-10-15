// The signed-in user and their tokens.
//
// Tokens are kept in localStorage so a page reload keeps you signed in.
// (Trade-off worth discussing in class: localStorage is readable by any script
// on the page, so XSS must be prevented — which is why dom.js escapes all data.)
import { configureAuth, get, post } from './api.js';

const KEY = 'anbani.session';
const listeners = new Set();

let state = load();

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; }
}
function persist() {
  try {
    if (state.accessToken) localStorage.setItem(KEY, JSON.stringify(state));
    else localStorage.removeItem(KEY);
  } catch { /* storage unavailable */ }
}
function emit() { listeners.forEach((fn) => fn(state)); }

export const session = {
  get user() { return state.user ?? null; },
  get isAuthed() { return !!state.accessToken && !!state.user; },
  get isAdmin() { return state.user?.role === 'admin'; },
  get accessToken() { return state.accessToken ?? null; },
  get refreshToken() { return state.refreshToken ?? null; },
  get expiresAt() { return state.accessTokenExpiresAt ?? null; },
  /** Short subscription summary embedded in the user: { status, planCode, isTrial, hasAccess, accessUntil } */
  get subscription() { return state.user?.subscription ?? { status: 'none', hasAccess: false }; },
};

export const onSessionChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/** Stores the response of login / register / refresh / verify-email. */
export function setAuth(res) {
  state = {
    accessToken: res.accessToken,
    refreshToken: res.refreshToken,
    accessTokenExpiresAt: res.accessTokenExpiresAt,
    user: res.user,
  };
  persist();
  emit();
}

export function setUser(user) {
  state = { ...state, user };
  persist();
  emit();
}

export function clearSession() {
  state = {};
  persist();
  emit();
}

export async function login(email, password) {
  setAuth(await post('/api/auth/login', { email, password }, { auth: false }));
  return state.user;
}

export async function register(data) {
  setAuth(await post('/api/auth/register', data, { auth: false }));
  return state.user;
}

export async function verifyEmail(email, code) {
  setAuth(await post('/api/auth/verify-email', { email, code }, { auth: false }));
  return state.user;
}

export async function logout() {
  const refreshToken = state.refreshToken;
  clearSession();
  if (refreshToken) await post('/api/auth/logout', { refreshToken }, { auth: false }).catch(() => {});
}

/** Reloads /api/users/me — call after anything that changes the subscription or profile. */
export async function reloadUser() {
  if (!state.accessToken) return null;
  const user = await get('/api/users/me');
  setUser(user);
  return user;
}

// ── refresh: only one request at a time, even if 5 calls fail together ──────
let refreshing = null;
export function refreshTokens() {
  if (!state.refreshToken) return Promise.resolve(false);
  refreshing ??= post('/api/auth/refresh', { refreshToken: state.refreshToken }, { auth: false })
    .then((res) => { setAuth(res); return true; })
    .catch(() => { clearSession(); return false; })
    .finally(() => { refreshing = null; });
  return refreshing;
}

/** Seconds until the access token expires (for the dev panel). */
export function tokenSecondsLeft() {
  if (!state.accessTokenExpiresAt) return null;
  return Math.round((new Date(state.accessTokenExpiresAt).getTime() - Date.now()) / 1000);
}

export function decodeJwt(token = state.accessToken) {
  if (!token) return null;
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent([...atob(part)].map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

configureAuth({
  getAccessToken: () => state.accessToken ?? null,
  refresh: refreshTokens,
  onAuthLost: () => clearSession(),
});
