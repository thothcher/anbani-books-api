// Entry point: routes, global UI and the event handlers shared by every page.
import { $, on, html, render, debounce } from './core/dom.js';
import { t, getLang, setLang, onLangChange } from './core/i18n.js';
import { get, post, del } from './core/api.js';
import { session, onSessionChange, logout, reloadUser } from './core/session.js';
import { route, startRouter, navigate, resolve, onRouteChange, currentLocation } from './core/router.js';
import { toast, toastError, icon } from './core/ui.js';
import { initMotion } from './core/motion.js';
import { renderHeader } from './components/header.js';
import { renderFooter } from './components/footer.js';
import { mountDevPanel } from './components/devpanel.js';

// ── routes (each page is loaded on demand) ───────────────────────────────────
route('/', () => import('./pages/home.js'));
route('/books', () => import('./pages/catalog.js'));
route('/books/:id', () => import('./pages/book.js'));
route('/read/:id', () => import('./pages/reader.js'), { bare: true });
route('/preview/:id', () => import('./pages/reader.js'), { bare: true });
route('/pricing', () => import('./pages/pricing.js'));
route('/checkout/:plan', () => import('./pages/checkout.js'), { auth: true });
route('/login', () => import('./pages/auth.js'), { guest: true });
route('/register', () => import('./pages/auth.js'), { guest: true });
route('/verify', () => import('./pages/auth.js'));
route('/forgot', () => import('./pages/auth.js'), { guest: true });
route('/reset', () => import('./pages/auth.js'), { guest: true });
route('/library', () => import('./pages/library.js'), { auth: true });
route('/account', () => import('./pages/account.js'), { auth: true });
route('/account/:tab', () => import('./pages/account.js'), { auth: true });
route('/admin', () => import('./pages/admin.js'), { admin: true });
route('/admin/:section', () => import('./pages/admin.js'), { admin: true });
route('/admin/:section/:id', () => import('./pages/admin.js'), { admin: true });
route('*', () => import('./pages/notFound.js'));

// ── shell ────────────────────────────────────────────────────────────────────
renderHeader();
renderFooter();
mountDevPanel();
initMotion();

onRouteChange(() => renderHeader());
onSessionChange(() => { renderHeader(); renderFooter(); });
onLangChange(() => {
  renderHeader();
  renderFooter();
  resolve(); // re-render the page (the API answers in the new language too)
});

on(document.body, 'click', '[data-action="lang"]', () => setLang(getLang() === 'ka' ? 'en' : 'ka'));
on(document.body, 'click', '[data-action="theme"]', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('anbani.theme', next); } catch { /* ignore */ }
  renderHeader();
});

// the account dropdown in the header
on(document.body, 'click', '[data-action="menu"]', (e, btn) => {
  const panel = btn.nextElementSibling;
  const willOpen = panel.hidden;
  panel.hidden = !willOpen;
  btn.setAttribute('aria-expanded', String(willOpen));
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('[data-menu]')) document.querySelectorAll('[data-menu] .menu__panel').forEach((p) => { p.hidden = true; });
});

// full-screen overlays: the phone menu and the search
let lastFocus = null;
function openOverlay(name) {
  document.querySelectorAll('[data-overlay]').forEach((o) => { o.hidden = o.dataset.overlay !== name; });
  const overlay = $(`[data-overlay="${name}"]`);
  if (!overlay) return;
  lastFocus = document.activeElement;
  document.body.classList.add('is-locked');
  ($('input', overlay) ?? $('a, button', overlay))?.focus();
}
function closeOverlays() {
  document.querySelectorAll('[data-overlay]').forEach((o) => { o.hidden = true; });
  document.body.classList.remove('is-locked');
  lastFocus?.focus?.();
}
on(document.body, 'click', '[data-action="burger"]', () => openOverlay('menu'));
on(document.body, 'click', '[data-action="search"]', () => openOverlay('search'));
on(document.body, 'click', '[data-action="close-overlay"]', closeOverlays);
on(document.body, 'click', '[data-overlay] a[href^="#"]', closeOverlays);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.querySelector('[data-overlay]:not([hidden])')) closeOverlays();
  // "/" opens the search, like on many sites
  if (e.key === '/' && !e.target.closest('input, textarea, select, [contenteditable]') && !document.body.classList.contains('is-bare')) {
    e.preventDefault();
    openOverlay('search');
  }
});
on(document.body, 'submit', '[data-search]', (e) => {
  e.preventDefault();
  const q = new FormData(e.target).get('q').trim();
  closeOverlays();
  navigate(`/books${q ? `?q=${encodeURIComponent(q)}` : ''}`);
});
let searchController;
const liveSearch = debounce(async (q) => {
  const box = $('[data-search-results]');
  if (!box) return;
  searchController?.abort();
  if (q.length < 2) return render(box, '');
  searchController = new AbortController();
  try {
    const res = await get('/api/books', { query: { q, pageSize: 6 }, signal: searchController.signal });
    render(box, res.items.length
      ? res.items.map((b) => html`<a class="search-result" href="#/books/${b.id}"><img src="${b.coverUrl}" alt="" width="54" height="81"><span><strong>${b.title}</strong><small>${b.author} · ${b.category.name}</small></span>${icon('arrowRight')}</a>`)
      : html`<p class="search-overlay__hint">${t('header.searchEmpty')}</p>`);
  } catch (err) {
    if (err.name !== 'AbortError') render(box, html`<p class="search-overlay__hint">${err.detail ?? t('errors.generic')}</p>`);
  }
}, 250);
on(document.body, 'input', '.search-overlay__input', (e) => liveSearch(e.target.value.trim()));
on(document.body, 'click', '[data-action="logout"]', async () => {
  await logout();
  toast(t('auth.loggedOut'), { type: 'success' });
  navigate('/');
});

// ── favorites: the heart button on any book card ─────────────────────────────
on(document.body, 'click', '[data-action="fav"]', async (e, btn) => {
  e.preventDefault();
  if (!session.isAuthed) {
    toast(t('auth.loginToFavorite'));
    return navigate(`/login?next=${encodeURIComponent(currentLocation().full)}`);
  }
  const id = btn.dataset.id;
  const wasOn = btn.classList.contains('is-on');
  btn.classList.toggle('is-on', !wasOn); // optimistic update…
  try {
    const res = wasOn ? await del(`/api/library/favorites/${id}`) : await post(`/api/library/favorites/${id}`);
    document.querySelectorAll(`[data-action="fav"][data-id="${id}"]`).forEach((b) => {
      b.classList.toggle('is-on', res.isFavorite);
      b.setAttribute('aria-pressed', String(res.isFavorite));
    });
    toast(res.isFavorite ? t('book.addedToFavorites') : t('book.removedFromFavorites'), { type: 'success' });
  } catch (err) {
    btn.classList.toggle('is-on', wasOn); // …rolled back if the request fails
    toastError(err);
  }
});

// refresh the user (subscription badge) when the tab becomes visible again
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && session.isAuthed) reloadUser().catch(() => {});
});

if (session.isAuthed) reloadUser().catch(() => {});
startRouter();
