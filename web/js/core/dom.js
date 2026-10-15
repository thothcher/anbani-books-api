// Tiny DOM helpers.
//
// html`...` is a tagged template that ESCAPES every interpolated value, so data
// from the API (titles, names, review comments…) can never inject HTML. Only
// values wrapped in raw() or produced by another html`` are inserted as markup.

class SafeHtml {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);

function toHtml(v) {
  if (v == null || v === false || v === true) return '';
  if (v instanceof SafeHtml) return v.value;
  if (Array.isArray(v)) return v.map(toHtml).join('');
  return escapeHtml(v);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += toHtml(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

/** Inserts trusted markup as-is (icons, markup we built ourselves). Never use it for API data. */
export const raw = (s) => new SafeHtml(String(s ?? ''));

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function render(el, content) {
  el.innerHTML = toHtml(content);
  return el;
}

/** Event delegation: one listener on `root` for all current and future matching elements. */
export function on(root, event, selector, handler, options) {
  const listener = (e) => {
    const target = e.target.closest?.(selector);
    if (target && root.contains(target)) handler(e, target);
  };
  root.addEventListener(event, listener, options);
  return () => root.removeEventListener(event, listener, options);
}

export function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/** Reads a <form> into a plain object. Numbers stay strings — convert where needed. */
export function formData(form) {
  const data = {};
  for (const [k, v] of new FormData(form).entries()) {
    if (v instanceof File) continue;
    data[k] = typeof v === 'string' ? v.trim() : v;
  }
  return data;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
