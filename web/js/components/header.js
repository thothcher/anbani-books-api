// The floating header: [search] [links · seal · links] [theme · language] — on phones
// [language] [seal] [MENU]. The menu and the search open as full-screen overlays.
import { html, render, $ } from '../core/dom.js';
import { t, getLang, fmt } from '../core/i18n.js';
import { session } from '../core/session.js';
import { currentLocation } from '../core/router.js';
import { icon, avatar, caps, capsHtml } from '../core/ui.js';

const otherLang = () => (getLang() === 'ka' ? 'EN' : caps('ქარ'));

function subPill() {
  const s = session.subscription;
  const label = s.status === 'none' ? t('status.free') : t(`status.${s.status}`);
  return html`<span class="sub-pill sub-pill--${s.status}">${label}</span>`;
}

function accountMenu(user) {
  return html`<div class="menu" data-menu>
    <button class="account-btn" data-action="menu" aria-haspopup="true" aria-expanded="false">
      ${avatar(user)}<span class="account-btn__name">${user.firstName}</span>${subPill()}
    </button>
    <div class="menu__panel" hidden>
      <div class="menu__head">
        <strong>${user.fullName}</strong><br><span class="small muted">${user.email}</span>
        ${user.role === 'admin' ? html`<div style="margin-top:.45rem"><span class="badge badge--accent">${icon('crown')} Admin</span></div>` : ''}
      </div>
      <div class="menu__sep"></div>
      <a class="menu__item" href="#/library">${icon('library')} ${t('nav.library')}</a>
      <a class="menu__item" href="#/account/membership">${icon('card')} ${t('nav.membership')}</a>
      <a class="menu__item" href="#/account/profile">${icon('user')} ${t('nav.profile')}</a>
      <a class="menu__item" href="#/account/payments">${icon('receipt')} ${t('nav.payments')}</a>
      ${user.role === 'admin' ? html`<a class="menu__item" href="#/admin">${icon('chart')} ${t('nav.admin')}</a>` : ''}
      <div class="menu__sep"></div>
      <button class="menu__item" data-action="logout">${icon('logout')} ${t('nav.logout')}</button>
    </div>
  </div>`;
}

export function renderHeader() {
  const { path } = currentLocation();
  const user = session.user;
  const theme = document.documentElement.dataset.theme;
  const isActive = (match) => (match === '/' ? path === '/' : path.startsWith(match));
  const link = (href, label, match, cls = '') => html`<a class="nav__link ${cls} ${isActive(match) ? 'is-active' : ''}" href="${href}">${capsHtml(label)}</a>`;

  const left = html`${link('#/books', t('nav.catalog'), '/books')}${link('#/pricing', t('nav.pricing'), '/pricing')}${user ? link('#/library', t('nav.library'), '/library') : ''}`;
  const right = user
    ? html`${session.isAdmin ? link('#/admin', t('nav.admin'), '/admin') : ''}${accountMenu(user)}`
    : html`${link('#/login', t('nav.login'), '/login')}${link('#/register', t('nav.register'), '/register', 'nav__link--accent')}`;

  render($('#site-header'), html`
    <div class="header">
      <div class="header__side header__side--desk">
        <button class="hbtn hbtn--round glass" data-action="search" aria-label="${t('header.search')}">${icon('search')}</button>
      </div>
      <nav class="header__pill glass" aria-label="${t('nav.main')}">
        <div class="header__links">${left}</div>
        <a class="header__seal" href="#/" aria-label="${t('brand.home')}"><img src="assets/seal.svg" alt="" width="78" height="78"></a>
        <div class="header__links header__links--end">${right}</div>
      </nav>
      <div class="header__side header__side--end header__side--desk">
        <button class="hbtn hbtn--round glass" data-action="theme" aria-label="${t('header.theme')}">${icon(theme === 'dark' ? 'sun' : 'moon')}</button>
        <button class="hbtn glass" data-action="lang" title="${t('header.language')}">${icon('globe')} ${otherLang()} ${icon('chevronDown', 'chev')}</button>
      </div>
      <div class="header__mobile">
        <div class="header__side"><button class="hbtn glass" data-action="lang" title="${t('header.language')}">${icon('globe')} ${otherLang()}</button></div>
        <a class="header__seal header__seal--mobile" href="#/" aria-label="${t('brand.home')}"><img src="assets/seal.svg" alt="" width="70" height="70"></a>
        <div class="header__side header__side--end"><button class="hbtn glass" data-action="burger" aria-expanded="false">${capsHtml(t('nav.menu'))}</button></div>
      </div>
    </div>`);

  // the overlays live outside the header so they can cover it
  const menuLinks = [
    ['#/', t('nav.home'), '/'],
    ['#/books', t('nav.catalog'), '/books'],
    ['#/pricing', t('nav.pricing'), '/pricing'],
    ...(user ? [['#/library', t('nav.library'), '/library'], ['#/account/profile', t('nav.profile'), '/account']] : [['#/login', t('nav.login'), '/login'], ['#/register', t('nav.register'), '/register']]),
    ...(session.isAdmin ? [['#/admin', t('nav.admin'), '/admin']] : []),
  ];
  render($('#overlays'), html`
    <div class="overlay" data-overlay="menu" hidden role="dialog" aria-modal="true" aria-label="${t('nav.menu')}">
      <button class="hbtn overlay__close" data-action="close-overlay">${capsHtml(t('common.close'))} ${icon('x')}</button>
      <nav class="menu-overlay__links">${menuLinks.map(([href, label, match], i) => html`<a href="${href}" style="--i:${i}" class="${isActive(match) ? 'is-active' : ''}">${capsHtml(label)}</a>`)}</nav>
      <div class="menu-overlay__foot">
        ${user ? html`<div class="menu-overlay__user">${avatar(user)}<div><strong>${user.fullName}</strong><br>${subPill()}</div></div>` : ''}
        <button class="btn btn--sm" data-action="search">${icon('search')} ${t('header.searchShort')}</button>
        <button class="btn btn--sm" data-action="theme">${icon(theme === 'dark' ? 'sun' : 'moon')} ${t('header.theme')}</button>
        <button class="btn btn--sm" data-action="lang">${icon('globe')} ${getLang() === 'ka' ? 'English' : 'ქართული'}</button>
        ${user ? html`<button class="btn btn--sm" data-action="logout">${icon('logout')} ${t('nav.logout')}</button>` : ''}
      </div>
    </div>
    <div class="overlay" data-overlay="search" hidden role="dialog" aria-modal="true" aria-label="${t('header.search')}">
      <button class="hbtn overlay__close" data-action="close-overlay">${capsHtml(t('common.close'))} ${icon('x')}</button>
      <div class="search-overlay__box">
        <form class="search-overlay__form" role="search" data-search>
          ${icon('search')}
          <input class="search-overlay__input" name="q" type="search" placeholder="${t('header.search')}" aria-label="${t('header.search')}" autocomplete="off">
        </form>
        <p class="search-overlay__hint">${t('header.searchHint')}</p>
        <div class="search-results" data-search-results></div>
      </div>
    </div>`);
  document.body.classList.remove('is-locked');
  renderBanner();
}

/** The pill under the header that reacts to the account state. */
export function renderBanner() {
  const el = $('#banner');
  const user = session.user;
  let content = '';
  if (user) {
    const s = session.subscription;
    const days = s.accessUntil ? Math.max(0, Math.ceil((new Date(s.accessUntil) - Date.now()) / 86400000)) : 0;
    if (!user.isVerified) {
      content = html`<div class="site-banner site-banner--warning">${icon('mail')} ${t('banner.verify')} <a class="btn btn--sm" href="#/verify?email=${encodeURIComponent(user.email)}">${t('banner.verifyCta')}</a></div>`;
    } else if (s.status === 'trialing') {
      content = html`<div class="site-banner site-banner--trial">${icon('clock')} ${t('banner.trial', { days })} <a class="btn btn--sm" href="#/pricing">${t('banner.trialCta')}</a></div>`;
    } else if (s.status === 'canceled') {
      content = html`<div class="site-banner">${icon('info')} ${t('banner.canceled', { date: fmt.date(s.accessUntil) })} <a class="btn btn--sm" href="#/account/membership">${t('banner.canceledCta')}</a></div>`;
    } else if (s.status === 'expired') {
      content = html`<div class="site-banner site-banner--danger">${icon('alert')} ${t('banner.expired')} <a class="btn btn--sm" href="#/pricing">${t('banner.expiredCta')}</a></div>`;
    }
  }
  render(el, content);
  document.body.classList.toggle('has-banner', !!content);
}
