import { html, render } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { capsHtml, cta } from '../core/ui.js';

export default {
  title: () => t('notFound.title'),
  render(view, ctx) {
    render(view, html`<div class="not-found">
      <div>
        <img class="not-found__seal" src="assets/seal.svg" alt="" width="150" height="150">
        <span class="kicker">${capsHtml(t('notFound.kicker'))}</span>
        <h1 class="caps caps--l">${capsHtml(t('notFound.heading'))}</h1>
        <p>${t('notFound.text', { path: ctx.path })}</p>
        <div class="row" style="justify-content:center">
          ${cta(t('nav.catalog'), { href: '#/books' })}
          <a class="btn btn--lg" href="#/">${t('notFound.home')}</a>
        </div>
      </div>
    </div>`);
  },
};
