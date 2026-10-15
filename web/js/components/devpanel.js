// The developer panel: an "X-ray" of the website for students.
// Shows every API call (request + response), the sandbox inbox (verification codes),
// time travel for subscriptions, test cards and the decoded JWT.
import { html, raw, render, $, on, escapeHtml } from '../core/dom.js';
import { t, fmt } from '../core/i18n.js';
import { netlog, get, post, del, API_BASE } from '../core/api.js';
import { session, reloadUser, decodeJwt, tokenSecondsLeft, refreshTokens, onSessionChange } from '../core/session.js';
import { resolve } from '../core/router.js';
import { icon, toast, toastError, copyText } from '../core/ui.js';

const config = window.ANBANI_CONFIG ?? {};
let open = false;
let tab = 'network';
let expanded = new Set();
let inboxEmail = '';
let timer = null;

export function mountDevPanel() {
  if (config.showDevPanel === false) return;
  const root = $('#devpanel-root');
  render(root, html`
    <button class="dev-fab" data-dev="toggle" aria-label="${t('dev.open')}">${icon('code')} API <span class="dev-fab__count" data-dev-count>0</span></button>
    <aside class="devpanel" aria-label="${t('dev.title')}">
      <div class="devpanel__head">
        <h2>${raw('&lt;/&gt;')} <span>${t('dev.title')}</span></h2>
        <a class="btn btn--ghost btn--sm" href="${API_BASE}/docs" target="_blank" rel="noopener">${t('dev.docs')}</a>
        <button class="btn btn--ghost btn--icon btn--sm" data-dev="toggle" aria-label="${t('common.close')}">${icon('x')}</button>
      </div>
      <div class="devpanel__tabs" role="tablist">
        ${['network', 'inbox', 'time', 'cards', 'token'].map((k) => html`<button data-dev-tab="${k}" role="tab">${t('dev.tabs.' + k)}</button>`)}
      </div>
      <div class="devpanel__body" data-dev-body></div>
    </aside>`);

  on(root, 'click', '[data-dev="toggle"]', () => toggle());
  on(root, 'click', '[data-dev-tab]', (e, el) => { tab = el.dataset.devTab; draw(); });
  on(root, 'click', '[data-net-id]', (e, el) => {
    const id = Number(el.dataset.netId);
    expanded.has(id) ? expanded.delete(id) : expanded.add(id);
    draw();
  });
  on(root, 'click', '[data-dev-action]', (e, el) => action(el.dataset.devAction, el));
  on(root, 'submit', 'form[data-inbox]', (e) => { e.preventDefault(); inboxEmail = new FormData(e.target).get('email'); draw(); });

  netlog.subscribe(() => {
    const count = $('[data-dev-count]');
    if (count) count.textContent = netlog.entries.length;
    if (open && tab === 'network') draw();
  });
  onSessionChange(() => { if (open && (tab === 'token' || tab === 'time')) draw(); });
  window.addEventListener('devpanel:open', (e) => { tab = e.detail || tab; toggle(true); });
  document.addEventListener('keydown', (e) => {
    if (e.key === '`' && (e.ctrlKey || e.metaKey)) toggle();
    if (e.key === 'Escape' && open) toggle(false);
  });
}

function toggle(force) {
  open = force ?? !open;
  $('.devpanel').classList.toggle('is-open', open);
  $('.dev-fab').classList.toggle('is-hidden', open);
  if (open) draw();
  else clearInterval(timer);
}

async function draw() {
  clearInterval(timer);
  document.querySelectorAll('[data-dev-tab]').forEach((b) => b.classList.toggle('is-active', b.dataset.devTab === tab));
  const body = $('[data-dev-body]');
  if (tab === 'network') return render(body, networkTab());
  if (tab === 'cards') return render(body, await cardsTab());
  if (tab === 'token') {
    render(body, tokenTab());
    timer = setInterval(() => { const el = $('[data-token-timer]'); if (el) el.textContent = countdown(); }, 1000);
    return;
  }
  if (tab === 'time') return render(body, await timeTab());
  if (tab === 'inbox') return render(body, await inboxTab());
}

// ── network ──────────────────────────────────────────────────────────────────
function networkTab() {
  if (!netlog.entries.length) return html`<p>${t('dev.noRequests')}</p>`;
  return html`
    <div class="row row--between" style="margin-bottom:.6rem">
      <span class="xsmall" style="color:#93877a">${t('dev.networkHint')}</span>
      <button class="btn btn--sm" data-dev-action="clear-log">${t('dev.clear')}</button>
    </div>
    <ul class="netlog">${netlog.entries.map((e) => {
      const ok = e.status && e.status < 400;
      const statusClass = e.status == null ? 'pending' : ok ? 'ok' : 'err';
      return html`<li class="netlog__item">
        <button class="netlog__row" data-net-id="${e.id}">
          <span class="netlog__method netlog__method--${e.method}">${e.method}</span>
          <span class="netlog__path" title="${e.url}">${e.path}</span>
          <span class="netlog__status netlog__status--${statusClass}">${e.status ?? '…'}</span>
          <span class="netlog__ms">${e.ms != null ? e.ms + ' ms' : ''}</span>
        </button>
        ${expanded.has(e.id) ? html`<div class="netlog__detail">
          <h4>${t('dev.request')}</h4>
          <pre class="json">${raw(highlight({ url: e.url, headers: e.requestHeaders, ...(e.requestBody !== undefined ? { body: e.requestBody } : {}) }))}</pre>
          <h4>${t('dev.response')} · ${e.status}</h4>
          <pre class="json">${raw(highlight(e.responseBody ?? null))}</pre>
          ${e.hint ? html`<div class="netlog__hint">${e.hint}</div>` : ''}
          ${hintFor(e)}
          <div class="row" style="margin-top:.6rem"><button class="btn btn--sm" data-dev-action="curl" data-id="${e.id}">${icon('copy')} ${t('dev.copyCurl')}</button></div>
        </div>` : ''}
      </li>`;
    })}</ul>`;
}

function hintFor(e) {
  const code = e.responseBody?.code;
  if (!code) return '';
  const hint = t(`dev.hints.${code}`);
  return hint === `dev.hints.${code}` ? '' : html`<div class="netlog__hint">💡 ${hint}</div>`;
}

/** Pretty-prints JSON with syntax colors (input is escaped first). */
function highlight(value) {
  const json = escapeHtml(JSON.stringify(value, null, 2) ?? 'null');
  return json.replace(/(&quot;(?:[^&]|&(?!quot;))*?&quot;)(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, (m, str, colon, lit) => {
    if (str) return colon ? `<span class="k">${str}</span>${colon}` : `<span class="s">${str}</span>`;
    if (lit) return `<span class="b">${m}</span>`;
    return `<span class="n">${m}</span>`;
  });
}

function curlFor(e) {
  const parts = [`curl -X ${e.method} '${e.url}'`, `  -H 'X-API-KEY: ${config.apiKey}'`];
  if (e.requestHeaders.Authorization && session.accessToken) parts.push(`  -H 'Authorization: Bearer ${session.accessToken}'`);
  if (e.requestBody && typeof e.requestBody === 'object') parts.push(`  -H 'Content-Type: application/json'`, `  -d '${JSON.stringify(e.requestBody)}'`);
  return parts.join(' \\\n');
}

// ── inbox ────────────────────────────────────────────────────────────────────
async function inboxTab() {
  const email = inboxEmail || session.user?.email || '';
  const form = html`<form data-inbox class="row" style="margin-bottom:1rem">
      <input class="input grow" name="email" type="email" value="${email}" placeholder="student@example.com" required>
      <button class="btn">${icon('refresh')}</button>
    </form>`;
  if (!email) return html`${form}<p>${t('dev.inboxHint')}</p>`;
  try {
    const res = await get('/api/sandbox/inbox', { query: { email, pageSize: 15 } });
    if (!res.items.length) return html`${form}<p>${t('dev.inboxEmpty')}</p>`;
    return html`${form}
      <p class="xsmall">${t('dev.inboxExplain')}</p>
      ${res.items.map((m, i) => html`<div class="mail">
        <div class="mail__head">
          <span class="mail__subject">${m.subject}</span>
          ${m.code ? html`<button class="mail__code" data-dev-action="copy" data-text="${m.code}">${m.code} ${icon('copy')}</button>` : ''}
          <span class="mail__time">${fmt.relative(m.createdAt)}</span>
        </div>
        ${i === 0 ? html`<iframe sandbox="" title="${m.subject}" srcdoc="${m.html}"></iframe>` : ''}
      </div>`)}
      <button class="btn btn--sm" data-dev-action="clear-inbox" data-email="${email}">${icon('trash')} ${t('dev.clearInbox')}</button>`;
  } catch (err) {
    return html`${form}<p>${err.detail}</p>`;
  }
}

// ── time travel ──────────────────────────────────────────────────────────────
async function timeTab() {
  if (!session.isAuthed) return html`<p>${t('dev.loginFirst')}</p>`;
  try {
    const clock = await get('/api/sandbox/clock');
    return html`
      <p>${t('dev.timeExplain')}</p>
      <dl class="kv-dark">
        <dt>${t('dev.realTime')}</dt><dd>${fmt.dateTime(clock.serverTime)}</dd>
        <dt>${t('dev.yourTime')}</dt><dd>${fmt.dateTime(clock.userTime)}</dd>
        <dt>${t('dev.offset')}</dt><dd>+${clock.offsetDays} ${t('dev.days')}</dd>
        <dt>${t('dev.subscription')}</dt><dd>${t('status.' + session.subscription.status)}${session.subscription.accessUntil ? ' → ' + fmt.short(session.subscription.accessUntil) : ''}</dd>
      </dl>
      <h3>${t('dev.jump')}</h3>
      <div class="time-buttons">
        ${[1, 3, 7, 8, 31, 366].map((d) => html`<button class="btn btn--sm" data-dev-action="travel" data-days="${d}">+${d} ${t('dev.days')}</button>`)}
      </div>
      <p class="xsmall" style="margin-top:.75rem">${t('dev.timeTips')}</p>
      <h3>${t('dev.reset')}</h3>
      <p class="xsmall">${t('dev.resetExplain')}</p>
      <button class="btn btn--sm" data-dev-action="reset-sub">${icon('refresh')} ${t('dev.resetButton')}</button>`;
  } catch (err) {
    return html`<p>${err.detail}</p>`;
  }
}

// ── test cards ───────────────────────────────────────────────────────────────
async function cardsTab() {
  try {
    const cards = await get('/api/sandbox/test-cards');
    return html`<p>${t('dev.cardsExplain')}</p>
      <div class="dev-cards">${cards.map((c) => html`<button data-dev-action="copy" data-text="${c.number.replace(/ /g, '')}">
        <code>${c.number}</code><span>${c.brand}</span><small>${c.description}</small></button>`)}</div>
      <p class="xsmall" style="margin-top:1rem">${t('dev.cardsAny')}</p>`;
  } catch (err) {
    return html`<p>${err.detail}</p>`;
  }
}

// ── token ────────────────────────────────────────────────────────────────────
function countdown() {
  const s = tokenSecondsLeft();
  if (s == null) return '—';
  if (s <= 0) return t('dev.expired');
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function tokenTab() {
  if (!session.isAuthed) return html`<p>${t('dev.loginFirst')}</p>`;
  const claims = decodeJwt();
  return html`
    <p>${t('dev.tokenExplain')}</p>
    <h3>${t('dev.expiresIn')}</h3>
    <div class="token-timer" data-token-timer>${countdown()}</div>
    <h3>${t('dev.claims')}</h3>
    <pre class="json">${raw(highlight(claims))}</pre>
    <dl class="kv-dark" style="margin-top:.75rem">
      <dt>sub</dt><dd>${t('dev.claimSub')}</dd>
      <dt>tid</dt><dd>${t('dev.claimTid')}</dd>
      <dt>role</dt><dd>${t('dev.claimRole')}</dd>
      <dt>exp</dt><dd>${claims?.exp ? new Date(claims.exp * 1000).toLocaleString() : ''}</dd>
    </dl>
    <h3>${t('dev.refreshToken')}</h3>
    <p class="xsmall">${t('dev.refreshExplain')}</p>
    <div class="row"><button class="btn btn--sm" data-dev-action="refresh">${icon('refresh')} POST /api/auth/refresh</button></div>`;
}

// ── actions ──────────────────────────────────────────────────────────────────
async function action(name, el) {
  try {
    if (name === 'clear-log') { netlog.clear(); expanded = new Set(); draw(); }
    if (name === 'copy') copyText(el.dataset.text);
    if (name === 'curl') copyText(curlFor(netlog.entries.find((x) => x.id === Number(el.dataset.id))));
    if (name === 'clear-inbox') { await del('/api/sandbox/inbox', { query: { email: el.dataset.email } }); draw(); }
    if (name === 'refresh') { await refreshTokens(); toast(t('dev.refreshed'), { type: 'success' }); draw(); }
    if (name === 'travel') {
      el.classList.add('is-loading');
      await post('/api/sandbox/time-travel', { days: Number(el.dataset.days) });
      await reloadUser();
      toast(t('dev.traveled', { days: el.dataset.days }), { type: 'success' });
      resolve();
      draw();
    }
    if (name === 'reset-sub') {
      await post('/api/sandbox/reset-subscription');
      await reloadUser();
      toast(t('dev.resetDone'), { type: 'success' });
      resolve();
      draw();
    }
  } catch (err) {
    el.classList.remove('is-loading');
    toastError(err);
  }
}
