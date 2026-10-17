// Account: profile, membership (the "library card"), payments and security.
import { html, render, on, $, formData } from '../core/dom.js';
import { t, fmt } from '../core/i18n.js';
import { get, put, post, del, upload } from '../core/api.js';
import { session, reloadUser, clearSession } from '../core/session.js';
import { navigate, resolve } from '../core/router.js';
import { icon, loadingBlock, errorState, toast, toastError, setBusy, showFormErrors, clearFormErrors, confirmDialog, avatar, modal, pagination, emptyState, pageHero } from '../core/ui.js';

const TABS = [
  { key: 'profile', icon: 'user' },
  { key: 'membership', icon: 'card' },
  { key: 'payments', icon: 'receipt' },
  { key: 'security', icon: 'shield' },
];

export default {
  title: (ctx) => t(`account.tabs.${ctx.params.tab ?? 'profile'}`),
  async render(view, ctx) {
    const tab = TABS.some((x) => x.key === ctx.params.tab) ? ctx.params.tab : 'profile';
    render(view, html`<div class="page container">
      ${pageHero({ kicker: t('account.kicker'), title: t('account.heading'), compact: true })}
      <nav class="account__nav" aria-label="${t('account.heading')}"><div class="tabs">${TABS.map((x) => html`<a href="#/account/${x.key}" class="tab ${x.key === tab ? 'is-active' : ''}" aria-current="${x.key === tab ? 'page' : 'false'}">${icon(x.icon)} ${t('account.tabs.' + x.key)}</a>`)}</div></nav>
      <div class="account__body"><section data-tab>${loadingBlock()}</section></div>
    </div>`);
    const box = $('[data-tab]', view);
    const tabs = { profile, membership, payments, security };
    try {
      return await tabs[tab](box, ctx);
    } catch (err) {
      render(box, errorState(err, { retry: false }));
    }
  },
};

// ── profile ──────────────────────────────────────────────────────────────────
async function profile(box) {
  const p = await get('/api/users/profile');
  const field = (name, label, value, attrs = '') => html`<div class="field"><label class="field__label" for="p-${name}">${label}</label><input class="input" id="p-${name}" name="${name}" value="${value ?? ''}" ${attrs}><span class="field__error"></span></div>`;
  render(box, html`<div class="stack">
    <div class="card card--pad">
      <div class="row" style="gap:1.25rem">
        ${avatar(p, 'avatar--lg')}
        <div class="grow">
          <h2 style="margin:0">${p.fullName}</h2>
          <p class="muted small" style="margin:.2rem 0 .6rem">${p.email} · ${t('account.memberSince', { date: fmt.date(p.createdAt) })}</p>
          <div class="row">
            <label class="btn btn--sm">${icon('upload')} ${t('account.uploadAvatar')}<input type="file" accept="image/png,image/jpeg,image/webp" data-avatar hidden></label>
            ${p.avatarUrl ? html`<button class="btn btn--sm btn--ghost" data-action="remove-avatar">${t('account.removeAvatar')}</button>` : ''}
          </div>
        </div>
        ${p.isVerified ? html`<span class="badge badge--success">${icon('check')} ${t('account.verified')}</span>` : html`<a class="badge badge--warning" href="#/verify?email=${encodeURIComponent(p.email)}">${t('account.notVerified')}</a>`}
      </div>
    </div>
    <form class="card card--pad" data-profile novalidate>
      <h2 style="font-size:var(--text-lg)">${t('account.personal')}</h2>
      <div class="form-grid">
        ${field('firstName', t('auth.firstName'), p.firstName)}
        ${field('lastName', t('auth.lastName'), p.lastName)}
        <div class="span-2">${field('phone', t('account.phone'), p.phone, 'type="tel" placeholder="+995 5XX XX XX XX"')}</div>
        <div class="field span-2"><label class="field__label" for="p-bio">${t('account.bio')} <span class="muted">${t('common.optional')}</span></label><textarea class="textarea" id="p-bio" name="bio" maxlength="300">${p.bio ?? ''}</textarea><span class="field__error"></span></div>
      </div>
      <div class="row row--end" style="margin-top:1.25rem"><button class="btn btn--primary" type="submit">${t('common.save')}</button></div>
    </form>
  </div>`);

  const off = [
    on(box, 'submit', '[data-profile]', async (e) => {
      e.preventDefault();
      const form = e.target;
      const btn = $('button[type="submit"]', form);
      setBusy(btn, true);
      try {
        await put('/api/users/profile', formData(form));
        await reloadUser();
        clearFormErrors(form);
        toast(t('account.saved'), { type: 'success' });
      } catch (err) { if (!showFormErrors(form, err)) toastError(err); } finally { setBusy(btn, false); }
    }),
    on(box, 'change', '[data-avatar]', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        await upload('/api/users/avatar', file, { method: 'POST' });
        await reloadUser();
        toast(t('account.avatarUpdated'), { type: 'success' });
        resolve();
      } catch (err) { toastError(err); }
    }),
    on(box, 'click', '[data-action="remove-avatar"]', async () => {
      try { await del('/api/users/avatar'); await reloadUser(); resolve(); } catch (err) { toastError(err); }
    }),
  ];
  return () => off.forEach((f) => f());
}

// ── membership ───────────────────────────────────────────────────────────────
async function membership(box) {
  const [sub, plans] = await Promise.all([get('/api/subscription'), get('/api/plans')]);
  const user = session.user;
  const status = sub.status;
  const total = sub.isTrial ? (sub.plan?.trialDays ?? 7) : sub.plan?.interval === 'year' ? 365 : 30;
  const nextPlan = plans.find((p) => p.code !== sub.plan?.code);

  const actions = [];
  if (status === 'none' || status === 'expired') {
    if (sub.canStartTrial) actions.push(html`<a class="btn btn--primary" href="#/pricing">${icon('sparkles')} ${t('membership.startTrial')}</a>`);
    else actions.push(html`<a class="btn btn--primary" href="#/pricing">${icon('crown')} ${t('membership.subscribe')}</a>`);
  }
  if (status === 'trialing') {
    actions.push(html`<a class="btn btn--primary" href="#/checkout/${sub.plan.code}">${t('membership.subscribeNow')}</a>`);
    actions.push(html`<button class="btn" data-action="card">${icon('card')} ${sub.paymentMethod ? t('membership.changeCard') : t('membership.addCard')}</button>`);
    actions.push(html`<button class="btn btn--danger" data-action="cancel">${t('membership.cancelTrial')}</button>`);
  }
  if (status === 'active') {
    if (!sub.isComplimentary && nextPlan) actions.push(html`<a class="btn" href="#/pricing">${t('pricing.switchTo', { plan: nextPlan.name })}</a>`);
    if (!sub.isComplimentary) actions.push(html`<button class="btn" data-action="card">${icon('card')} ${t('membership.changeCard')}</button>`);
    actions.push(html`<button class="btn btn--danger" data-action="cancel">${t('membership.cancel')}</button>`);
  }
  if (status === 'canceled') actions.push(html`<button class="btn btn--primary" data-action="resume">${t('membership.resume')}</button>`);

  render(box, html`<div class="stack">
    <div class="member-card">
      <div>
        <span class="member-card__label">ანბანი · ${t('membership.cardTitle')}</span>
        <div class="member-card__name">${user.fullName}</div>
        <span class="small" style="opacity:.75">${user.email}</span>
        <dl>
          <div><dt>${t('membership.plan')}</dt><dd>${sub.plan?.name ?? t('pricing.freeName')}</dd></div>
          <div><dt>${t('membership.since')}</dt><dd>${fmt.short(sub.startedAt ?? user.createdAt)}</dd></div>
          ${sub.accessUntil ? html`<div><dt>${status === 'canceled' ? t('membership.accessUntil') : sub.isTrial ? t('membership.trialEnds') : t('membership.validUntil')}</dt><dd>${fmt.short(sub.accessUntil)}</dd></div>` : ''}
          ${sub.renewsAt ? html`<div><dt>${t('membership.renewsOn')}</dt><dd>${fmt.short(sub.renewsAt)}</dd></div>` : ''}
          ${sub.paymentMethod ? html`<div><dt>${t('membership.card')}</dt><dd>${sub.paymentMethod.brand.toUpperCase()} •••• ${sub.paymentMethod.last4}</dd></div>` : ''}
        </dl>
      </div>
      <div class="member-card__side">
        <span class="member-card__no">№ ${String(user.id).padStart(6, '0')}</span>
        <span class="stamp stamp--${status}">${t('status.' + status)}</span>
      </div>
    </div>

    ${sub.hasAccess ? html`<div class="card card--pad">
      <div class="days-meter">
        <div class="days-meter__labels"><span>${t('membership.daysLeft', { days: sub.daysLeft })}</span><span>${fmt.date(sub.accessUntil)}</span></div>
        <div class="progress progress--gold"><span style="width:${Math.min(100, Math.max(3, (sub.daysLeft / total) * 100))}%"></span></div>
      </div>
      <p class="small muted" style="margin:1rem 0 0">${t('membership.explain.' + (sub.isTrial ? (sub.paymentMethod && !sub.cancelAtPeriodEnd ? 'trialCard' : 'trial') : status === 'canceled' ? 'canceled' : sub.isComplimentary ? 'complimentary' : 'active'), { date: fmt.date(sub.accessUntil), plan: sub.plan?.name ?? '' })}</p>
    </div>` : html`<div class="alert alert--${status === 'expired' ? 'danger' : 'info'}">${icon(status === 'expired' ? 'alert' : 'info')}<div>${t('membership.explain.' + status, { date: fmt.date(sub.endedAt) })}</div></div>`}

    <div class="row">${actions}</div>

    <div class="card card--pad">
      <h2 style="font-size:var(--text-lg)">${t('membership.whatYouGet')}</h2>
      <ul class="plan__features" style="margin:0">
        <li>${icon(sub.hasAccess ? 'check' : 'x')}<span>${t('membership.perkRead')}</span></li>
        <li>${icon(sub.canDownload ? 'check' : 'x')}<span>${t('membership.perkDownload')}</span></li>
        <li>${icon('check')}<span>${t('membership.perkPreview')}</span></li>
      </ul>
    </div>
  </div>`);

  const off = [
    on(box, 'click', '[data-action="cancel"]', async (e, btn) => {
      const ok = await confirmDialog({ title: t('membership.cancelTitle'), text: t('membership.cancelText', { date: fmt.date(sub.accessUntil) }), confirmText: t('membership.cancelConfirm'), danger: true });
      if (!ok) return;
      setBusy(btn, true);
      try { await post('/api/subscription/cancel'); await reloadUser(); toast(t('membership.canceled'), { type: 'success' }); resolve(); }
      catch (err) { setBusy(btn, false); toastError(err); }
    }),
    on(box, 'click', '[data-action="resume"]', async (e, btn) => {
      setBusy(btn, true);
      try { await post('/api/subscription/resume'); await reloadUser(); toast(t('membership.resumed'), { type: 'success' }); resolve(); }
      catch (err) { setBusy(btn, false); toastError(err); }
    }),
    on(box, 'click', '[data-action="card"]', () => cardModal()),
  ];
  return () => off.forEach((f) => f());
}

function cardModal() {
  const { el, close } = modal({
    title: t('membership.cardModalTitle'),
    body: html`<form novalidate>
      <p class="small muted">${t('membership.cardModalText')}</p>
      <div class="field"><label class="field__label" for="m-number">${t('checkout.number')}</label><input class="input" id="m-number" name="card.number" inputmode="numeric" placeholder="4242 4242 4242 4242"><span class="field__error"></span></div>
      <div class="field"><label class="field__label" for="m-holder">${t('checkout.cardholder')}</label><input class="input" id="m-holder" name="card.holderName" value="${session.user.fullName}"><span class="field__error"></span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.75rem;margin-top:1rem">
        <div class="field"><label class="field__label" for="m-month">MM</label><input class="input" id="m-month" name="card.expMonth" inputmode="numeric" placeholder="12"><span class="field__error"></span></div>
        <div class="field" style="margin:0"><label class="field__label" for="m-year">YYYY</label><input class="input" id="m-year" name="card.expYear" inputmode="numeric" placeholder="2030"><span class="field__error"></span></div>
        <div class="field" style="margin:0"><label class="field__label" for="m-cvc">CVC</label><input class="input" id="m-cvc" name="card.cvc" inputmode="numeric" placeholder="123"><span class="field__error"></span></div>
      </div>
      <div class="modal__foot"><button class="btn" type="button" data-close>${t('common.cancel')}</button><button class="btn btn--primary" type="submit">${t('common.save')}</button></div>
    </form>`,
  });
  $('form', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const btn = $('button[type="submit"]', form);
    const v = (n) => form.elements[n].value.trim();
    setBusy(btn, true);
    try {
      await put('/api/subscription/payment-method', { card: { number: v('card.number').replace(/\s/g, ''), holderName: v('card.holderName'), expMonth: Number(v('card.expMonth')) || null, expYear: Number(v('card.expYear')) || null, cvc: v('card.cvc') } });
      close();
      toast(t('membership.cardSaved'), { type: 'success' });
      resolve();
    } catch (err) {
      setBusy(btn, false);
      if (!showFormErrors(form, err)) toastError(err);
    }
  });
}

// ── payments ─────────────────────────────────────────────────────────────────
async function payments(box) {
  let pageNo = 1;
  const draw = async () => {
    const res = await get('/api/payments', { query: { page: pageNo, pageSize: 10 } });
    if (!res.items.length) {
      return render(box, emptyState({ letter: '₾', title: t('payments.emptyTitle'), text: t('payments.emptyText'), action: html`<a class="btn btn--primary" href="#/pricing">${t('nav.pricing')}</a>` }));
    }
    render(box, html`
      <div class="table-wrap"><table class="table">
        <thead><tr><th>${t('payments.date')}</th><th>${t('payments.description')}</th><th>${t('payments.card')}</th><th>${t('payments.status')}</th><th class="num">${t('payments.amount')}</th></tr></thead>
        <tbody>${res.items.map((p) => html`<tr>
          <td class="nowrap">${fmt.short(p.createdAt)}<br><span class="xsmall muted mono">${p.invoiceNumber}</span></td>
          <td>${p.description}${p.periodStart ? html`<br><span class="xsmall muted">${fmt.short(p.periodStart)} – ${fmt.short(p.periodEnd)}</span>` : ''}</td>
          <td class="nowrap">${p.cardLast4 ? html`${(p.cardBrand ?? '').toUpperCase()} •••• ${p.cardLast4}` : '—'}</td>
          <td>${p.status === 'succeeded' ? html`<span class="badge badge--success">${t('payments.succeeded')}</span>` : html`<span class="badge badge--danger" title="${p.failureMessage ?? ''}">${t('payments.failed')}</span><br><span class="xsmall muted mono">${p.failureCode}</span>`}</td>
          <td class="num"><strong>${fmt.money(p.amount, p.currency)}</strong></td>
        </tr>`)}</tbody>
      </table></div>
      ${pagination(res)}`);
  };
  await draw();
  const off = on(box, 'click', '[data-page]', async (e, b) => { pageNo = Number(b.dataset.page); await draw(); });
  return off;
}

// ── security ─────────────────────────────────────────────────────────────────
async function security(box) {
  render(box, html`<div class="stack">
    <form class="card card--pad" data-password novalidate>
      <h2 style="font-size:var(--text-lg)">${t('account.changePassword')}</h2>
      <div class="field"><label class="field__label" for="s-current">${t('account.currentPassword')}</label><input class="input" id="s-current" type="password" name="currentPassword" autocomplete="current-password"><span class="field__error"></span></div>
      <div class="field"><label class="field__label" for="s-new">${t('auth.newPassword')}</label><input class="input" id="s-new" type="password" name="newPassword" autocomplete="new-password"><span class="field__hint">${t('auth.passwordRule')}</span><span class="field__error"></span></div>
      <div class="row row--end" style="margin-top:1.25rem"><button class="btn btn--primary" type="submit">${t('account.changePassword')}</button></div>
    </form>
    <div class="card card--pad">
      <h2 style="font-size:var(--text-lg);color:var(--cinnabar)">${t('account.dangerZone')}</h2>
      <p class="small muted">${t('account.deleteText')}</p>
      <button class="btn btn--danger" data-action="delete">${icon('trash')} ${t('account.deleteAccount')}</button>
    </div>
  </div>`);
  const off = [
    on(box, 'submit', '[data-password]', async (e) => {
      e.preventDefault();
      const form = e.target;
      const btn = $('button[type="submit"]', form);
      setBusy(btn, true);
      try {
        const res = await put('/api/users/change-password', formData(form));
        form.reset();
        clearFormErrors(form);
        toast(res.message, { type: 'success' });
      } catch (err) { if (!showFormErrors(form, err)) toastError(err); } finally { setBusy(btn, false); }
    }),
    on(box, 'click', '[data-action="delete"]', async () => {
      const ok = await confirmDialog({ title: t('account.deleteTitle'), text: t('account.deleteConfirmText'), confirmText: t('account.deleteAccount'), danger: true, typeToConfirm: 'DELETE' });
      if (!ok) return;
      try {
        await del('/api/users/me');
        clearSession();
        toast(t('account.deleted'), { type: 'success' });
        navigate('/');
      } catch (err) { toastError(err); }
    }),
  ];
  return () => off.forEach((f) => f());
}
