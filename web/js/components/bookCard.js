import { html } from '../core/dom.js';
import { t, fmt } from '../core/i18n.js';
import { icon, stars, capsHtml } from '../core/ui.js';

// Saturated "pack" colours for the tiles — one per genre, like coffee packs on a shelf.
const GENRE_COLORS = {
  georgian: '#0f4d3a', poetry: '#5a1d6e', classics: '#a3155c', scifi: '#0b62a8', mystery: '#0f2f8f',
  gothic: '#7d1810', adventure: '#c4561b', philosophy: '#4a3020', kids: '#2f7d1f',
};
const FALLBACK = ['#0f4d3a', '#0f2f8f', '#5a1d6e', '#0b62a8', '#a3155c', '#2f7d1f', '#c4561b', '#7d1810', '#3a2a1f'];

/** The tile colour of a book (by genre slug; other genres get a stable colour from their id). */
export function genreColor(category) {
  if (!category) return FALLBACK[0];
  return GENRE_COLORS[category.slug] ?? FALLBACK[Math.abs(Number(category.id) || 0) % FALLBACK.length];
}

export function cover(book, { eager = false } = {}) {
  const progress = book.progress?.percent;
  return html`<div class="cover">
    ${progress != null ? html`<span class="cover__ribbon" title="${t('book.progress', { percent: progress })}">${progress}%</span>` : ''}
    <img src="${book.coverUrl}" alt="${book.title}" loading="${eager ? 'eager' : 'lazy'}" width="400" height="600">
  </div>`;
}

function badges(book) {
  return html`<div class="book-card__badges">
    ${book.isFree ? html`<span class="badge badge--free">${t('book.free')}</span>` : ''}
    ${book.isNew ? html`<span class="badge badge--new">${t('book.new')}</span>` : ''}
    ${book.isPublished === false ? html`<span class="badge badge--warning">${t('admin.draft')}</span>` : ''}
  </div>`;
}

/** The heart button — handled globally in main.js (data-action="fav"). */
export function favButton(book) {
  const on = !!book.isFavorite;
  return html`<button class="book-card__fav ${on ? 'is-on' : ''}" data-action="fav" data-id="${book.id}" aria-pressed="${on}"
    aria-label="${on ? t('book.unfavorite') : t('book.favorite')}">${icon('heart')}</button>`;
}

/**
 * A book in a grid: the cover floats, the title is set in condensed capitals.
 * list: a horizontal card with the description · go: show the round arrow under the card
 */
export function bookCard(book, { list = false, go = false } = {}) {
  const meta = html`<div class="book-card__meta">
      <span class="rating-line">${stars(book.rating)} <strong>${book.rating.toFixed(1)}</strong></span>
      <span>${t('book.pages', { n: book.pages })}</span>
      ${list ? html`<span>${fmt.year(book)}</span><span>${book.category.name}</span><span>${book.language === 'ka' ? 'ქართ.' : 'Eng.'}</span>` : ''}
    </div>`;
  const progress = book.progress
    ? html`<div class="book-card__progress"><div class="progress"><span style="width:${book.progress.percent}%"></span></div></div>`
    : '';

  if (list) {
    return html`<article class="book-card book-card--list">
      <a class="book-card__link" href="#/books/${book.id}" tabindex="-1" aria-hidden="true">${cover(book)}</a>
      <div>
        <h3 class="book-card__title"><a class="book-card__link" href="#/books/${book.id}">${capsHtml(book.title)}</a></h3>
        <p class="book-card__author">${book.author}</p>
        ${meta}${progress}
        ${book.description ? html`<p class="book-card__desc">${book.description}</p>` : ''}
        <div class="row" style="margin-top:.8rem">
          ${book.isFree ? html`<span class="badge badge--free">${t('book.free')}</span>` : ''}
          ${book.isNew ? html`<span class="badge badge--new">${t('book.new')}</span>` : ''}
          <span class="grow"></span>
          <button class="btn btn--icon btn--sm ${book.isFavorite ? 'is-on' : ''}" data-action="fav" data-id="${book.id}" aria-pressed="${!!book.isFavorite}" aria-label="${t('book.favorite')}">${icon('heart')}</button>
          <a class="arrow-btn" style="width:36px;height:36px" href="#/books/${book.id}" aria-label="${book.title}">${icon('arrowRight')}</a>
        </div>
      </div>
    </article>`;
  }

  return html`<article class="book-card">
    <div class="book-card__media">
      <a class="book-card__link" href="#/books/${book.id}" aria-label="${book.title} — ${book.author}">${cover(book)}</a>
      ${badges(book)}
      ${favButton(book)}
    </div>
    <div>
      <h3 class="book-card__title"><a class="book-card__link" href="#/books/${book.id}" tabindex="-1">${capsHtml(book.title)}</a></h3>
      <p class="book-card__author">${book.author}</p>
      ${meta}${progress}
      ${go ? html`<div class="book-card__go"><a class="arrow-btn" href="#/books/${book.id}" tabindex="-1" aria-hidden="true">${icon('arrowRight')}</a></div>` : ''}
    </div>
  </article>`;
}

export const bookGrid = (books, opts) => html`<div class="book-grid">${books.map((b) => bookCard(b, opts))}</div>`;

export const rail = (books) => html`<div class="rail"><div class="rail__track">${books.map((b) => bookCard(b))}</div></div>`;

/** A cover on a coloured tile, for the marquees. */
export const tile = (book, { hidden = false } = {}) => html`<a class="tile" href="#/books/${book.id}" style="--tile:${genreColor(book.category)}" aria-label="${book.title}" tabindex="${hidden ? -1 : 0}">
  <img src="${book.coverUrl}" alt="" loading="lazy" width="200" height="300"></a>`;
