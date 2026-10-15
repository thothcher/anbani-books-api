// The footer: a big statement over a dim wall of covers, then a glass panel with the links.
import { html, render, $ } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { API_BASE, get } from '../core/api.js';
import { session } from '../core/session.js';
import { caps, capsHtml, cta } from '../core/ui.js';

let wallCovers = null; // loaded once, reused when the footer re-renders

function footerCta() {
  if (!session.isAuthed) return cta(t('home.ctaTrial'), { href: '#/register' });
  if (session.subscription.hasAccess) return cta(t('home.ctaContinue'), { href: '#/library' });
  return cta(t('home.ctaSubscribe'), { href: '#/pricing' });
}

export function renderFooter() {
  const host = API_BASE.replace(/^https?:\/\//, '');
  render($('#site-footer'), html`
    <div class="footer__wall" aria-hidden="true" data-footer-wall></div>
    <div class="container on-dark" style="background:none">
      <div class="footer__statement" data-reveal>
        <p class="caps caps--l">${capsHtml(t('footer.statementA'))} <small>${caps(t('footer.statementB'))}</small> ${capsHtml(t('footer.statementC'))}</p>
        <div style="margin-top:1.75rem">${footerCta()}</div>
      </div>
      <div class="footer__panel">
        <div class="footer__brand">
          <a href="#/" aria-label="${t('brand.home')}"><img src="assets/seal.svg" alt="" width="74" height="74"></a>
          <p>${t('footer.about')}</p>
        </div>
        <div>
          <h4>${capsHtml(t('footer.library'))}</h4>
          <ul>
            <li><a href="#/books">${t('nav.catalog')}</a></li>
            <li><a href="#/books?language=ka">${t('footer.georgian')}</a></li>
            <li><a href="#/books?isFree=true">${t('footer.free')}</a></li>
            <li><a href="#/pricing">${t('nav.pricing')}</a></li>
          </ul>
        </div>
        <div>
          <h4>${capsHtml(t('footer.account'))}</h4>
          <ul>
            <li><a href="#/library">${t('nav.library')}</a></li>
            <li><a href="#/account/membership">${t('nav.membership')}</a></li>
            <li><a href="#/account/payments">${t('nav.payments')}</a></li>
          </ul>
        </div>
        <div>
          <h4>${capsHtml(t('footer.developers'))}</h4>
          <ul>
            <li><a href="${API_BASE}/docs" target="_blank" rel="noopener">${t('footer.docs')}</a></li>
            <li><a href="${API_BASE}/swagger" target="_blank" rel="noopener">Swagger UI</a></li>
            <li><a href="${API_BASE}/" target="_blank" rel="noopener">${t('footer.portal')}</a></li>
          </ul>
        </div>
        <div class="footer__contact">
          <div><small>${capsHtml(t('footer.apiLabel'))}</small><span class="big api-status" data-api-status>${t('footer.apiChecking')}</span></div>
          <div><small>${capsHtml(t('footer.docsLabel'))}</small><a href="${API_BASE}/docs" target="_blank" rel="noopener">${host}/docs</a></div>
          <div><small>${capsHtml(t('footer.academyLabel'))}</small><span class="big">STEP IT Academy</span></div>
        </div>
      </div>
      <div class="footer__bottom"><span>${capsHtml(t('footer.credits'))}</span><span>${capsHtml(t('footer.madeFor'))}</span></div>
    </div>`);
  checkApi();
  drawWall();
}

async function checkApi() {
  const el = $('[data-api-status]');
  try {
    const res = await fetch(`${API_BASE}/health`);
    el.classList.toggle('is-up', res.ok);
    el.classList.toggle('is-down', !res.ok);
    el.textContent = res.ok ? t('footer.apiUp') : t('footer.apiDown');
  } catch {
    el.classList.add('is-down');
    el.textContent = t('footer.apiDown');
  }
}

async function drawWall() {
  try {
    wallCovers ??= (await get('/api/books', { query: { sort: 'popular', pageSize: 24 } })).items.map((b) => b.coverUrl);
  } catch {
    wallCovers = [];
  }
  const el = $('[data-footer-wall]');
  if (el && wallCovers.length) render(el, [...wallCovers, ...wallCovers, ...wallCovers].map((src) => html`<img src="${src}" alt="" loading="lazy">`));
}
