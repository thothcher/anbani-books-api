// Admin panel of the sandbox. Only users with role "admin" get here (the first
// account registered with an API key is its admin).
import { html, render, on, $, formData, debounce } from '../core/dom.js';
import { t, fmt } from '../core/i18n.js';
import { get, post, put, del, upload } from '../core/api.js';
import { session } from '../core/session.js';
import { navigate, resolve, setQuery } from '../core/router.js';
import { icon, loadingBlock, errorState, emptyState, toast, toastError, setBusy, showFormErrors, confirmDialog, modal, pagination, avatar, statusBadge, capsHtml } from '../core/ui.js';
import { barChart, donut, legend } from '../components/charts.js';

const SECTIONS = [
  { key: 'dashboard', icon: 'chart', href: '#/admin' },
  { key: 'books', icon: 'book', href: '#/admin/books' },
  { key: 'categories', icon: 'tag', href: '#/admin/categories' },
  { key: 'users', icon: 'users', href: '#/admin/users' },
  { key: 'payments', icon: 'receipt', href: '#/admin/payments' },
];

export default {
  title: (ctx) => `${t('nav.admin')} · ${t('admin.sections.' + (ctx.params.section ?? 'dashboard'))}`,
  async render(view, ctx) {
    const section = ctx.params.section ?? 'dashboard';
    render(view, html`<div class="page container">
      <div class="admin">
        <nav class="admin__nav" aria-label="${t('nav.admin')}">
          <div class="admin__nav-title">${t('admin.panel')}</div>
          ${SECTIONS.map((s) => html`<a href="${s.href}" class="${s.key === section ? 'is-active' : ''}">${icon(s.icon)} ${t('admin.sections.' + s.key)}</a>`)}
        </nav>
        <section data-admin>${loadingBlock()}</section>
      </div>
    </div>`);
    const box = $('[data-admin]', view);
    const handlers = { dashboard, books: ctx.params.id ? editor : books, categories, users, payments };
    try {
      return await (handlers[section] ?? dashboard)(box, ctx);
    } catch (err) {
      render(box, errorState(err, { retry: false }));
    }
  },
};

const head = (title, lead, actions = '') => html`<div class="row row--between" style="margin-bottom:1.5rem;align-items:flex-end">
  <div><h1 class="caps caps--m" style="margin:0">${capsHtml(title)}</h1>${lead ? html`<p class="muted" style="margin:.25rem 0 0">${lead}</p>` : ''}</div>${actions}</div>`;

// ── dashboard ────────────────────────────────────────────────────────────────
async function dashboard(box) {
  const s = await get('/api/admin/stats');
  const day = (d) => fmt.date(d, { day: 'numeric', month: 'short' });
  const subs = [
    { label: t('status.active'), value: s.subscriptions.active, color: 'var(--forest)' },
    { label: t('status.trialing'), value: s.subscriptions.trialing, color: 'var(--lapis)' },
    { label: t('status.canceled'), value: s.subscriptions.canceled, color: 'var(--amber)' },
    { label: t('status.expired'), value: s.subscriptions.expired, color: 'var(--cinnabar)' },
    { label: t('status.none'), value: s.subscriptions.none, color: 'var(--paper-3)' },
  ];
  render(box, html`
    ${head(t('admin.dashboardTitle'), t('admin.dashboardLead'))}
    <div class="kpis">
      <div class="kpi"><div class="kpi__label">${icon('users')} ${t('admin.kpi.users')}</div><div class="kpi__value">${fmt.number(s.users.total)}</div><div class="kpi__note">${t('admin.kpi.newWeek', { n: s.users.newLast7Days })} · ${t('admin.kpi.verified', { n: s.users.verified })}</div></div>
      <div class="kpi"><div class="kpi__label">${icon('crown')} ${t('admin.kpi.subscribers')}</div><div class="kpi__value">${s.subscriptions.active + s.subscriptions.canceled}</div><div class="kpi__note">${t('admin.kpi.trialing', { n: s.subscriptions.trialing })}</div></div>
      <div class="kpi"><div class="kpi__label">${icon('trending')} MRR</div><div class="kpi__value">${fmt.money(s.revenue.mrr, s.revenue.currency)}</div><div class="kpi__note">${t('admin.kpi.mrrHint')}</div></div>
      <div class="kpi"><div class="kpi__label">${icon('wallet')} ${t('admin.kpi.revenue30')}</div><div class="kpi__value">${fmt.money(s.revenue.last30Days, s.revenue.currency)}</div><div class="kpi__note">${t('admin.kpi.failed', { n: s.revenue.failedPayments })}</div></div>
    </div>
    <div class="charts">
      <div class="card card--pad"><h2 style="font-size:var(--text-md)">${t('admin.chartSignups')}</h2>${barChart(s.signups.map((p) => ({ label: day(p.date), value: p.value })), { alt: true })}</div>
      <div class="card card--pad"><h2 style="font-size:var(--text-md)">${t('admin.chartSubscriptions')}</h2>
        <div class="donut-wrap">${donut(subs, { center: String(s.users.total) })}${legend(subs)}</div></div>
    </div>
    <div class="charts">
      <div class="card card--pad"><h2 style="font-size:var(--text-md)">${t('admin.chartRevenue')}</h2>${barChart(s.revenueByDay.map((p) => ({ label: day(p.date), value: p.value })), { format: (v) => `₾${v}` })}</div>
      <div class="card card--pad"><h2 style="font-size:var(--text-md)">${t('admin.topBooks')}</h2>
        <ol class="top-books">${s.topBooks.map((b, i) => html`<li><span class="rank">${i + 1}</span><img src="${b.coverUrl}" alt=""><a href="#/books/${b.id}">${b.title}<br><span class="xsmall muted">${b.author}</span></a><span class="small muted">${fmt.compact(b.readers)}</span></li>`)}</ol>
      </div>
    </div>
    <div class="kpis" style="margin-top:1rem">
      <div class="kpi"><div class="kpi__label">${icon('book')} ${t('admin.kpi.books')}</div><div class="kpi__value">${s.books.total}</div><div class="kpi__note">${t('admin.kpi.custom', { n: s.books.custom })} · ${t('admin.kpi.drafts', { n: s.books.drafts })}</div></div>
      <div class="kpi"><div class="kpi__label">${icon('bookOpen')} ${t('admin.kpi.readers7')}</div><div class="kpi__value">${s.reading.activeReaders7d}</div><div class="kpi__note">${t('admin.kpi.pages30', { n: fmt.number(s.reading.pagesRead30d) })}</div></div>
      <div class="kpi"><div class="kpi__label">${icon('star')} ${t('admin.kpi.reviews')}</div><div class="kpi__value">${s.reading.reviews}</div><div class="kpi__note">&nbsp;</div></div>
      <div class="kpi"><div class="kpi__label">${icon('wallet')} ${t('admin.kpi.revenueTotal')}</div><div class="kpi__value">${fmt.money(s.revenue.total, s.revenue.currency)}</div><div class="kpi__note">${t('admin.kpi.sandboxMoney')}</div></div>
    </div>`);
}

// ── books ────────────────────────────────────────────────────────────────────
async function books(box, ctx) {
  let q = ctx.query.get('q') ?? '';
  let pageNo = Number(ctx.query.get('page') ?? 1);
  const draw = async () => {
    const res = await get('/api/books', { query: { q, page: pageNo, pageSize: 15, sort: 'newest', includeDrafts: true } });
    render($('[data-table]', box), res.items.length ? html`
      <div class="table-wrap"><table class="table">
        <thead><tr><th>${t('admin.book')}</th><th>${t('admin.category')}</th><th>${t('admin.status')}</th><th class="num">${t('admin.pages')}</th><th class="num">${t('admin.readers')}</th><th></th></tr></thead>
        <tbody>${res.items.map((b) => html`<tr>
          <td><div class="cell-book"><img src="${b.coverUrl}" alt=""><div><strong>${b.title}</strong><small>${b.author} · ${b.language.toUpperCase()}</small></div></div></td>
          <td>${b.category.name}</td>
          <td>${b.isSystem ? html`<span class="badge" title="${t('admin.builtInHint')}">${icon('lock')} ${t('admin.builtIn')}</span>` : b.isPublished ? html`<span class="badge badge--success">${t('admin.published')}</span>` : html`<span class="badge badge--warning">${t('admin.draft')}</span>`}
            ${b.isFree ? html` <span class="badge badge--free">${t('book.free')}</span>` : ''}</td>
          <td class="num">${b.pages}</td>
          <td class="num">${fmt.compact(b.readers)}</td>
          <td><div class="row-actions">
            <a class="btn btn--ghost btn--icon btn--sm" href="#/books/${b.id}" aria-label="${t('admin.view')}" data-tip="${t('admin.view')}">${icon('eye')}</a>
            ${b.isSystem ? '' : html`<a class="btn btn--ghost btn--icon btn--sm" href="#/admin/books/${b.id}" aria-label="${t('common.edit')}" data-tip="${t('common.edit')}">${icon('edit')}</a>`}
          </div></td>
        </tr>`)}</tbody>
      </table></div>${pagination(res)}` : emptyState({ title: t('admin.noBooks') }));
  };
  render(box, html`${head(t('admin.booksTitle'), t('admin.booksLead'), html`<a class="btn btn--primary" href="#/admin/books/new">${icon('plus')} ${t('admin.addBook')}</a>`)}
    <div class="admin-toolbar"><label class="input-icon">${icon('search')}<input class="input" type="search" data-q value="${q}" placeholder="${t('catalog.searchPlaceholder')}"></label></div>
    <div data-table>${loadingBlock()}</div>`);
  await draw();
  const search = debounce((v) => { q = v; pageNo = 1; setQuery({ q, page: '' }); draw(); }, 300);
  const off = [
    on(box, 'input', '[data-q]', (e) => search(e.target.value.trim())),
    on(box, 'click', '[data-page]', (e, b) => { pageNo = Number(b.dataset.page); setQuery({ q, page: pageNo }); draw(); }),
  ];
  return () => off.forEach((f) => f());
}

async function editor(box, ctx) {
  const isNew = ctx.params.id === 'new';
  const [categories, book] = await Promise.all([get('/api/categories'), isNew ? Promise.resolve(null) : get(`/api/books/${ctx.params.id}`)]);
  if (book?.isSystem) return render(box, emptyState({ letter: '🔒', title: t('admin.builtIn'), text: t('admin.builtInHint'), action: html`<a class="btn" href="#/admin/books">${t('admin.sections.books')}</a>` }));
  const b = book ?? { title: '', author: '', translator: '', description: '', tags: [], language: 'ka', year: '', isFree: false, category: { id: categories[0]?.id } };
  const field = (name, label, input, cls = '') => html`<div class="field ${cls}"><label class="field__label" for="b-${name}">${label}</label>${input}<span class="field__error"></span></div>`;

  render(box, html`
    ${head(isNew ? t('admin.newBook') : t('admin.editBook'), isNew ? t('admin.newBookLead') : b.title,
      isNew ? '' : html`<a class="btn btn--ghost" href="#/books/${b.id}">${icon('eye')} ${t('admin.view')}</a>`)}
    <div class="editor">
      <form class="card card--pad" data-book novalidate>
        <div class="form-grid">
          ${field('title', t('admin.fields.title'), html`<input class="input" id="b-title" name="title" value="${b.title}" maxlength="150">`, 'span-2')}
          ${field('author', t('admin.fields.author'), html`<input class="input" id="b-author" name="author" value="${b.author}">`)}
          ${field('translator', t('admin.fields.translator'), html`<input class="input" id="b-translator" name="translator" value="${b.translator ?? ''}">`)}
          ${field('categoryId', t('admin.category'), html`<select class="select" id="b-categoryId" name="categoryId">${categories.map((c) => html`<option value="${c.id}" ${c.id === b.category?.id ? 'selected' : ''}>${c.name}</option>`)}</select>`)}
          ${field('language', t('catalog.language'), html`<select class="select" id="b-language" name="language"><option value="ka" ${b.language === 'ka' ? 'selected' : ''}>ქართული</option><option value="en" ${b.language === 'en' ? 'selected' : ''}>English</option></select>`)}
          ${field('year', t('admin.fields.year'), html`<input class="input" id="b-year" name="year" type="number" value="${b.year ?? ''}" placeholder="1887">`)}
          ${field('tags', t('admin.fields.tags'), html`<input class="input" id="b-tags" name="tags" value="${b.tags.join(', ')}" placeholder="classic, novel">`)}
          ${field('description', t('admin.fields.description'), html`<textarea class="textarea" id="b-description" name="description" maxlength="4000">${isNew ? '' : (b.description ?? '')}</textarea>`, 'span-2')}
          ${field('descriptionEn', t('admin.fields.descriptionEn'), html`<textarea class="textarea" id="b-descriptionEn" name="descriptionEn" maxlength="4000"></textarea>`, 'span-2')}
          <div class="span-2"><label class="switch"><input type="checkbox" name="isFree" ${b.isFree ? 'checked' : ''}><span class="switch__track"></span>${t('admin.fields.isFree')}</label></div>
        </div>
        <div class="row row--end" style="margin-top:1.5rem">
          ${isNew ? '' : html`<button class="btn btn--danger" type="button" data-action="delete">${icon('trash')} ${t('common.delete')}</button><span class="grow"></span>`}
          <button class="btn btn--primary" type="submit">${isNew ? t('admin.createDraft') : t('common.save')}</button>
        </div>
      </form>
      <aside class="editor__side">
        ${isNew ? html`<div class="panel small">${t('admin.uploadAfterCreate')}</div>` : html`
          <div class="card card--pad">
            <h3 style="font-size:var(--text-md)">${t('admin.publishing')}</h3>
            <label class="switch"><input type="checkbox" data-publish ${b.isPublished ? 'checked' : ''} ${b.hasPdf ? '' : 'disabled'}><span class="switch__track"></span>${b.isPublished ? t('admin.published') : t('admin.draft')}</label>
            ${b.hasPdf ? '' : html`<p class="xsmall muted" style="margin:.6rem 0 0">${t('admin.needPdf')}</p>`}
          </div>
          <div class="card card--pad">
            <h3 style="font-size:var(--text-md)">PDF</h3>
            ${b.hasPdf ? html`<p class="small">${t('admin.pdfInfo', { pages: b.pages, preview: b.previewPages })}</p>` : ''}
            <label class="dropzone" data-drop="pdf">${icon('upload')}<strong class="small">${b.hasPdf ? t('admin.replacePdf') : t('admin.uploadPdf')}</strong><span class="xsmall muted">${t('admin.pdfHint')}</span><input type="file" accept="application/pdf" data-file="pdf"></label>
          </div>
          <div class="card card--pad">
            <h3 style="font-size:var(--text-md)">${t('admin.cover')}</h3>
            <div class="cover" style="max-width:150px;margin:0 auto 1rem"><img src="${b.coverUrl}" alt=""></div>
            <label class="dropzone" data-drop="cover">${icon('upload')}<strong class="small">${t('admin.uploadCover')}</strong><span class="xsmall muted">${t('admin.coverHint')}</span><input type="file" accept="image/png,image/jpeg,image/webp" data-file="cover"></label>
            <button class="btn btn--ghost btn--sm btn--block" data-action="generated-cover" style="margin-top:.5rem">${t('admin.useGenerated')}</button>
          </div>`}
      </aside>
    </div>`);

  const form = $('[data-book]', box);
  const payload = () => {
    const d = formData(form);
    return {
      title: d.title, author: d.author, translator: d.translator, description: d.description || (isNew ? '' : null), descriptionEn: d.descriptionEn || null,
      categoryId: Number(d.categoryId), language: d.language, year: d.year ? Number(d.year) : null,
      tags: d.tags ? d.tags.split(',').map((x) => x.trim()).filter(Boolean) : [], isFree: form.elements.isFree.checked,
    };
  };
  const uploadFile = async (kind, file) => {
    const zone = $(`[data-drop="${kind}"]`, box);
    zone.classList.add('is-over');
    zone.querySelector('strong').textContent = t('admin.uploading');
    try {
      const res = await upload(`/api/books/${b.id}/${kind}`, file);
      toast(kind === 'pdf' ? t('admin.pdfUploaded', { pages: res.pages }) : t('admin.coverUploaded'), { type: 'success' });
      resolve();
    } catch (err) { toastError(err); resolve(); }
  };

  const off = [
    on(box, 'submit', '[data-book]', async (e) => {
      e.preventDefault();
      const btn = $('button[type="submit"]', form);
      setBusy(btn, true);
      try {
        const saved = isNew ? await post('/api/books', payload()) : await put(`/api/books/${b.id}`, payload());
        toast(isNew ? t('admin.created') : t('admin.saved'), { type: 'success' });
        if (isNew) navigate(`/admin/books/${saved.id}`);
        else setBusy(btn, false);
      } catch (err) { setBusy(btn, false); if (!showFormErrors(form, err)) toastError(err); }
    }),
    on(box, 'change', '[data-file]', (e) => { const f = e.target.files[0]; if (f) uploadFile(e.target.dataset.file, f); }),
    on(box, 'dragover', '[data-drop]', (e, z) => { e.preventDefault(); z.classList.add('is-over'); }),
    on(box, 'dragleave', '[data-drop]', (e, z) => z.classList.remove('is-over')),
    on(box, 'drop', '[data-drop]', (e, z) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) uploadFile(z.dataset.drop, f); }),
    on(box, 'change', '[data-publish]', async (e) => {
      try {
        await put(`/api/books/${b.id}`, { isPublished: e.target.checked });
        toast(e.target.checked ? t('admin.publishedNow') : t('admin.unpublished'), { type: 'success' });
        resolve();
      } catch (err) { e.target.checked = !e.target.checked; toastError(err); }
    }),
    on(box, 'click', '[data-action="generated-cover"]', async () => {
      try { await del(`/api/books/${b.id}/cover`); resolve(); } catch (err) { toastError(err); }
    }),
    on(box, 'click', '[data-action="delete"]', async () => {
      if (!await confirmDialog({ title: t('admin.deleteBookTitle'), text: t('admin.deleteBookText', { title: b.title }), confirmText: t('common.delete'), danger: true })) return;
      try { await del(`/api/books/${b.id}`); toast(t('admin.deleted'), { type: 'success' }); navigate('/admin/books'); } catch (err) { toastError(err); }
    }),
  ];
  return () => off.forEach((f) => f());
}

// ── categories ───────────────────────────────────────────────────────────────
async function categories(box) {
  const draw = async () => {
    const list = await get('/api/categories');
    render(box, html`${head(t('admin.categoriesTitle'), t('admin.categoriesLead'))}
      <form class="card card--pad" data-add novalidate style="margin-bottom:1rem">
        <div class="form-grid">
          <div class="field"><label class="field__label" for="c-name">${t('admin.fields.nameKa')}</label><input class="input" id="c-name" name="name" placeholder="პროგრამირება"><span class="field__error"></span></div>
          <div class="field"><label class="field__label" for="c-nameEn">${t('admin.fields.nameEn')}</label><input class="input" id="c-nameEn" name="nameEn" placeholder="Programming"><span class="field__error"></span></div>
        </div>
        <div class="row row--end" style="margin-top:1rem"><button class="btn btn--primary" type="submit">${icon('plus')} ${t('admin.addCategory')}</button></div>
      </form>
      <div class="card">${list.map((c) => html`<div class="cat-row">
        <span class="cat-row__name">${c.name}<small>${c.nameEn ?? ''} · ${t('home.booksCount', { count: c.bookCount })}</small></span>
        ${c.isSystem ? html`<span class="badge">${icon('lock')} ${t('admin.builtIn')}</span>` : html`
          <button class="btn btn--ghost btn--icon btn--sm" data-edit="${c.id}" data-name="${c.name}" data-name-en="${c.nameEn ?? ''}" aria-label="${t('common.edit')}">${icon('edit')}</button>
          <button class="btn btn--ghost btn--icon btn--sm" data-delete="${c.id}" aria-label="${t('common.delete')}">${icon('trash')}</button>`}
      </div>`)}</div>`);
  };
  await draw();
  const off = [
    on(box, 'submit', '[data-add]', async (e) => {
      e.preventDefault();
      const form = e.target;
      try { await post('/api/categories', formData(form)); toast(t('admin.categoryAdded'), { type: 'success' }); await draw(); }
      catch (err) { if (!showFormErrors(form, err)) toastError(err); }
    }),
    on(box, 'click', '[data-delete]', async (e, b) => {
      if (!await confirmDialog({ title: t('admin.deleteCategory'), text: t('admin.deleteCategoryText'), confirmText: t('common.delete'), danger: true })) return;
      try { await del(`/api/categories/${b.dataset.delete}`); await draw(); } catch (err) { toastError(err); }
    }),
    on(box, 'click', '[data-edit]', (e, b) => {
      const { el, close } = modal({
        title: t('admin.editCategory'),
        body: html`<form novalidate>
          <div class="field"><label class="field__label" for="e-name">${t('admin.fields.nameKa')}</label><input class="input" id="e-name" name="name" value="${b.dataset.name}"><span class="field__error"></span></div>
          <div class="field"><label class="field__label" for="e-nameEn">${t('admin.fields.nameEn')}</label><input class="input" id="e-nameEn" name="nameEn" value="${b.dataset.nameEn}"><span class="field__error"></span></div>
          <div class="modal__foot"><button class="btn" type="button" data-close>${t('common.cancel')}</button><button class="btn btn--primary">${t('common.save')}</button></div>
        </form>`,
      });
      $('form', el).addEventListener('submit', async (ev) => {
        ev.preventDefault();
        try { await put(`/api/categories/${b.dataset.edit}`, formData(ev.target)); close(); await draw(); }
        catch (err) { if (!showFormErrors(ev.target, err)) toastError(err); }
      });
    }),
  ];
  return () => off.forEach((f) => f());
}

// ── users ────────────────────────────────────────────────────────────────────
async function users(box, ctx) {
  const state = { q: ctx.query.get('q') ?? '', status: ctx.query.get('status') ?? '', role: ctx.query.get('role') ?? '', page: 1 };
  const plans = await get('/api/plans');
  render(box, html`${head(t('admin.usersTitle'), t('admin.usersLead'))}
    <div class="admin-toolbar">
      <label class="input-icon">${icon('search')}<input class="input" type="search" data-q value="${state.q}" placeholder="${t('admin.searchUsers')}"></label>
      <select class="select" data-status><option value="">${t('admin.allStatuses')}</option>${['none', 'trialing', 'active', 'canceled', 'expired'].map((s) => html`<option value="${s}" ${state.status === s ? 'selected' : ''}>${t('status.' + s)}</option>`)}</select>
      <select class="select" data-role><option value="">${t('admin.allRoles')}</option><option value="user" ${state.role === 'user' ? 'selected' : ''}>User</option><option value="admin" ${state.role === 'admin' ? 'selected' : ''}>Admin</option></select>
    </div>
    <div data-table>${loadingBlock()}</div>`);
  const draw = async () => {
    const res = await get('/api/admin/users', { query: { q: state.q, status: state.status, role: state.role, page: state.page, pageSize: 15 } });
    render($('[data-table]', box), res.items.length ? html`<div class="table-wrap"><table class="table">
      <thead><tr><th>${t('admin.user')}</th><th>${t('admin.role')}</th><th>${t('admin.subscription')}</th><th class="num">${t('admin.started')}</th><th class="num">${t('admin.spent')}</th><th>${t('admin.joined')}</th><th></th></tr></thead>
      <tbody>${res.items.map((u) => html`<tr>
        <td><div class="cell-user">${avatar(u)}<div><strong>${u.firstName} ${u.lastName}</strong>${u.isDemoAccount ? html` <span class="badge">${icon('lock')} demo</span>` : ''}<small>${u.email}${u.isVerified ? '' : ' · ' + t('account.notVerified')}</small></div></div></td>
        <td>${u.role === 'admin' ? html`<span class="badge badge--accent">Admin</span>` : html`<span class="badge">User</span>`}</td>
        <td>${statusBadge(u.subscription.status)}${u.subscription.planCode ? html`<br><span class="xsmall muted">${u.subscription.planCode}</span>` : ''}</td>
        <td class="num">${u.booksStarted}</td>
        <td class="num">${fmt.money(u.totalSpent)}</td>
        <td class="nowrap small">${fmt.short(u.createdAt)}</td>
        <td><div class="row-actions">${u.id === session.user.id || u.isDemoAccount ? '' : html`
          <button class="btn btn--ghost btn--icon btn--sm" data-role-toggle="${u.id}" data-to="${u.role === 'admin' ? 'user' : 'admin'}" data-tip="${u.role === 'admin' ? t('admin.removeAdmin') : t('admin.makeAdmin')}">${icon('crown')}</button>
          <button class="btn btn--ghost btn--icon btn--sm" data-grant="${u.id}" data-name="${u.firstName}" data-tip="${t('admin.grant')}">${icon('gift')}</button>
          <button class="btn btn--ghost btn--icon btn--sm" data-delete-user="${u.id}" data-name="${u.email}" data-tip="${t('common.delete')}">${icon('trash')}</button>`}</div></td>
      </tr>`)}</tbody></table></div>${pagination(res)}` : emptyState({ title: t('admin.noUsers') }));
  };
  await draw();
  const sync = () => { state.page = 1; setQuery({ q: state.q, status: state.status, role: state.role }); draw(); };
  const search = debounce((v) => { state.q = v; sync(); }, 300);
  const off = [
    on(box, 'input', '[data-q]', (e) => search(e.target.value.trim())),
    on(box, 'change', '[data-status]', (e) => { state.status = e.target.value; sync(); }),
    on(box, 'change', '[data-role]', (e) => { state.role = e.target.value; sync(); }),
    on(box, 'click', '[data-page]', (e, b) => { state.page = Number(b.dataset.page); draw(); }),
    on(box, 'click', '[data-role-toggle]', async (e, b) => {
      try { await put(`/api/admin/users/${b.dataset.roleToggle}/role`, { role: b.dataset.to }); toast(t('admin.roleChanged'), { type: 'success' }); draw(); } catch (err) { toastError(err); }
    }),
    on(box, 'click', '[data-delete-user]', async (e, b) => {
      if (!await confirmDialog({ title: t('admin.deleteUser'), text: t('admin.deleteUserText', { email: b.dataset.name }), confirmText: t('common.delete'), danger: true })) return;
      try { await del(`/api/admin/users/${b.dataset.deleteUser}`); toast(t('admin.userDeleted'), { type: 'success' }); draw(); } catch (err) { toastError(err); }
    }),
    on(box, 'click', '[data-grant]', (e, b) => {
      const { el, close } = modal({
        title: t('admin.grantTitle', { name: b.dataset.name }),
        body: html`<form novalidate>
          <p class="small muted">${t('admin.grantText')}</p>
          <div class="form-grid">
            <div class="field"><label class="field__label" for="g-plan">${t('membership.plan')}</label><select class="select" id="g-plan" name="planId">${plans.map((p) => html`<option value="${p.id}">${p.name}</option>`)}</select><span class="field__error"></span></div>
            <div class="field"><label class="field__label" for="g-days">${t('admin.days')}</label><input class="input" id="g-days" name="days" type="number" value="30" min="1" max="365"><span class="field__error"></span></div>
          </div>
          <div class="modal__foot"><button class="btn" type="button" data-close>${t('common.cancel')}</button><button class="btn btn--primary">${icon('gift')} ${t('admin.grant')}</button></div>
        </form>`,
      });
      $('form', el).addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const d = formData(ev.target);
        try { await post(`/api/admin/users/${b.dataset.grant}/grant`, { planId: Number(d.planId), days: Number(d.days) }); close(); toast(t('admin.granted'), { type: 'success' }); draw(); }
        catch (err) { if (!showFormErrors(ev.target, err)) toastError(err); }
      });
    }),
  ];
  return () => off.forEach((f) => f());
}

// ── payments ─────────────────────────────────────────────────────────────────
async function payments(box) {
  const state = { status: '', page: 1 };
  render(box, html`${head(t('admin.paymentsTitle'), t('admin.paymentsLead'))}
    <div class="admin-toolbar"><select class="select" data-status><option value="">${t('admin.allPayments')}</option><option value="succeeded">${t('payments.succeeded')}</option><option value="failed">${t('payments.failed')}</option></select></div>
    <div data-table>${loadingBlock()}</div>`);
  const draw = async () => {
    const res = await get('/api/admin/payments', { query: { status: state.status, page: state.page, pageSize: 20 } });
    render($('[data-table]', box), res.items.length ? html`<div class="table-wrap"><table class="table">
      <thead><tr><th>${t('payments.date')}</th><th>${t('admin.user')}</th><th>${t('payments.description')}</th><th>${t('payments.status')}</th><th class="num">${t('payments.amount')}</th></tr></thead>
      <tbody>${res.items.map((p) => html`<tr>
        <td class="nowrap">${fmt.dateTime(p.createdAt)}<br><span class="xsmall muted mono">${p.invoiceNumber}</span></td>
        <td><strong>${p.userName}</strong><br><span class="xsmall muted">${p.userEmail}</span></td>
        <td>${p.description}<br><span class="xsmall muted">${p.cardLast4 ? `${(p.cardBrand ?? '').toUpperCase()} •••• ${p.cardLast4}` : ''}</span></td>
        <td>${p.status === 'succeeded' ? html`<span class="badge badge--success">${t('payments.succeeded')}</span>` : html`<span class="badge badge--danger">${p.failureCode}</span>`}</td>
        <td class="num"><strong>${fmt.money(p.amount, p.currency)}</strong></td>
      </tr>`)}</tbody></table></div>${pagination(res)}` : emptyState({ title: t('payments.emptyTitle') }));
  };
  await draw();
  const off = [
    on(box, 'change', '[data-status]', (e) => { state.status = e.target.value; state.page = 1; draw(); }),
    on(box, 'click', '[data-page]', (e, b) => { state.page = Number(b.dataset.page); draw(); }),
  ];
  return () => off.forEach((f) => f());
}
