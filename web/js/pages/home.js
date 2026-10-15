// Home: a full-screen stage, a marquee of covers on coloured tiles, a big statement,
// "how it works", editorial sections on cream paper and a membership band.
import { html, render, on, $, $$ } from '../core/dom.js';
import { t, fmt } from '../core/i18n.js';
import { get } from '../core/api.js';
import { session } from '../core/session.js';
import { navigate } from '../core/router.js';
import { icon, errorState, caps, capsHtml, cta } from '../core/ui.js';
import { rail, cover, tile, genreColor } from '../components/bookCard.js';
import { wallRows } from '../components/coverWall.js';
import { planCard } from './pricing.js';

const SLIDE_MS = 7000;

export default {
  title: () => t('home.title'),
  async render(view) {
    render(view, html`<div class="hero on-dark hero--loading"><div class="page-loading"><img class="boot__mark" src="assets/seal.svg" alt="" width="84" height="84"></div></div>`);
    let timer = null;
    let books = [];
    const load = async () => {
      const [all, fresh, categories, plans, reading] = await Promise.all([
        get('/api/books', { query: { sort: 'popular', pageSize: 48 } }),
        get('/api/books', { query: { sort: 'newest', pageSize: 3 } }),
        get('/api/categories'),
        get('/api/plans'),
        session.isAuthed ? get('/api/library/progress', { query: { status: 'reading' } }) : Promise.resolve([]),
      ]);
      books = all.items;
      render(view, page({ all, fresh: fresh.items, categories, plans, reading }));
      timer = startSlides(view);
    };
    try {
      await load();
    } catch (err) {
      render(view, html`<div class="page container">${errorState(err)}</div>`);
    }
    const off = [
      on(view, 'click', '[data-action="retry"]', () => load().catch(() => {})),
      on(view, 'click', '[data-slide]', (e, b) => { clearInterval(timer); timer = startSlides(view, Number(b.dataset.slide)); }),
      on(view, 'click', '[data-action="random-book"]', () => {
        if (!books.length) return;
        const pick = books[Math.floor(Math.random() * books.length)];
        navigate(`/books/${pick.id}`);
      }),
    ];
    return () => { clearInterval(timer); off.forEach((f) => f()); };
  },
};

// ── the hero slides: the headline and the button change, a progress line runs under the active tab
function slides(trialDays) {
  const s = session.subscription;
  const main = !session.isAuthed
    ? { label: t('home.ctaTrial'), href: '#/register' }
    : s.hasAccess ? { label: t('home.ctaContinue'), href: '#/library' } : { label: t('home.ctaSubscribe'), href: '#/pricing' };
  return [
    { title: t('home.slide1'), tab: t('home.slide1Tab'), cta: main },
    { title: t('home.slide2'), tab: t('home.slide2Tab'), cta: { label: t('home.ctaGeorgian'), href: '#/books?language=ka' } },
    { title: t('home.slide3', { days: trialDays }), tab: t('home.slide3Tab'), cta: session.isAuthed ? { label: t('home.comparePlans'), href: '#/pricing' } : { label: t('home.ctaTrial'), href: '#/register' } },
  ];
}

function startSlides(view, index = 0) {
  const tabs = $$('[data-slide]', view);
  if (!tabs.length) return null;
  const show = (i) => {
    tabs.forEach((tab, n) => { tab.classList.toggle('is-active', n === i); tab.setAttribute('aria-selected', String(n === i)); });
    $$('[data-slide-panel]', view).forEach((p, n) => { p.hidden = n !== i; });
  };
  let current = index;
  show(current);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
  return setInterval(() => {
    if (!view.isConnected) return;
    current = (current + 1) % tabs.length;
    show(current);
  }, SLIDE_MS);
}

// ── the page ─────────────────────────────────────────────────────────────────
function page({ all, fresh, categories, plans, reading }) {
  const items = all.items;
  const trialDays = plans[0]?.trialDays ?? 7;
  const free = items.filter((b) => b.isFree);
  const georgian = items.filter((b) => b.language === 'ka').sort((a, b) => b.rating - a.rating);
  const newest = fresh[0] ?? items[0];
  const s = slides(trialDays);
  const annual = plans.find((p) => p.interval === 'year');

  return html`
    <section class="hero on-dark">
      <div class="hero__wall" aria-hidden="true">${wallRows(items)}</div>
      <div class="hero__shade" aria-hidden="true"></div>

      <div class="hero__inner container container--wide">
        <div class="hero__copy">
          ${s.map((slide, i) => html`<div class="hero__panel" data-slide-panel ${i ? 'hidden' : ''}>
            <h1 class="serif serif--hero hero__title">${slide.title}</h1>
            ${cta(slide.cta.label, { href: slide.cta.href })}
          </div>`)}
        </div>
        <aside class="hero__cards" aria-label="${t('home.cardsLabel')}">
          <a class="hcard hcard--pill" href="#/books"><span>${t('home.cardCatalog')}</span>${icon('arrowRight')}</a>
          ${free[0] ? html`<a class="hcard hcard--square" href="#/books/${free[0].id}"><img src="${free[0].coverUrl}" alt="" width="80" height="120"><span>${t('home.cardFree')}</span></a>` : ''}
          <a class="hcard hcard--tall" href="#/books/${newest.id}" style="--tile:${genreColor(newest.category)}"><img src="${newest.coverUrl}" alt="" width="120" height="180"><span>${t('home.cardNew')}</span></a>
          <a class="hcard hcard--wide" href="#/pricing">
            <img src="assets/seal.svg" alt="" width="84" height="84">
            <div><strong>${t('home.cardHowTitle')}</strong><p>${t('home.cardHowText', { days: trialDays })}</p></div>
            ${icon('arrowRight')}
          </a>
        </aside>
      </div>

      <div class="hero__tabs container container--wide" role="tablist" aria-label="${t('home.slidesLabel')}">
        ${s.map((slide, i) => html`<button class="hero__tab ${i ? '' : 'is-active'}" data-slide="${i}" role="tab" aria-selected="${!i}">
          <img src="${(georgian[i] ?? items[i]).coverUrl}" alt="" width="104" height="62">
          <span><em>0${i + 1}</em>${slide.tab}</span>
          <i class="hero__progress" style="--ms:${SLIDE_MS}ms"></i>
        </button>`)}
      </div>
    </section>

    <section class="marquee-band on-dark" aria-label="${t('home.marqueeLabel')}">
      <div class="marquee">
        <div class="marquee__track">
          ${[...items, ...items].map((b, i) => html`<div class="marquee__item" aria-hidden="${i >= items.length}">
            ${tile(b, { hidden: i >= items.length })}
            <a class="marquee__label" href="#/books/${b.id}" tabindex="${i >= items.length ? -1 : 0}">${capsHtml(b.title)}</a>
          </div>`)}
        </div>
      </div>
    </section>

    <section class="statement on-dark">
      ${scatter(items)}
      <div class="container statement__inner">
        <h2 class="caps caps--xl statement__title" data-reveal>
          ${capsHtml(t('home.statementA'))}<br><small>${caps(t('home.statementSmall'))}</small> ${capsHtml(t('home.statementC'))}
        </h2>
        <div class="statement__cta" data-reveal style="--d:1">${cta(t('home.statementCta'), { href: '#/books' })}</div>
        <p class="serif-lead statement__lead" data-reveal style="--d:2">${t('home.statementLead', { count: all.totalItems })}</p>
      </div>
    </section>

    <section class="journey on-forest">
      ${ornament('journey__ornament journey__ornament--left')}${ornament('journey__ornament journey__ornament--right')}
      <div class="container journey__inner">
        <span class="eyebrow" data-reveal>${capsHtml(t('home.journeyKicker'))}</span>
        <h2 class="caps caps--l journey__title" data-reveal>${capsHtml(t('home.journeyTitle'))}</h2>
        <ol class="journey__track">
          ${[['userPlus', 'step1'], ['mail', 'step2'], ['sparkles', 'step3'], ['bookOpen', 'step4']].map(([ic, key], i) => html`
            <li class="journey__step journey__step--${i + 1}" data-reveal style="--d:${i}">
              <span class="journey__shape">${icon(ic)}</span>
              <span class="journey__label">${t(`home.${key}Title`)}</span>
            </li>`)}
        </ol>
        <p class="serif-lead journey__text" data-reveal>${t('home.journeyText', { days: trialDays })}</p>
        <div data-reveal>${cta(t('home.journeyCta'), { href: '#/pricing' })}</div>
      </div>
    </section>

    ${reading.length ? html`<section class="band band--tight on-cream">
      <div class="container">
        <div class="section-head" data-reveal><h2>${t('home.continueTitle')}</h2>${cta(t('common.seeAll'), { href: '#/library', sm: true })}</div>
        <div class="continue-grid">${reading.slice(0, 3).map(({ book, progress }) => html`
          <a class="continue-card" href="#/read/${book.id}" data-reveal>
            ${cover(book)}
            <div>
              <h3>${book.title}</h3>
              <p class="small muted" style="margin:0 0 .85rem">${book.author}</p>
              <div class="progress"><span style="width:${progress.percent}%"></span></div>
              <p class="xsmall muted" style="margin:.45rem 0 0">${t('library.pageOf', { page: progress.currentPage, total: progress.totalPages })} · ${progress.percent}%</p>
            </div>
          </a>`)}</div>
      </div>
    </section>` : ''}

    <section class="band on-cream popular">
      <div class="container">
        <div class="section-head" data-reveal>
          <div><h2>${t('home.popularTitle')}</h2><p>${t('home.popularLead')}</p></div>
          ${cta(t('common.seeAll'), { href: '#/books?sort=popular', sm: true })}
        </div>
        <div data-reveal>${rail(items.slice(0, 12))}</div>
      </div>
    </section>

    <section class="band on-cream culture">
      <div class="container culture__grid">
        <div class="culture__intro">
          <h2 class="serif serif--xl" data-reveal>${t('home.georgianTitle')}</h2>
          <p class="culture__text" data-reveal>${t('home.georgianText')}</p>
          <div data-reveal>${cta(t('home.ctaGeorgian'), { href: '#/books?language=ka', sm: true })}</div>
        </div>
        <div class="culture__items">
          ${georgian.slice(0, 2).map((b, i) => html`<article class="culture__item" data-reveal style="--d:${i}">
            <div class="culture__head">
              <h3 class="serif serif--l">${b.title}</h3>
              <p class="muted small">${b.author} · ${fmt.year(b)}</p>
              ${cta(t('home.explore'), { href: `#/books/${b.id}`, sm: true })}
            </div>
            <div class="culture__media">
              <a class="tile" href="#/books/${b.id}" style="--tile:${genreColor(b.category)}" tabindex="-1" aria-hidden="true"><img src="${b.coverUrl}" alt="" loading="lazy" width="200" height="300"></a>
              <p class="small">${b.description}</p>
            </div>
          </article>`)}
        </div>
      </div>
    </section>

    <section class="pick on-cream">
      <div class="pick__covers" aria-hidden="true">
        ${items.slice(0, 18).map((b, i) => html`<img src="${b.coverUrl}" alt="" loading="lazy" width="120" height="180" data-parallax="${[0.08, 0.16, 0.05, 0.12, 0.2, 0.1][i % 6]}" style="--x:${PICK_SPOTS[i][0]}%;--y:${PICK_SPOTS[i][1]}%;--r:${PICK_SPOTS[i][2]}deg;--s:${PICK_SPOTS[i][3]}">`)}
      </div>
      <div class="pick__inner" data-reveal>
        <p class="serif pick__kicker">${t('home.pickKicker')}</p>
        <h2 class="serif serif--xl">${t('home.pickTitle')}</h2>
        <p class="pick__text">${t('home.pickText')}</p>
        ${cta(t('home.pickCta'), { action: 'random-book', variant: 'sun', arrow: 'shuffle' })}
      </div>
    </section>

    <section class="band on-cream journal">
      <div class="container journal__grid">
        <div class="journal__intro" data-reveal>
          <h2 class="serif serif--xl">${t('home.newTitle')}</h2>
          <p class="serif-lead">${t('home.newLead')}</p>
          ${cta(t('home.explore'), { href: '#/books?sort=newest', sm: true })}
        </div>
        ${fresh.map((b, i) => html`<a class="journal-card ${i === 1 ? 'journal-card--tall' : ''}" href="#/books/${b.id}" data-reveal style="--d:${i}">
          <span class="journal-card__media" style="--tile:${genreColor(b.category)}"><img src="${b.coverUrl}" alt="" loading="lazy" width="240" height="360"></span>
          <strong class="journal-card__title">${b.title}</strong>
          <span class="journal-card__meta"><span class="badge badge--outline">${b.category.name}</span> — ${fmt.year(b)}</span>
        </a>`)}
      </div>
    </section>

    <section class="membership on-forest">
      ${ornament('membership__ornament membership__ornament--left')}${ornament('membership__ornament membership__ornament--right')}
      <div class="container membership__inner">
        <span class="eyebrow" data-reveal>${capsHtml(t('home.pricingKicker'))}</span>
        <h2 class="caps caps--xl membership__title" data-reveal>
          ${capsHtml(t('home.pricingA'))}<br><small>${caps(t('home.pricingSmall'))}</small> ${capsHtml(t('home.pricingB'))}
        </h2>
        <p class="serif-lead membership__lead" data-reveal>${t('home.pricingLead')}</p>
        ${annual ? html`<span class="badge badge--new" data-reveal>${t('home.pricingFrom', { price: fmt.money(annual.monthlyPrice, annual.currency) })}</span>` : ''}
        <div class="membership__plans">${plans.map((p) => planCard(p, null))}</div>
        <div data-reveal>${cta(t('home.comparePlans'), { href: '#/pricing' })}</div>
      </div>
    </section>

    <section class="band on-cream">
      <div class="container container--narrow">
        <h2 class="serif serif--xl" data-reveal>${t('home.faqTitle')}</h2>
        <div class="accordion" data-reveal>${[1, 2, 3, 4, 5].map((n) => html`
          <details><summary>${t(`faq.q${n}`)} ${icon('plus')}</summary><p>${t(`faq.a${n}`, { days: trialDays })}</p></details>`)}
        </div>
      </div>
    </section>`;
}

// where the covers float in the "what should I read?" section: x%, y%, rotation, scale
const PICK_SPOTS = [
  [4, 8, -8, 1], [18, 30, 6, 0.8], [8, 62, -4, 1.1], [24, 78, 9, 0.85], [32, 6, -12, 0.75], [70, 4, 10, 0.8],
  [86, 14, -6, 1.05], [76, 36, 7, 0.75], [92, 52, -10, 0.95], [80, 72, 5, 1.1], [64, 84, -7, 0.8], [40, 88, 4, 0.7],
  [2, 40, 12, 0.7], [56, 12, -4, 0.62], [46, 70, 8, 0.6], [94, 86, -3, 0.75], [14, 92, -10, 0.8], [62, 52, 6, 0.55],
];

// the "stories" scatter around the statement: covers like snapshots with a year label
const SCATTER = [[3, 6, -6], [16, 44, 5], [6, 74, -3], [25, 86, 7], [82, 4, 8], [90, 36, -7], [74, 58, 4], [86, 80, -5]];
function scatter(items) {
  const picks = [...items].sort((a, b) => (a.year ?? 0) - (b.year ?? 0)).filter((_, i) => i % 3 === 0).slice(0, SCATTER.length);
  return html`<div class="scatter" aria-hidden="true">
    <svg class="scatter__lines" viewBox="0 0 1000 700" preserveAspectRatio="none">
      <ellipse cx="500" cy="380" rx="470" ry="300"/><ellipse cx="500" cy="420" rx="330" ry="250"/><path d="M40 640 C 260 420, 420 760, 620 520 S 900 300, 980 120"/>
    </svg>
    ${picks.map((b, i) => html`<figure class="snap" style="--x:${SCATTER[i][0]}%;--y:${SCATTER[i][1]}%;--r:${SCATTER[i][2]}deg" data-parallax="${0.04 + (i % 3) * 0.04}">
      <img src="${b.coverUrl}" alt="" loading="lazy" width="120" height="180">
      <figcaption><b>${fmt.year(b)}</b>${b.title}</figcaption>
    </figure>`)}
  </div>`;
}

// line-art vines for the forest bands (drawn, not images)
function ornament(cls) {
  return html`<svg class="${cls}" viewBox="0 0 200 420" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">
    <path d="M100 410 C 98 330, 104 260, 100 190 S 96 60, 100 10"/>
    ${[60, 120, 180, 240, 300, 360].map((y, i) => html`
      <path d="M100 ${y} C ${i % 2 ? 140 : 60} ${y - 24}, ${i % 2 ? 176 : 24} ${y - 8}, ${i % 2 ? 186 : 14} ${y - 40}"/>
      <path d="M${i % 2 ? 150 : 50} ${y - 22} c ${i % 2 ? 14 : -14} -18, ${i % 2 ? 34 : -34} -14, ${i % 2 ? 38 : -38} 4 c ${i % 2 ? -12 : 12} 12, ${i % 2 ? -30 : 30} 10, ${i % 2 ? -38 : 38} -4z"/>`)}
    <circle cx="100" cy="190" r="22"/><circle cx="100" cy="190" r="12"/><circle cx="100" cy="190" r="4"/>
  </svg>`;
}
