// Catalog: every filter lives in the URL (#/books?q=…&categoryId=3&page=2), so filtered
// pages can be shared, reloaded and navigated with the back button.
import { html, render, on, $, $$, debounce } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { get } from '../core/api.js';
import { setQuery } from '../core/router.js';
import { icon, skeletonGrid, emptyState, errorState, pagination, pageHero, cta, capsHtml } from '../core/ui.js';
import { bookCard, genreColor } from '../components/bookCard.js';

// UI presets → API query parameters
const LENGTHS = { short: { maxPages: 120 }, medium: { minPages: 121, maxPages: 300 }, long: { minPages: 301 } };
const ERAS = { before1800: { yearTo: 1799 }, c19: { yearFrom: 1800, yearTo: 1899 }, c20: { yearFrom: 1900 } };
const SORTS = ['popular', 'rating', 'newest', 'title', 'year', 'pages'];
// the filters that live in the drawer (genre has its own row of cards)
const DRAWER_KEYS = ['language', 'isFree', 'minRating', 'length', 'era'];

let state = {};
let categories = [];
let thumbs = {}; // categoryId → a cover for its card
let total = 0;
let view;
let controller;

function readState(query) {
  return {
    q: query.get('q') ?? '',
    categoryId: query.get('categoryId') ?? '',
    language: query.get('language') ?? '',
    isFree: query.get('isFree') === 'true',
    minRating: query.get('minRating') ?? '',
    length: query.get('length') ?? '',
    era: query.get('era') ?? '',
    sort: query.get('sort') ?? 'popular',
    page: Number(query.get('page') ?? 1) || 1,
    view: query.get('view') ?? 'grid',
  };
}

/** The UI state → the request we send to GET /api/books */
function apiQuery() {
  return {
    q: state.q || undefined,
    categoryId: state.categoryId || undefined,
    language: state.language || undefined,
    isFree: state.isFree || undefined,
    minRating: state.minRating || undefined,
    ...(LENGTHS[state.length] ?? {}),
    ...(ERAS[state.era] ?? {}),
    sort: state.sort,
    page: state.page,
    pageSize: 12,
  };
}

function setState(patch, { resetPage = true } = {}) {
  state = { ...state, ...patch, ...(resetPage && !('page' in patch) ? { page: 1 } : {}) };
  setQuery({ ...state, sort: state.sort === 'popular' ? '' : state.sort, page: state.page > 1 ? state.page : '', view: state.view === 'grid' ? '' : state.view });
  drawFilters();
  loadResults();
}

const activeDrawerFilters = () => DRAWER_KEYS.filter((k) => state[k]).length;

function openDrawer(open) {
  $('[data-filters]', view)?.classList.toggle('is-open', open);
  const backdrop = $('[data-filters-backdrop]', view);
  if (backdrop) backdrop.hidden = !open;
  document.body.classList.toggle('is-locked', open);
}

export default {
  title: () => t('catalog.title'),
  async render(el, ctx) {
    view = el;
    state = readState(ctx.query);
    render(view, html`
      <div class="page container">
        <div data-hero>${pageHero({ kicker: t('catalog.lead'), title: t('catalog.heading') })}</div>
        <nav class="cat-cards" data-cats aria-label="${t('catalog.genre')}"></nav>
        <div class="catalog__bar">
          <label class="input-icon">${icon('search')}<input class="input" type="search" data-search value="${state.q}" placeholder="${t('catalog.searchPlaceholder')}" aria-label="${t('catalog.searchPlaceholder')}"></label>
          <span class="grow"></span>
          <button class="btn filters-toggle" data-action="toggle-filters">${icon('filter')} ${t('catalog.filters')} <span data-filter-count></span></button>
          <select class="select select--pill" data-sort aria-label="${t('catalog.sort')}" style="width:auto">
            ${SORTS.map((s) => html`<option value="${s}" ${state.sort === s ? 'selected' : ''}>${t('catalog.sorts.' + s)}</option>`)}
          </select>
          <div class="segmented" role="group" aria-label="${t('catalog.view')}">
            <button data-view="grid" aria-label="${t('catalog.grid')}">${icon('grid')}</button>
            <button data-view="list" aria-label="${t('catalog.list')}">${icon('list')}</button>
          </div>
        </div>
        <div class="active-filters" data-active></div>
        <div data-results></div>
      </div>
      <div class="filters-backdrop" data-filters-backdrop data-action="close-filters" hidden></div>
      <aside class="filters" data-filters aria-label="${t('catalog.filters')}"></aside>
      <button class="filter-fab" data-action="toggle-filters">${t('catalog.filterFab')} <span data-fab-count></span><i>${icon('filter')}</i></button>`);

    try {
      const [cats, all] = await Promise.all([get('/api/categories'), get('/api/books', { query: { sort: 'popular', pageSize: 48 } })]);
      categories = cats;
      total = all.totalItems;
      thumbs = {};
      for (const b of all.items) thumbs[b.category.id] ??= b.coverUrl;
      render($('[data-hero]', view), pageHero({ kicker: t('catalog.kicker', { count: total, genres: categories.length }), title: t('catalog.heading'), lead: t('catalog.lead') }));
    } catch {
      categories = [];
    }
    drawFilters();
    loadResults();

    const search = debounce((value) => setState({ q: value }), 350);
    const off = [
      on(view, 'input', '[data-search]', (e) => search(e.target.value.trim())),
      on(view, 'change', '[data-sort]', (e) => setState({ sort: e.target.value })),
      on(view, 'click', '[data-view]', (e, b) => setState({ view: b.dataset.view }, { resetPage: false })),
      on(view, 'click', '[data-set]', (e, b) => {
        const [key, value] = [b.dataset.set, b.dataset.value];
        // a second click on an active chip clears it — except the sort order, which always has a value
        setState({ [key]: key !== 'sort' && state[key] === value ? '' : value });
      }),
      on(view, 'change', '[data-free]', (e) => setState({ isFree: e.target.checked })),
      on(view, 'click', '[data-action="reset"]', () => {
        $('[data-search]', view).value = '';
        setState({ q: '', categoryId: '', language: '', isFree: false, minRating: '', length: '', era: '' });
      }),
      on(view, 'click', '[data-remove]', (e, b) => {
        if (b.dataset.remove === 'q') $('[data-search]', view).value = '';
        setState({ [b.dataset.remove]: b.dataset.remove === 'isFree' ? false : '' });
      }),
      on(view, 'click', '[data-page]', (e, b) => {
        setState({ page: Number(b.dataset.page) }, { resetPage: false });
        view.querySelector('[data-results]').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }),
      on(view, 'click', '[data-action="toggle-filters"]', () => openDrawer(true)),
      on(view, 'click', '[data-action="close-filters"]', () => openDrawer(false)),
      on(view, 'click', '[data-action="retry"]', () => loadResults()),
    ];
    const onKey = (e) => { if (e.key === 'Escape') openDrawer(false); };
    document.addEventListener('keydown', onKey);
    return () => { off.forEach((f) => f()); controller?.abort(); document.removeEventListener('keydown', onKey); document.body.classList.remove('is-locked'); };
  },
  // back/forward between two catalog URLs: no full re-render
  update(ctx) {
    state = readState(ctx.query);
    const input = $('[data-search]', view);
    if (input) input.value = state.q;
    drawFilters();
    loadResults();
  },
};

function drawFilters() {
  $$('[data-view]', view).forEach((b) => b.classList.toggle('is-active', b.dataset.view === state.view));
  const sort = $('[data-sort]', view);
  if (sort) sort.value = state.sort;

  // genre cards: a cover from the genre, its name in capitals and the number of books
  const cats = $('[data-cats]', view);
  if (cats) {
    render(cats, html`
      <button class="cat-card ${!state.categoryId ? 'is-active' : ''}" data-set="categoryId" data-value="">
        <span class="cat-card__thumb" style="--tile:var(--cinnabar)">ა</span>
        <span><strong>${capsHtml(t('catalog.allCategories'))}</strong><small>${t('catalog.allCount', { count: total })}</small></span>
      </button>
      ${categories.map((c) => html`<button class="cat-card ${String(state.categoryId) === String(c.id) ? 'is-active' : ''}" data-set="categoryId" data-value="${c.id}">
        <span class="cat-card__thumb" style="--tile:${genreColor(c)}">${thumbs[c.id] ? html`<img src="${thumbs[c.id]}" alt="" width="40" height="60">` : [...c.name][0]}</span>
        <span><strong>${capsHtml(c.name)}</strong><small>${t('catalog.allCount', { count: c.bookCount })}</small></span>
      </button>`)}`);
  }

  const n = activeDrawerFilters();
  const count = $('[data-filter-count]', view);
  if (count) render(count, n ? html`<span class="filter-count">${n}</span>` : '');
  const fab = $('[data-fab-count]', view);
  if (fab) fab.textContent = `(${n ? t('catalog.filterActive', { n }) : t('catalog.filterAll')})`;

  const chip = (key, value, label) => html`<button class="chip ${String(state[key]) === String(value) ? 'is-active' : ''}" data-set="${key}" data-value="${value}">${label}</button>`;
  const drawer = $('[data-filters]', view);
  if (drawer) {
    render(drawer, html`
      <div class="filters__head">
        <h2>${t('catalog.filters')}</h2>
        <button class="btn btn--icon" data-action="close-filters" aria-label="${t('common.close')}">${icon('x')}</button>
      </div>
      <div class="filters__body">
        <div>
          <h3>${t('catalog.genre')}</h3>
          <div class="filter-chips">${chip('categoryId', '', t('catalog.allGenres'))}${categories.map((c) => chip('categoryId', String(c.id), c.name))}</div>
        </div>
        <div>
          <h3>${t('catalog.language')}</h3>
          <div class="filter-chips">${chip('language', 'ka', 'ქართული')}${chip('language', 'en', 'English')}</div>
        </div>
        <div>
          <h3>${t('catalog.access')}</h3>
          <label class="switch"><input type="checkbox" data-free ${state.isFree ? 'checked' : ''}><span class="switch__track"></span>${t('catalog.freeOnly')}</label>
        </div>
        <div>
          <h3>${t('catalog.rating')}</h3>
          <div class="filter-chips">${chip('minRating', '4.5', '★ 4.5+')}${chip('minRating', '4', '★ 4+')}</div>
        </div>
        <div>
          <h3>${t('catalog.length')}</h3>
          <div class="filter-chips">${Object.keys(LENGTHS).map((k) => chip('length', k, t('catalog.lengths.' + k)))}</div>
        </div>
        <div>
          <h3>${t('catalog.era')}</h3>
          <div class="filter-chips">${Object.keys(ERAS).map((k) => chip('era', k, t('catalog.eras.' + k)))}</div>
        </div>
        <div>
          <h3>${t('catalog.sort')}</h3>
          <div class="filter-chips">${SORTS.map((s) => chip('sort', s, t('catalog.sorts.' + s)))}</div>
        </div>
      </div>
      <div class="filters__foot">
        <button class="btn" data-action="reset">${icon('refresh')} ${t('catalog.reset')}</button>
        ${cta(t('catalog.showResults'), { action: 'close-filters', variant: 'ink' })}
      </div>`);
  }

  const active = [];
  if (state.q) active.push(['q', `“${state.q}”`]);
  if (state.categoryId) active.push(['categoryId', categories.find((c) => String(c.id) === String(state.categoryId))?.name ?? state.categoryId]);
  if (state.language) active.push(['language', state.language === 'ka' ? 'ქართული' : 'English']);
  if (state.isFree) active.push(['isFree', t('catalog.freeOnly')]);
  if (state.minRating) active.push(['minRating', `★ ${state.minRating}+`]);
  if (state.length) active.push(['length', t('catalog.lengths.' + state.length)]);
  if (state.era) active.push(['era', t('catalog.eras.' + state.era)]);
  render($('[data-active]', view), active.map(([k, label]) => html`<button class="chip" data-remove="${k}">${label} ${icon('x')}</button>`));
}

async function loadResults() {
  const box = $('[data-results]', view);
  if (!box) return;
  controller?.abort();
  controller = new AbortController();
  render(box, skeletonGrid(12));
  try {
    const res = await get('/api/books', { query: apiQuery(), signal: controller.signal });
    if (!res.items.length) {
      render(box, emptyState({
        letter: 'ჰ',
        title: t('catalog.emptyTitle'),
        text: t('catalog.emptyText'),
        action: html`<button class="btn" data-action="reset">${t('catalog.reset')}</button>`,
      }));
      return;
    }
    render(box, html`
      <p class="catalog__count">${t('catalog.results', { count: res.totalItems })} · ${t('catalog.pageOf', { page: res.page, total: res.totalPages })}</p>
      ${state.view === 'list'
        ? html`<div class="book-list">${res.items.map((b) => bookCard(b, { list: true }))}</div>`
        : html`<div class="book-grid">${res.items.map((b) => bookCard(b, { go: true }))}</div>`}
      ${pagination(res)}`);
  } catch (err) {
    if (err.name === 'AbortError') return;
    render(box, errorState(err));
  }
}
