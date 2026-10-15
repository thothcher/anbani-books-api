// The reader: PDF.js renders the PDF page by page into a <canvas>.
// Full books are opened through a short-lived signed URL from GET /api/books/{id}/read
// (an <iframe> or PDF.js can't send the Authorization header, so the URL carries the permission).
// Reading position is saved with PUT /api/library/progress/{id}.
import * as pdfjs from '../../vendor/pdfjs/pdf.min.mjs';
import { html, render, on, $, debounce } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { get, put } from '../core/api.js';
import { session } from '../core/session.js';
import { navigate } from '../core/router.js';
import { icon, toastError } from '../core/ui.js';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

const THEMES = ['paper', 'sepia', 'night'];
const ZOOMS = [1, 1.25, 1.5, 1.85];

export default {
  title: () => t('reader.title'),
  async render(view, ctx) {
    const preview = ctx.path.startsWith('/preview');
    const id = ctx.params.id;
    const state = {
      book: null, pdf: null, page: 1, total: 0, zoom: 0,
      theme: localStorage.getItem('anbani.readerTheme') ?? 'paper',
      rendering: null, chapters: [], reloaded: false,
    };
    render(view, shell(state, preview));
    const stage = $('[data-stage]', view);

    // ── open the document ──────────────────────────────────────────────────
    let startPage = Number(ctx.query.get('page')) || 0;
    try {
      state.book = await get(`/api/books/${id}`);
      $('[data-title]', view).textContent = state.book.title;
      $('[data-author]', view).textContent = state.book.author;
      let url;
      if (preview) {
        if (!state.book.previewUrl) throw Object.assign(new Error(t('reader.noPreview')), { code: 'NO_PREVIEW' });
        url = state.book.previewUrl;
      } else {
        const link = await get(`/api/books/${id}/read`);
        url = link.url;
        startPage ||= link.lastPage ?? 1;
      }
      state.pdf = await pdfjs.getDocument({ url, rangeChunkSize: 1 << 16, isEvalSupported: false }).promise;
      state.total = state.pdf.numPages;
      state.chapters = state.book.chapters.length ? state.book.chapters : await outlineChapters(state.pdf);
      drawToc(view, state);
      await goTo(view, state, Math.min(Math.max(1, startPage || 1), state.total), preview);
    } catch (err) {
      return showError(view, err, id, preview);
    }

    // ── progress: saved a moment after the page stops changing ─────────────
    const saveProgress = debounce(async (pageNo) => {
      if (preview || !session.isAuthed) return;
      const label = $('[data-saved]', view);
      label.textContent = t('reader.saving');
      label.classList.remove('is-saved');
      try {
        await put(`/api/library/progress/${id}`, { currentPage: pageNo });
        label.textContent = t('reader.saved');
        label.classList.add('is-saved');
      } catch (err) {
        label.textContent = '';
        if (err.status === 402) showPaywall(view);
        else toastError(err);
      }
    }, 1200);
    state.onPageChange = (pageNo) => saveProgress(pageNo);

    // ── controls ───────────────────────────────────────────────────────────
    const go = (n) => goTo(view, state, n, preview);
    const onKey = (e) => {
      if (e.target.matches('input, textarea')) return;
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); go(state.page + 1); }
      if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); go(state.page - 1); }
      if (e.key === 'Home') go(1);
      if (e.key === 'End') go(state.total);
      if (e.key === 'Escape') $('[data-toc]', view).classList.remove('is-open');
    };
    document.addEventListener('keydown', onKey);
    let touchX = null;
    stage.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
    stage.addEventListener('touchend', (e) => {
      if (touchX == null) return;
      const dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 60) go(state.page + (dx < 0 ? 1 : -1));
      touchX = null;
    });
    const onResize = debounce(() => goTo(view, state, state.page, preview, true), 200);
    window.addEventListener('resize', onResize);

    const off = [
      on(view, 'click', '[data-go]', (e, b) => go(state.page + Number(b.dataset.go))),
      on(view, 'input', '[data-slider]', (e) => { $('[data-pageinput]', view).value = e.target.value; }),
      on(view, 'change', '[data-slider]', (e) => go(Number(e.target.value))),
      on(view, 'change', '[data-pageinput]', (e) => go(Number(e.target.value))),
      on(view, 'click', '[data-action="toc"]', () => $('[data-toc]', view).classList.toggle('is-open')),
      on(view, 'click', '[data-chapter]', (e, b) => { go(Number(b.dataset.chapter)); $('[data-toc]', view).classList.remove('is-open'); }),
      on(view, 'click', '[data-action="reader-theme"]', () => {
        state.theme = THEMES[(THEMES.indexOf(state.theme) + 1) % THEMES.length];
        localStorage.setItem('anbani.readerTheme', state.theme);
        $('.reader', view).dataset.theme = state.theme;
        $('[data-theme-label]', view).textContent = t('reader.themes.' + state.theme);
      }),
      on(view, 'click', '[data-action="zoom"]', () => { state.zoom = (state.zoom + 1) % ZOOMS.length; go(state.page); }),
      on(view, 'click', '[data-action="fullscreen"]', () => {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen?.().catch(() => {});
      }),
      on(view, 'click', '[data-action="close"]', () => navigate(`/books/${id}`)),
    ];
    return () => {
      off.forEach((f) => f());
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      state.pdf?.destroy();
    };
  },
};

function shell(state, preview) {
  return html`<div class="reader" data-theme="${state.theme}">
    <div class="reader__bar">
      <button class="btn btn--ghost btn--icon" data-action="close" aria-label="${t('reader.back')}">${icon('arrowLeft')}</button>
      <div class="reader__title"><strong data-title>…</strong><span><span data-author></span><span data-chapter-name></span></span></div>
      <span class="reader__saved" data-saved></span>
      <div class="reader__tools">
        <button class="btn btn--ghost btn--icon" data-action="toc" aria-label="${t('reader.contents')}" title="${t('reader.contents')}">${icon('toc')}</button>
        <button class="btn btn--ghost btn--sm" data-action="reader-theme" title="${t('reader.theme')}">${icon('palette')} <span class="hide-sm" data-theme-label>${t('reader.themes.' + state.theme)}</span></button>
        <button class="btn btn--ghost btn--icon hide-sm" data-action="zoom" aria-label="${t('reader.zoom')}" title="${t('reader.zoom')}">${icon('zoomIn')}</button>
        <button class="btn btn--ghost btn--icon hide-sm" data-action="fullscreen" aria-label="${t('reader.fullscreen')}" title="${t('reader.fullscreen')}">${icon('maximize')}</button>
      </div>
    </div>
    <div class="reader__stage" data-stage><div class="reader__msg"><div class="spinner"></div></div></div>
    <div class="reader__foot">
      <input class="reader__pageinput" data-pageinput type="number" min="1" value="1" aria-label="${t('reader.page')}">
      <span class="muted" data-total>/ …</span>
      <input class="reader__slider" data-slider type="range" min="1" max="1" value="1" aria-label="${t('reader.page')}">
      <span class="reader__percent" data-percent>0%</span>
    </div>
    <button class="reader__nav reader__nav--prev" data-go="-1" aria-label="${t('common.prev')}">${icon('chevronLeft')}</button>
    <button class="reader__nav reader__nav--next" data-go="1" aria-label="${t('common.next')}">${icon('chevronRight')}</button>
    <nav class="reader__toc" data-toc aria-label="${t('reader.contents')}"></nav>
    ${preview ? html`<div class="reader__preview-bar">${icon('eye')} ${t('reader.previewMode')}
      <a class="btn btn--primary btn--sm" href="${session.isAuthed ? '#/pricing' : '#/register'}">${t('reader.previewCta')}</a></div>` : ''}
  </div>`;
}

async function goTo(view, state, n, preview, force = false) {
  if (!state.pdf) return;
  const pageNo = Math.min(Math.max(1, n), state.total);
  if (pageNo === state.page && state.rendered && !force) return;
  const previous = state.page;
  state.page = pageNo;

  const stage = $('[data-stage]', view);
  let wrap = $('.reader__page', stage);
  if (!wrap) {
    render(stage, html`<div class="reader__page"><canvas></canvas></div>`);
    wrap = $('.reader__page', stage);
  }
  wrap.classList.add('is-turning');
  try {
    state.rendering?.cancel();
    const page = await state.pdf.getPage(pageNo);
    const base = page.getViewport({ scale: 1 });
    const fit = Math.min((stage.clientWidth - 24) / base.width, (stage.clientHeight - 40) / base.height);
    const scale = Math.max(0.5, fit) * ZOOMS[state.zoom];
    const viewport = page.getViewport({ scale: scale * (window.devicePixelRatio || 1) });
    const canvas = $('canvas', wrap);
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${Math.floor(viewport.width / (window.devicePixelRatio || 1))}px`;
    canvas.style.height = `${Math.floor(viewport.height / (window.devicePixelRatio || 1))}px`;
    state.rendering = page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport });
    await state.rendering.promise;
    state.rendered = true;
  } catch (err) {
    if (err?.name === 'RenderingCancelledException') return;
    // a signed link expires after a while — get a fresh one once and continue
    if (!preview && !state.reloaded) {
      state.reloaded = true;
      try {
        const link = await get(`/api/books/${state.book.id}/read`);
        state.pdf = await pdfjs.getDocument({ url: link.url, isEvalSupported: false }).promise;
        return goTo(view, state, pageNo, preview, true);
      } catch (e) { return showError(view, e, state.book.id, preview); }
    }
    return showError(view, err, state.book.id, preview);
  } finally {
    wrap.classList.remove('is-turning');
  }

  // footer + chapter name
  $('[data-pageinput]', view).value = pageNo;
  $('[data-pageinput]', view).max = state.total;
  $('[data-total]', view).textContent = `/ ${state.total}`;
  const slider = $('[data-slider]', view);
  slider.max = state.total;
  slider.value = pageNo;
  $('[data-percent]', view).textContent = `${Math.round((pageNo / state.total) * 100)}%`;
  const chapter = [...state.chapters].reverse().find((c) => c.page <= pageNo);
  $('[data-chapter-name]', view).textContent = chapter?.title ? ` · ${chapter.title}` : '';
  view.querySelectorAll('[data-chapter]').forEach((b) => b.classList.toggle('is-current', b === $(`[data-chapter="${chapter?.page}"]`, view)));
  $('[data-go="-1"]', view).disabled = pageNo <= 1;
  $('[data-go="1"]', view).disabled = pageNo >= state.total;
  if (pageNo !== previous || !state.savedOnce) {
    state.savedOnce = true;
    state.onPageChange?.(pageNo);
  }
}

function drawToc(view, state) {
  render($('[data-toc]', view), html`<h2>${t('reader.contents')}</h2>
    ${state.chapters.length
      ? state.chapters.map((c) => html`<button class="${c.level ? 'lvl-1' : ''}" data-chapter="${c.page}"><span>${c.title}</span><span>${c.page}</span></button>`)
      : html`<p class="muted small">${t('reader.noContents')}</p>`}`);
}

/** For uploaded PDFs without a chapter list: read the PDF's own bookmarks. */
async function outlineChapters(pdf) {
  try {
    const outline = (await pdf.getOutline()) ?? [];
    const out = [];
    for (const item of outline.slice(0, 80)) {
      const dest = typeof item.dest === 'string' ? await pdf.getDestination(item.dest) : item.dest;
      if (!dest) continue;
      out.push({ title: item.title, page: (await pdf.getPageIndex(dest[0])) + 1, level: 0 });
    }
    return out;
  } catch { return []; }
}

function showPaywall(view) {
  render($('[data-stage]', view), html`<div class="reader__msg"><div>
    <div class="state__art" style="margin:0 auto 1rem">${icon('lock')}</div>
    <h2>${t('reader.accessEnded')}</h2><p class="muted">${t('reader.accessEndedText')}</p>
    <a class="btn btn--primary" href="#/pricing">${t('reader.previewCta')}</a></div></div>`);
}

function showError(view, err, id, preview) {
  const stage = $('[data-stage]', view);
  if (err?.status === 402) return showPaywall(view);
  render(stage, html`<div class="reader__msg"><div>
    <div class="state__art" style="margin:0 auto 1rem">!</div>
    <h2>${t('reader.cannotOpen')}</h2>
    <p class="muted">${err?.detail || err?.message || t('errors.generic')}</p>
    ${err?.code ? html`<p class="state__code">${err.code}</p>` : ''}
    ${err?.status === 401 ? html`<a class="btn btn--primary" href="#/login?next=${encodeURIComponent(`/${preview ? 'preview' : 'read'}/${id}`)}">${t('nav.login')}</a>`
      : html`<a class="btn" href="#/books/${id}">${t('reader.back')}</a>`}
  </div></div>`);
}
