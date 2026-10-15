// A small hash router: #/books/12?tab=reviews
// Hash routing works on any static host without server configuration.
import { session } from './session.js';

const routes = [];
let current = null; // { route, params, cleanup }
const listeners = new Set();

/**
 * route('/books/:id', () => import('../pages/book.js'), { auth, admin, guest, bare })
 * The page module's default export: { title(ctx), render(view, ctx) → cleanup? , update?(ctx) }
 */
export function route(pattern, load, options = {}) {
  const keys = [];
  // '*' is the fallback (404) route: it never matches directly
  const regex = pattern === '*'
    ? /(?!)/
    : new RegExp('^' + pattern.replace(/\/:(\w+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$');
  routes.push({ pattern, regex, keys, load, ...options });
}

export function currentLocation() {
  const hash = location.hash.slice(1) || '/';
  const [path, qs = ''] = hash.split('?');
  return { path: path || '/', query: new URLSearchParams(qs), full: hash };
}

export function navigate(to, { replace = false } = {}) {
  const target = '#' + (to.startsWith('/') ? to : '/' + to);
  if (replace) {
    history.replaceState(null, '', target);
    resolve();
  } else if (location.hash === target) {
    resolve();
  } else {
    location.hash = target;
  }
}

/** Changes the query string without re-rendering the page (filters, tabs). */
export function setQuery(params) {
  const { path } = currentLocation();
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '' && v !== false) qs.set(k, v);
  const s = qs.toString();
  history.replaceState(null, '', '#' + path + (s ? '?' + s : ''));
}

export const onRouteChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

let renderToken = 0;

export async function resolve() {
  const { path, query, full } = currentLocation();
  const match = routes.map((r) => ({ r, m: path.match(r.regex) })).find((x) => x.m) ?? { r: routes.find((r) => r.pattern === '*'), m: [] };
  const { r } = match;
  const params = Object.fromEntries(r.keys?.map((k, i) => [k, decodeURIComponent(match.m[i + 1])]) ?? []);

  // guards
  if ((r.auth || r.admin) && !session.isAuthed) return navigate(`/login?next=${encodeURIComponent(full)}`, { replace: true });
  if (r.admin && !session.isAdmin) return navigate('/', { replace: true });
  if (r.guest && session.isAuthed) return navigate(query.get('next') || '/', { replace: true });

  const ctx = { path, params, query, full };
  const main = document.getElementById('main');

  // same page, only the query changed → let the page update itself
  if (current && current.route === r && current.path === path && current.page.update) {
    current.page.update(ctx);
    listeners.forEach((fn) => fn(ctx, r));
    return;
  }

  const token = ++renderToken;
  if (current?.cleanup) { try { current.cleanup(); } catch { /* ignore */ } }
  current = null;

  document.body.classList.toggle('is-bare', !!r.bare);
  const mod = await r.load();
  if (token !== renderToken) return; // a newer navigation started meanwhile
  const page = mod.default;
  // Every navigation gets a fresh container. If the previous page is still loading data
  // and renders late, it writes into its own detached element instead of over this page.
  const view = document.createElement('div');
  view.className = 'page-enter';
  main.replaceChildren(view);
  window.scrollTo({ top: 0, behavior: 'instant' });
  current = { route: r, path, page, cleanup: null };
  listeners.forEach((fn) => fn(ctx, r));
  const cleanup = await page.render(view, ctx);
  if (token === renderToken && current) current.cleanup = cleanup;
  if (page.title) document.title = `${page.title(ctx)} · Anbani`;
}

export function startRouter() {
  window.addEventListener('hashchange', resolve);
  return resolve();
}
