// Shared UI pieces: icons, toasts, modals, states, stars, pagination, form errors.
import { html, raw, $, $$, render, on } from './dom.js';
import { t } from './i18n.js';

// Stroke icons in the style of Lucide (ISC license).
const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  heart: '<path d="M19.5 12.6 12 20l-7.5-7.4A4.9 4.9 0 0 1 12 6a4.9 4.9 0 0 1 7.5 6.6z"/>',
  book: '<path d="M4 19.5V5a2 2 0 0 1 2-2h14v15H6.5A2.5 2.5 0 0 0 4 20.5 2.5 2.5 0 0 0 6.5 23H20v-5"/>',
  bookOpen: '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>',
  library: '<path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M16 4a4 4 0 0 1 0 8"/><path d="M22 21a7 7 0 0 0-4-6.3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  star: '<path d="m12 2.8 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3L12 17.3l-5.7 3 1.1-6.3-4.6-4.5 6.4-.9z" fill="currentColor" stroke="none"/>',
  starLine: '<path d="m12 2.8 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3L12 17.3l-5.7 3 1.1-6.3-4.6-4.5 6.4-.9z"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  upload: '<path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M5 3h14"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 15h10l1-15"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
  chart: '<path d="M3 3v18h18"/><path d="M8 17V11"/><path d="M13 17V7"/><path d="M18 17v-4"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  code: '<path d="m8 7-5 5 5 5"/><path d="m16 7 5 5-5 5"/><path d="m14 4-4 16"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5"/><path d="m11 18-6-6 6-6"/>',
  arrowUpRight: '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
  shuffle: '<path d="M3 7h3c4 0 6 10 10 10h5"/><path d="m18 14 3 3-3 3"/><path d="M3 17h3c1.6 0 2.8-1.6 3.9-3.6"/><path d="M13.9 9.6C15 8 16.3 7 18 7h3"/><path d="m18 4 3 3-3 3"/>',
  userPlus: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M19 8v6M16 11h6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-5"/><path d="M12 8h.01"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  xCircle: '<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 4"/><path d="M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.8 9.8 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  sparkles: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  maximize: '<path d="M8 3H3v5M21 8V3h-5M16 21h5v-5M3 16v5h5"/>',
  zoomIn: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M11 8v6M8 11h6"/>',
  zoomOut: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6"/>',
  toc: '<path d="M10 6h11M10 12h11M10 18h11"/><path d="M4 6h1M4 12h1M4 18h1"/>',
  palette: '<path d="M12 3a9 9 0 0 0 0 18c1.1 0 1.5-.8 1.5-1.5 0-1-.8-1.3-.8-2.3 0-.8.7-1.5 1.5-1.5H17a4 4 0 0 0 4-4c0-4.7-4-8.7-9-8.7z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  gift: '<rect x="3" y="8" width="18" height="5" rx="1"/><path d="M5 13v8h14v-8M12 8v13"/><path d="M12 8S10.5 3 8 3a2.5 2.5 0 0 0 0 5zM12 8s1.5-5 4-5a2.5 2.5 0 0 1 0 5z"/>',
  trending: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  crown: '<path d="m3 7 4 4 5-7 5 7 4-4-2 12H5z"/>',
  wallet: '<path d="M20 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/><path d="M21 11h-5a2 2 0 0 0 0 4h5z"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>',
  dot: '<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>',
  quote: '<path d="M7 7h4v6H5v-2a4 4 0 0 1 2-4zM17 7h4v6h-6v-2a4 4 0 0 1 2-4z"/>',
};

export function icon(name, cls = '') {
  return raw(`<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] ?? ''}</svg>`);
}

// ── display capitals ─────────────────────────────────────────────────────────
// The condensed headlines are set in capitals. CSS text-transform does not touch
// Georgian (browsers exclude it on purpose), so caps() uses toUpperCase(), which turns
// Mkhedruli into Mtavruli — the Georgian capital letters (Unicode 11+).
const GEORGIAN = /[ა-ჿ]/;
export const caps = (s) => String(s ?? '').toUpperCase();

/** Capitals for the eye, the normal spelling for screen readers (some voices can't read Mtavruli). */
export function capsHtml(s) {
  const text = String(s ?? '');
  return GEORGIAN.test(text)
    ? html`<span aria-hidden="true">${caps(text)}</span><span class="visually-hidden">${text}</span>`
    : html`${caps(text)}`;
}

/**
 * The split button — a label pill and a round arrow.
 *   cta('Read', { href: '#/books/1' })                        → <a>
 *   cta('Start', { action: 'trial', data: { plan: 2 } })      → <button data-action="trial" data-plan="2">
 * variant: 'latte' | 'sun' | 'red' | 'ink' — several can be combined: 'latte sun'
 */
export function cta(label, { href, action, variant = '', icon: ic, data = {}, type = 'button', block = false, sm = false, arrow = 'arrowRight', disabled = false } = {}) {
  const cls = ['cta', ...variant.split(' ').filter(Boolean).map((v) => 'cta--' + v), sm ? 'cta--sm' : '', block ? 'cta--block' : ''].filter(Boolean).join(' ');
  const dataAttrs = Object.entries(data).map(([k, v]) => html` data-${k}="${v}"`);
  const inner = html`<span class="cta__label">${ic ? icon(ic) : ''}${label}</span><span class="cta__arrow" aria-hidden="true">${icon(arrow)}</span>`;
  return href
    ? html`<a class="${cls}" href="${href}"${dataAttrs}>${inner}</a>`
    : html`<button class="${cls}" type="${type}"${action ? html` data-action="${action}"` : ''}${dataAttrs}${disabled ? raw(' disabled') : ''}>${inner}</button>`;
}

/** The opening of an inner page: a kicker and a giant condensed title. */
export function pageHero({ kicker, title, lead, align = 'center', compact = false, extra = '' }) {
  return html`<header class="page-hero ${align === 'left' ? 'page-hero--left' : ''} ${compact ? 'page-hero--compact' : ''}" data-reveal>
    ${kicker ? html`<span class="kicker">${capsHtml(kicker)}</span>` : ''}
    <h1 class="caps caps--xl">${capsHtml(title)}</h1>
    ${lead ? html`<p class="page-hero__lead">${lead}</p>` : ''}
    ${extra}
  </header>`;
}

let ringSeq = 0;
/** A slowly turning circular label around a value — the "seal" on the book page. */
export function ringBadge(label, value, { size = 128, cls = '' } = {}) {
  const id = `ring-${++ringSeq}`;
  const text = `${caps(label)} • `.repeat(3);
  return html`<span class="ring-badge ${cls}" style="--size:${size}px" role="img" aria-label="${label}: ${value}">
    <svg viewBox="0 0 100 100" aria-hidden="true"><defs><path id="${id}" d="M50,50 m-39,0 a39,39 0 1,1 78,0 a39,39 0 1,1 -78,0"/></defs>
      <text><textPath href="#${id}" textLength="243" lengthAdjust="spacing">${text}</textPath></text></svg>
    <span class="ring-badge__value" aria-hidden="true">${value}</span>
  </span>`;
}

// ── toasts ───────────────────────────────────────────────────────────────────
export function toast(message, { type = 'info', code } = {}) {
  const root = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  render(el, html`${icon(type === 'success' ? 'checkCircle' : type === 'error' ? 'xCircle' : 'info')}<div>${message}${code ? html`<span class="toast__code">${code}</span>` : ''}</div>`);
  root.appendChild(el);
  setTimeout(() => { el.classList.add('is-leaving'); setTimeout(() => el.remove(), 220); }, type === 'error' ? 5200 : 3200);
}

/** Shows an API error: the localized message from the API + its machine code. */
export function toastError(err) {
  if (err?.name === 'AbortError') return;
  toast(err?.detail || err?.message || t('errors.generic'), { type: 'error', code: err?.code });
}

// ── modal ────────────────────────────────────────────────────────────────────
export function modal({ title, body, wide = false, onMount }) {
  const root = document.getElementById('modal-root');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  render(backdrop, html`
    <div class="modal ${wide ? 'modal--wide' : ''}" role="dialog" aria-modal="true" aria-label="${title}">
      <div class="modal__head"><h2>${title}</h2><button class="btn btn--ghost btn--icon btn--sm" data-close aria-label="${t('common.close')}">${icon('x')}</button></div>
      <div class="modal__body">${body}</div>
    </div>`);
  const previous = document.activeElement;
  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    previous?.focus?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
  on(backdrop, 'click', '[data-close]', close);
  root.appendChild(backdrop);
  const dialog = $('.modal', backdrop);
  ($('input, select, textarea, button:not([data-close])', dialog) ?? dialog).focus?.();
  onMount?.(dialog, close);
  return { el: dialog, close };
}

export function confirmDialog({ title, text, confirmText, danger = false, typeToConfirm }) {
  return new Promise((resolve) => {
    let done = false;
    const { el, close } = modal({
      title,
      body: html`
        <p class="muted">${text}</p>
        ${typeToConfirm ? html`<div class="field"><label class="field__label" for="confirm-input">${t('common.typeToConfirm', { word: typeToConfirm })}</label><input id="confirm-input" class="input" autocomplete="off"></div>` : ''}
        <div class="modal__foot">
          <button class="btn" data-close>${t('common.cancel')}</button>
          <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-ok ${typeToConfirm ? 'disabled' : ''}>${confirmText ?? t('common.confirm')}</button>
        </div>`,
    });
    const ok = $('[data-ok]', el);
    if (typeToConfirm) $('#confirm-input', el).addEventListener('input', (e) => { ok.disabled = e.target.value.trim() !== typeToConfirm; });
    ok.addEventListener('click', () => { done = true; close(); resolve(true); });
    const observer = new MutationObserver(() => { if (!el.isConnected) { observer.disconnect(); if (!done) resolve(false); } });
    observer.observe(document.getElementById('modal-root'), { childList: true });
  });
}

// ── states ───────────────────────────────────────────────────────────────────
export const loadingBlock = () => html`<div class="loading-block"><div class="spinner" role="status" aria-label="${t('common.loading')}"></div></div>`;

export function emptyState({ letter = 'ა', title, text, action }) {
  return html`<div class="state"><div class="state__art">${letter}</div><h3>${title}</h3>${text ? html`<p>${text}</p>` : ''}${action ?? ''}</div>`;
}

export function errorState(err, { retry = true } = {}) {
  return html`<div class="state">
    <div class="state__art">!</div>
    <h3>${t('errors.title')}</h3>
    <p>${err?.detail || err?.message || t('errors.generic')}</p>
    ${err?.code ? html`<span class="state__code">${err.status ? `HTTP ${err.status} · ` : ''}${err.code}</span>` : ''}
    ${retry ? html`<button class="btn" data-action="retry">${icon('refresh')} ${t('common.retry')}</button>` : ''}
  </div>`;
}

export function skeletonGrid(n = 8) {
  return html`<div class="book-grid">${Array.from({ length: n }, () => html`<div><div class="skeleton skeleton--cover"></div><div class="skeleton skeleton--line"></div><div class="skeleton skeleton--line short"></div></div>`)}</div>`;
}

// ── stars ────────────────────────────────────────────────────────────────────
export function stars(rating, { size = '' } = {}) {
  const full = Math.round(rating ?? 0);
  return html`<span class="stars ${size ? 'stars--' + size : ''}" aria-label="${t('book.ratingOf', { rating: (rating ?? 0).toFixed(1) })}">${[1, 2, 3, 4, 5].map((i) => html`<span class="${i <= full ? '' : 'is-empty'}">${icon('star')}</span>`)}</span>`;
}

// ── pagination ───────────────────────────────────────────────────────────────
export function pagination({ page, totalPages }) {
  if (!totalPages || totalPages <= 1) return '';
  const pages = new Set([1, totalPages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= totalPages));
  const sorted = [...pages].sort((a, b) => a - b);
  const items = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) items.push(html`<span>…</span>`);
    items.push(html`<button data-page="${p}" class="${p === page ? 'is-active' : ''}" aria-current="${p === page ? 'page' : 'false'}">${p}</button>`);
  });
  return html`<nav class="pagination" aria-label="${t('common.pagination')}">
    <button data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''} aria-label="${t('common.prev')}">${icon('chevronLeft')}</button>
    ${items}
    <button data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''} aria-label="${t('common.next')}">${icon('chevronRight')}</button>
  </nav>`;
}

// ── forms ────────────────────────────────────────────────────────────────────
/**
 * Puts API validation errors ({ errors: { "email": ["..."], "card.number": ["..."] } })
 * under the matching inputs (name="email", name="card.number"). Returns true if any was shown.
 */
export function showFormErrors(form, err) {
  clearFormErrors(form);
  if (!err?.errors) return false;
  let shown = false;
  for (const [field, messages] of Object.entries(err.errors)) {
    const input = form.querySelector(`[name="${CSS.escape(field)}"]`) ?? form.querySelector(`[data-error-for="${CSS.escape(field)}"]`);
    const wrap = input?.closest('.field');
    if (!wrap) continue;
    wrap.classList.add('has-error');
    const box = $('.field__error', wrap);
    if (box) box.textContent = messages.join(' ');
    if (!shown) input.focus?.();
    shown = true;
  }
  return shown;
}

export function clearFormErrors(form) {
  $$('.field.has-error', form).forEach((f) => f.classList.remove('has-error'));
  $$('.field__error', form).forEach((e) => { e.textContent = ''; });
}

export function setBusy(button, busy) {
  if (!button) return;
  button.classList.toggle('is-loading', busy);
  button.disabled = busy;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast(t('common.copied'), { type: 'success' });
  } catch {
    toast(text);
  }
}

export function avatar(user, cls = '') {
  if (!user) return '';
  const initials = `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase() || '?';
  return user.avatarUrl
    ? html`<span class="avatar ${cls}"><img src="${user.avatarUrl}" alt=""></span>`
    : html`<span class="avatar ${cls}" aria-hidden="true">${initials}</span>`;
}

/** Badge for a subscription status: none | trialing | active | canceled | expired */
export function statusBadge(status) {
  const map = { trialing: 'info', active: 'success', canceled: 'warning', expired: 'danger', none: '' };
  return html`<span class="badge badge--dot ${map[status] ? 'badge--' + map[status] : ''}">${t(`status.${status}`)}</span>`;
}
