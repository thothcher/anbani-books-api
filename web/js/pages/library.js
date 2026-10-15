// My library: reading statistics, the activity calendar, books in progress,
// favorites and finished books — as a grid or as spines on a bookshelf.
import { html, render, on, $ } from '../core/dom.js';
import { t, fmt } from '../core/i18n.js';
import { get, del } from '../core/api.js';
import { setQuery } from '../core/router.js';
import { icon, loadingBlock, errorState, emptyState, toast, toastError, pageHero } from '../core/ui.js';
import { bookCard, cover } from '../components/bookCard.js';
import { heatmap } from '../components/charts.js';

const SPINE_COLORS = [['#0f4d3a', '#f3e2d3'], ['#c42d1c', '#fcf5ef'], ['#2a1a13', '#edd2bf'], ['#f2c230', '#2a1a13'], ['#5a1d6e', '#f3e2d3'], ['#0f2f8f', '#f3e2d3'], ['#edd2bf', '#2a1a13'], ['#4b3128', '#f3e2d3']];

export default {
  title: () => t('library.title'),
  async render(view, ctx) {
    let tab = ctx.query.get('tab') ?? 'reading';
    let mode = ctx.query.get('view') ?? 'grid';
    render(view, loadingBlock());
    let data;
    const load = async () => {
      const [stats, reading, finished, favorites] = await Promise.all([
        get('/api/library/stats'),
        get('/api/library/progress', { query: { status: 'reading' } }),
        get('/api/library/progress', { query: { status: 'finished' } }),
        get('/api/library/favorites'),
      ]);
      data = { stats, reading, finished, favorites };
      draw();
    };
    const draw = () => {
      const { stats } = data;
      const counts = { reading: data.reading.length, favorites: data.favorites.length, finished: data.finished.length };
      render(view, html`<div class="page container">
        ${pageHero({ kicker: t('library.kicker'), title: t('library.heading'), lead: t('library.lead'), compact: true })}
        <div class="library-stats">
          <div class="stat"><strong>${stats.booksStarted}</strong><span>${t('library.statStarted')}</span></div>
          <div class="stat"><strong>${stats.booksFinished}</strong><span>${t('library.statFinished')}</span></div>
          <div class="stat"><strong>${fmt.number(stats.pagesRead)}</strong><span>${t('library.statPages')}</span></div>
          <div class="stat"><strong>${stats.currentStreak} ${icon('zap')}</strong><span>${t('library.statStreak', { best: stats.longestStreak })}</span></div>
        </div>
        <div class="card card--pad" style="margin-top:1rem">
          <div class="row row--between"><h2 style="font-size:var(--text-lg);margin:0">${t('library.activity')}</h2><span class="small muted">${t('library.last12weeks')}</span></div>
          <div style="margin-top:1rem">${heatmap(stats.activity.map((d) => ({ date: d.date, pages: d.pages })))}</div>
          <div class="heatmap-legend">${t('library.less')} ${[0, 1, 2, 3, 4].map((l) => html`<span data-l="${l}"></span>`)} ${t('library.more')}</div>
        </div>
        <div class="row row--between" style="margin-top:2rem">
          <div class="tabs" role="tablist" style="flex:1">${['reading', 'favorites', 'finished'].map((k) => html`
            <button class="tab ${tab === k ? 'is-active' : ''}" data-tab="${k}" role="tab" aria-selected="${tab === k}">${t('library.tabs.' + k)}<span class="tab__count">${counts[k]}</span></button>`)}</div>
          <div class="segmented" style="margin-left:1rem">
            <button class="${mode === 'grid' ? 'is-active' : ''}" data-mode="grid" aria-label="${t('catalog.grid')}">${icon('grid')}</button>
            <button class="${mode === 'shelf' ? 'is-active' : ''}" data-mode="shelf" aria-label="${t('library.shelf')}">${icon('library')}</button>
          </div>
        </div>
        <div style="margin-top:1.5rem">${content()}</div>
      </div>`);
    };
    const content = () => {
      const list = tab === 'favorites' ? data.favorites : data[tab].map((x) => x.book);
      if (!list.length) {
        const keys = { reading: ['library.emptyReading', 'ბ'], favorites: ['library.emptyFavorites', 'ვ'], finished: ['library.emptyFinished', 'დ'] }[tab];
        return emptyState({ letter: keys[1], title: t(keys[0] + 'Title'), text: t(keys[0] + 'Text'), action: html`<a class="btn btn--primary" href="#/books">${t('library.browse')}</a>` });
      }
      if (mode === 'shelf') return shelf(list);
      if (tab === 'reading') {
        return html`<div class="continue-grid">${data.reading.map(({ book, progress }) => html`
          <div class="continue-card" style="position:relative">
            <a href="#/read/${book.id}" style="text-decoration:none">${cover(book)}</a>
            <div>
              <h3><a href="#/books/${book.id}" style="text-decoration:none">${book.title}</a></h3>
              <p class="small muted" style="margin:0 0 .75rem">${book.author}</p>
              <div class="progress"><span style="width:${progress.percent}%"></span></div>
              <p class="xsmall muted" style="margin:.4rem 0 .75rem">${t('library.pageOf', { page: progress.currentPage, total: progress.totalPages })} · ${progress.percent}% · ${fmt.relative(progress.lastReadAt)}</p>
              <div class="row">
                <a class="btn btn--primary btn--sm" href="#/read/${book.id}">${icon('play')} ${t('library.continue')}</a>
                <button class="btn btn--ghost btn--sm" data-remove="${book.id}" aria-label="${t('library.remove')}">${icon('trash')}</button>
              </div>
            </div>
          </div>`)}</div>`;
      }
      return html`<div class="book-grid">${list.map((b) => bookCard(b))}</div>`;
    };
    const shelf = (books) => {
      const rows = [];
      for (let i = 0; i < books.length; i += 12) rows.push(books.slice(i, i + 12));
      return html`<div class="shelf">${rows.map((row) => html`<div class="shelf__row">${row.map((b, i) => {
        const [c, tc] = SPINE_COLORS[(b.id * 7 + i) % SPINE_COLORS.length];
        const h = 170 + ((b.pages * 13) % 50);
        const w = 34 + Math.min(26, Math.round(b.pages / 22));
        return html`<a class="spine" href="#/books/${b.id}" style="--c:${c};--t:${tc};--h:${h}px;--w:${w}px" title="${b.title} — ${b.author}"><span class="spine__title">${b.title}</span></a>`;
      })}</div>`)}</div>`;
    };

    try { await load(); } catch (err) { render(view, html`<div class="container">${errorState(err)}</div>`); }

    const off = [
      on(view, 'click', '[data-action="retry"]', () => load().catch(() => {})),
      on(view, 'click', '[data-tab]', (e, b) => { tab = b.dataset.tab; setQuery({ tab, view: mode === 'grid' ? '' : mode }); draw(); }),
      on(view, 'click', '[data-mode]', (e, b) => { mode = b.dataset.mode; setQuery({ tab, view: mode === 'grid' ? '' : mode }); draw(); }),
      on(view, 'click', '[data-remove]', async (e, b) => {
        try {
          await del(`/api/library/progress/${b.dataset.remove}`);
          toast(t('library.removed'), { type: 'success' });
          await load();
        } catch (err) { toastError(err); }
      }),
    ];
    return () => off.forEach((f) => f());
  },
};
