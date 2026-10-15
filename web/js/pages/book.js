// Book details. The buttons depend on `book.access.reason` from the API:
//   free | trial | subscription | admin  → "Read"
//   loginRequired                         → "Sign in to read"
//   subscriptionRequired                  → "Start free trial" / "Subscribe"
//   noFile                                → "Coming soon"
import { html, render, on, $, $$, formData, sleep } from '../core/dom.js';
import { t, fmt } from '../core/i18n.js';
import { get, post, put, del } from '../core/api.js';
import { session, reloadUser } from '../core/session.js';
import { navigate, currentLocation } from '../core/router.js';
import { icon, stars, loadingBlock, errorState, toast, toastError, confirmDialog, setBusy, avatar, showFormErrors, copyText, emptyState, cta, capsHtml, ringBadge } from '../core/ui.js';
import { cover, tile } from '../components/bookCard.js';
import { coverColor, luminance } from '../core/color.js';

let book;
let sub;
let plans = [];
let reviews = { items: [], page: 1, totalPages: 1, totalItems: 0 };
let myReview = null;
let reviewSort = 'newest';
let editing = false;

export default {
  title: () => book?.title ?? t('book.title'),
  async render(view, ctx) {
    const id = ctx.params.id;
    render(view, html`<div class="page-loading">${loadingBlock()}</div>`);
    editing = false;
    const load = async () => {
      [book, sub, plans] = await Promise.all([
        get(`/api/books/${id}`),
        session.isAuthed ? get('/api/subscription') : Promise.resolve(null),
        get('/api/plans'),
      ]);
      document.title = `${book.title} · Anbani`;
      const colour = coverColor(book.coverUrl);
      const early = await Promise.race([colour, sleep(600).then(() => undefined)]);
      render(view, page(early));
      if (early === undefined) {
        colour.then((c) => {
          if (!c || !view.isConnected) return;
          $('[data-stage]', view)?.setAttribute('style', stageStyle(c));
          $('[data-rings]', view)?.setAttribute('style', ringsStyle(c));
        });
      }
      loadReviews(view, 1);
      loadRelated(view);
    };
    try { await load(); } catch (err) {
      render(view, html`<div class="page container">${err.status === 404
        ? emptyState({ letter: 'ჭ', title: t('book.notFound'), text: err.detail, action: html`<a class="btn" href="#/books">${t('book.backToCatalog')}</a>` })
        : errorState(err)}</div>`);
    }

    const off = [
      on(view, 'click', '[data-action="retry"]', () => load().catch(() => {})),
      on(view, 'click', '[data-action="read"]', (e, b) => navigate(`/read/${book.id}${b.dataset.page ? '?page=' + b.dataset.page : ''}`)),
      on(view, 'click', '[data-action="preview"]', () => navigate(`/preview/${book.id}`)),
      on(view, 'click', '[data-action="login"]', () => navigate(`/login?next=${encodeURIComponent(currentLocation().full)}`)),
      on(view, 'click', '[data-action="share"]', () => copyText(location.href)),
      on(view, 'click', '[data-action="download"]', async (e, btn) => {
        setBusy(btn, true);
        try {
          const link = await get(`/api/books/${book.id}/download`);
          window.location.href = link.url; // the signed link answers with Content-Disposition: attachment
        } catch (err) { toastError(err); } finally { setBusy(btn, false); }
      }),
      on(view, 'click', '[data-action="trial"]', async (e, btn) => {
        setBusy(btn, true);
        try {
          const plan = plans.find((p) => p.isPopular) ?? plans[0];
          await post('/api/subscription/trial', { planId: plan.id });
          await reloadUser();
          toast(t('pricing.trialStarted'), { type: 'success' });
          await load();
        } catch (err) { setBusy(btn, false); toastError(err); }
      }),
      on(view, 'click', '[data-toc]', (e, b) => {
        const pageNo = Number(b.dataset.toc);
        if (book.access.canRead) navigate(`/read/${book.id}?page=${pageNo}`);
        else if (book.access.canPreview && pageNo <= book.previewPages) navigate(`/preview/${book.id}?page=${pageNo}`);
        else toast(t('book.tocLocked'));
      }),
      on(view, 'click', '[data-ring]', (e, b) => {
        $$('[data-ring]', view).forEach((x) => { x.classList.toggle('is-active', x === b); x.setAttribute('aria-selected', String(x === b)); });
        render($('[data-ring-panel]', view), ringPanel(b.dataset.ring));
      }),
      on(view, 'change', '[data-review-sort]', (e) => { reviewSort = e.target.value; loadReviews(view, 1); }),
      on(view, 'click', '[data-action="more-reviews"]', () => loadReviews(view, reviews.page + 1, true)),
      on(view, 'click', '[data-action="edit-review"]', () => { editing = true; drawReviewForm(view); }),
      on(view, 'click', '[data-action="cancel-edit"]', () => { editing = false; drawReviewForm(view); }),
      on(view, 'click', '[data-action="delete-review"]', async (e, b) => {
        if (!await confirmDialog({ title: t('reviews.deleteTitle'), text: t('reviews.deleteText'), confirmText: t('common.delete'), danger: true })) return;
        try {
          await del(`/api/reviews/${b.dataset.id}`);
          toast(t('reviews.deleted'), { type: 'success' });
          book = await get(`/api/books/${book.id}`);
          render($('[data-rating-summary]', view), ratingSummary());
          loadReviews(view, 1);
        } catch (err) { toastError(err); }
      }),
      on(view, 'submit', 'form[data-review-form]', async (e) => {
        e.preventDefault();
        const form = e.target;
        const btn = $('button[type="submit"]', form);
        const data = formData(form);
        const body = { rating: data.rating ? Number(data.rating) : null, comment: data.comment };
        setBusy(btn, true);
        try {
          if (myReview && editing) await put(`/api/reviews/${myReview.id}`, body);
          else await post(`/api/books/${book.id}/reviews`, body);
          toast(t('reviews.saved'), { type: 'success' });
          editing = false;
          book = await get(`/api/books/${book.id}`);
          render($('[data-rating-summary]', view), ratingSummary());
          loadReviews(view, 1);
        } catch (err) {
          setBusy(btn, false);
          if (!showFormErrors(form, err)) toastError(err);
        }
      }),
    ];
    return () => off.forEach((f) => f());
  },
};

// ── rendering ────────────────────────────────────────────────────────────────
// The stage takes the colour of the cover (read from the image itself, see core/color.js).
function stageStyle(color) {
  if (!color) return '';
  const ink = luminance(color) > 0.42 ? '#2a1a13' : '#fcf5ef';
  return `--stage:${color};--stage-ink:${ink}`;
}
function ringsStyle(color) {
  if (!color) return '';
  // on the dark theme the rings fade into espresso, so the text stays light
  const dark = document.documentElement.dataset.theme === 'dark';
  return `--ring:${color};--rings-ink:${!dark && luminance(color) > 0.22 ? '#2a1a13' : '#fcf5ef'}`;
}

function page(color) {
  const long = [...book.title].length > 16;
  return html`
    <section class="book-stage" data-stage style="${stageStyle(color)}">
      <div class="book-stage__pattern" style="background-image:url('${book.coverUrl}')" aria-hidden="true"></div>
      <div class="book-stage__wedge" aria-hidden="true"></div>
      <svg class="book-stage__edge" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line x1="9" y1="0" x2="50" y2="100"/><line x1="91" y1="0" x2="50" y2="100"/></svg>
      <div class="book-stage__ring">${ringBadge(t('book.ringLabel'), book.rating.toFixed(1))}</div>
      <div class="container book-stage__inner">
        <nav class="breadcrumbs" aria-label="breadcrumb">
          <a href="#/books">${t('nav.catalog')}</a>${icon('chevronRight')}
          <a href="#/books?categoryId=${book.category.id}">${book.category.name}</a>
        </nav>
        <p class="book-stage__author">${book.author}</p>
        <h1 class="caps caps--xl book-stage__title ${long ? 'is-long' : ''}">${capsHtml(book.title)}</h1>
        <hr class="book-stage__rule">
        <p class="book-stage__sub">${book.category.name} · ${fmt.year(book)}${book.translator ? ` · ${t('book.translatedBy', { name: book.translator })}` : ''}</p>
        <div class="book-stage__badges">
          ${book.isFree ? html`<span class="badge badge--free">${t('book.free')}</span>` : ''}
          ${book.isNew ? html`<span class="badge badge--new">${t('book.new')}</span>` : ''}
          ${!book.isPublished ? html`<span class="badge badge--warning">${t('admin.draft')}</span>` : ''}
        </div>
        <div class="book-actions">${actions()}</div>
        ${accessNote()}
        <div class="book-stage__stats">
          <span>${icon('file')} ${t('book.pages', { n: book.pages })}</span>
          <span>${icon('clock')} ${fmt.minutes(book.readingMinutes)}</span>
          <span>${icon('globe')} ${book.language === 'ka' ? 'ქართული' : 'English'}</span>
          <span>${icon('users')} ${t('book.readers', { count: fmt.compact(book.readers) })}</span>
        </div>
      </div>
      <div class="book-stage__cover">${cover(book, { eager: true })}</div>
    </section>

    <section class="book-about on-cream">
      <div class="container book-about__grid">
        <div data-reveal>
          <p class="book-desc">${book.description}</p>
          ${book.tags.length ? html`<div class="tags">${book.tags.map((tag) => html`<span class="tag">#${tag}</span>`)}</div>` : ''}
          ${book.source ? html`<p class="xsmall muted" style="margin-top:1.4rem">${t('book.source')}: ${book.source.url ? html`<a href="${book.source.url}" target="_blank" rel="noopener">${book.source.name}</a>` : book.source.name} · ${t('book.publicDomain')}</p>` : ''}
        </div>
        <aside class="book-key" data-reveal style="--d:1">
          <span class="kicker">${capsHtml(t('book.keyLabel'))}</span>
          <strong>${fmt.minutes(book.readingMinutes)}</strong>
          <p>${t('book.statTimeText')}</p>
        </aside>
      </div>
    </section>

    <section class="rings" data-rings style="${ringsStyle(color)}" aria-label="${t('book.statsTitle')}">
      <div class="rings__inner" data-reveal>
        <div class="rings__tabs" role="tablist">${STAT_TABS.map((key, i) => html`<button role="tab" data-ring="${key}" class="${i ? '' : 'is-active'}" aria-selected="${!i}">${t('book.stat' + key[0].toUpperCase() + key.slice(1))}</button>`)}</div>
        <div data-ring-panel>${ringPanel('rating')}</div>
      </div>
    </section>

    <div class="container">
      ${book.chapters.length ? html`<section class="section">
        <div class="section-head" data-reveal><h2>${t('book.contents')}</h2><span class="muted small">${t('book.chaptersCount', { count: book.chapters.length })}</span></div>
        <ol class="toc" data-reveal>${book.chapters.map((c) => html`<li class="${c.level ? 'lvl-1' : ''}"><button data-toc="${c.page}">${c.title}<span class="page-no">${c.page}</span></button></li>`)}</ol>
      </section>` : ''}

      <section class="section" id="reviews">
        <div class="section-head" data-reveal><h2>${t('reviews.title')}</h2>
          <select class="select select--pill" data-review-sort style="width:auto" aria-label="${t('catalog.sort')}">
            ${['newest', 'highest', 'lowest'].map((s) => html`<option value="${s}" ${reviewSort === s ? 'selected' : ''}>${t('reviews.sorts.' + s)}</option>`)}
          </select>
        </div>
        <div class="card card--pad" data-rating-summary>${ratingSummary()}</div>
        <div data-review-form-box style="margin-top:1.25rem"></div>
        <div data-reviews style="margin-top:.5rem"></div>
      </section>

      <section class="section" data-related style="margin-bottom:clamp(3rem, 8vw, 6rem)"></section>
    </div>`;
}

const STAT_TABS = ['rating', 'pages', 'time', 'readers'];
function ringPanel(key) {
  const panels = {
    rating: [html`${book.rating.toFixed(1)}<small>/5</small>`, t('book.statRatingText', { count: fmt.number(book.ratingCount) })],
    pages: [fmt.number(book.pages), t('book.statPagesText')],
    time: [fmt.minutes(book.readingMinutes), t('book.statTimeText')],
    readers: [fmt.compact(book.readers), t('book.statReadersText')],
  };
  const [value, text] = panels[key];
  return html`<p class="rings__text">${text}</p><div class="rings__value">${value}</div>`;
}

function actions() {
  const a = book.access;
  const progress = book.progress;
  const preview = a.canPreview ? html`<button class="btn btn--lg" data-action="preview">${icon('eye')} ${t('book.preview', { pages: book.previewPages })}</button>` : '';
  const share = html`<button class="btn btn--icon btn--lg" data-action="share" aria-label="${t('book.share')}" data-tip="${t('book.share')}">${icon('copy')}</button>`;
  const fav = html`<button class="btn btn--icon btn--lg ${book.isFavorite ? 'is-on' : ''}" data-action="fav" data-id="${book.id}" aria-pressed="${!!book.isFavorite}" aria-label="${t('book.favorite')}" data-tip="${t('book.favorite')}">${icon('heart')}</button>`;
  if (a.canRead) {
    return html`
      ${cta(progress ? t('book.continue', { page: progress.currentPage }) : t('book.read'), { action: 'read', data: progress ? { page: progress.currentPage } : {}, arrow: 'bookOpen' })}
      ${a.canDownload
        ? html`<button class="btn btn--lg" data-action="download">${icon('download')} ${t('book.download')}</button>`
        : html`<span data-tip="${t('book.downloadLocked')}"><button class="btn btn--lg" disabled>${icon('lock')} ${t('book.download')}</button></span>`}
      ${fav}${share}`;
  }
  if (a.reason === 'loginRequired') {
    return html`${cta(t('book.loginToRead'), { action: 'login' })}${preview}${share}`;
  }
  if (a.reason === 'subscriptionRequired') {
    const main = !session.user?.isVerified
      ? cta(t('pricing.verifyFirst'), { href: `#/verify?email=${encodeURIComponent(session.user?.email ?? '')}`, arrow: 'mail' })
      : sub?.canStartTrial
        ? cta(t('book.startTrial', { days: plans[0]?.trialDays ?? 7 }), { action: 'trial', arrow: 'sparkles' })
        : cta(t('book.subscribeToRead'), { href: '#/pricing' });
    return html`${main}${preview}${fav}${share}`;
  }
  return html`<button class="btn btn--lg" disabled>${icon('clock')} ${t('book.comingSoon')}</button>${share}`;
}

function accessNote() {
  const reasons = { free: ['gift', 'book.access.free'], trial: ['clock', 'book.access.trial'], subscription: ['crown', 'book.access.subscription'], admin: ['shield', 'book.access.admin'] };
  const r = reasons[book.access.reason];
  return r ? html`<p class="access-note">${icon(r[0])} ${t(r[1])}</p>` : '';
}

function ratingSummary() {
  const total = Object.values(book.ratingBreakdown).reduce((a, b) => a + b, 0) || 1;
  return html`<div class="rating-summary">
    <div class="rating-summary__big"><strong>${book.rating.toFixed(1)}</strong>${stars(book.rating, { size: 'lg' })}<div class="small muted">${t('book.ratingsCount', { count: fmt.number(book.ratingCount) })}</div></div>
    <div class="bars">${[5, 4, 3, 2, 1].map((s) => {
      const n = book.ratingBreakdown[s] ?? 0;
      return html`<div class="bars__row"><span>${s}★</span><div class="progress"><span style="width:${(n / total) * 100}%"></span></div><span>${fmt.compact(n)}</span></div>`;
    })}</div>
  </div>`;
}

async function loadReviews(view, pageNo, append = false) {
  const box = $('[data-reviews]', view);
  if (!box) return;
  try {
    const [list, mine] = await Promise.all([
      get(`/api/books/${book.id}/reviews`, { query: { page: pageNo, pageSize: 6, sort: reviewSort } }),
      session.isAuthed && pageNo === 1 ? get(`/api/books/${book.id}/reviews`, { query: { mine: true } }) : Promise.resolve(null),
    ]);
    if (mine) myReview = mine.items[0] ?? null;
    reviews = { ...list, items: append ? [...reviews.items, ...list.items] : list.items };
    drawReviewForm(view);
    render(box, reviews.items.length
      ? html`${reviews.items.map(reviewItem)}${reviews.hasMore ? html`<div class="center" style="margin-top:1rem"><button class="btn" data-action="more-reviews">${t('reviews.more')}</button></div>` : ''}`
      : html`<p class="muted center" style="padding:1.5rem 0">${t('reviews.empty')}</p>`);
  } catch (err) {
    render(box, errorState(err, { retry: false }));
  }
}

function reviewItem(r) {
  return html`<article class="review ${r.isMine ? 'review--mine' : ''}">
    ${avatar({ firstName: r.user.name, lastName: r.user.name.split(' ')[1] ?? '', avatarUrl: r.user.avatarUrl })}
    <div>
      <div class="review__head"><span class="review__name">${r.user.name}</span>${stars(r.rating)}<span class="review__date">${fmt.relative(r.createdAt)}</span>
        ${r.isMine ? html`<span class="badge badge--info">${t('reviews.yours')}</span>` : ''}</div>
      ${r.comment ? html`<p class="review__text">${r.comment}</p>` : ''}
      ${r.isMine || session.isAdmin ? html`<div class="review__actions">
        ${r.isMine ? html`<button data-action="edit-review">${t('common.edit')}</button>` : ''}
        <button data-action="delete-review" data-id="${r.id}">${t('common.delete')}</button></div>` : ''}
    </div>
  </article>`;
}

function drawReviewForm(view) {
  const box = $('[data-review-form-box]', view);
  if (!box) return;
  if (!session.isAuthed) return render(box, html`<p class="small muted">${t('reviews.loginToReview')} <a href="#/login?next=${encodeURIComponent(currentLocation().full)}">${t('nav.login')}</a></p>`);
  if (myReview && !editing) return render(box, '');
  const current = editing ? myReview : null;
  render(box, html`<form class="card card--pad" data-review-form novalidate>
    <h3 style="margin-bottom:.75rem">${current ? t('reviews.editTitle') : t('reviews.writeTitle')}</h3>
    <div class="field">
      <span class="field__label">${t('reviews.yourRating')}</span>
      <div class="star-input" data-error-for="rating">${[5, 4, 3, 2, 1].map((n) => html`
        <input type="radio" id="star-${n}" name="rating" value="${n}" ${current?.rating === n ? 'checked' : ''}><label for="star-${n}" title="${n}">${icon('star')}</label>`)}</div>
      <span class="field__error"></span>
    </div>
    <div class="field">
      <label class="field__label" for="review-comment">${t('reviews.comment')} <span class="muted">${t('common.optional')}</span></label>
      <textarea class="textarea" id="review-comment" name="comment" maxlength="1000" placeholder="${t('reviews.placeholder')}">${current?.comment ?? ''}</textarea>
      <span class="field__error"></span>
    </div>
    <div class="row" style="margin-top:1rem">
      <button class="btn btn--primary" type="submit">${t('reviews.submit')}</button>
      ${current ? html`<button class="btn btn--ghost" type="button" data-action="cancel-edit">${t('common.cancel')}</button>` : ''}
    </div>
  </form>`);
}

async function loadRelated(view) {
  const box = $('[data-related]', view);
  try {
    const related = await get(`/api/books/${book.id}/related`, { query: { take: 8 } });
    if (related.length) {
      render(box, html`<div class="section-head" data-reveal><h2>${t('book.related')}</h2></div>
        <div class="related-row">${related.map((b) => html`<div class="marquee__item">${tile(b)}<a class="marquee__label" href="#/books/${b.id}">${capsHtml(b.title)}</a></div>`)}</div>`);
    }
  } catch { /* optional section */ }
}
