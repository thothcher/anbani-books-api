import { html, render, on } from '../core/dom.js';
import { t, fmt } from '../core/i18n.js';
import { get, post, put } from '../core/api.js';
import { session, reloadUser } from '../core/session.js';
import { navigate, resolve } from '../core/router.js';
import { icon, loadingBlock, errorState, toast, toastError, confirmDialog, setBusy, cta, pageHero } from '../core/ui.js';

/** Plan card. `sub` = GET /api/subscription result (or null for the home-page teaser). */
export function planCard(plan, sub) {
  const isCurrent = sub && sub.plan?.code === plan.code && ['active', 'canceled', 'trialing'].includes(sub.status);
  const priceLabel = plan.interval === 'year' ? t('pricing.perYear') : t('pricing.perMonth');
  return html`<article class="plan ${plan.isPopular ? 'plan--popular' : ''} ${isCurrent ? 'plan--current' : ''}" data-ribbon="${t('pricing.popular')}">
    <h3 class="plan__name">${plan.name}</h3>
    <p class="plan__desc">${plan.description}</p>
    <div class="plan__price"><strong>${fmt.money(plan.price, plan.currency)}</strong><span>${priceLabel}</span></div>
    <div class="plan__sub">${plan.interval === 'year' ? t('pricing.monthlyEquivalent', { price: fmt.money(plan.monthlyPrice, plan.currency) }) : ''}</div>
    <ul class="plan__features">${plan.features.map((f) => html`<li>${icon('check')}<span>${f}</span></li>`)}
      ${plan.allowDownload ? '' : html`<li class="is-off">${icon('x')}<span>${t('pricing.noDownloads')}</span></li>`}
    </ul>
    ${planAction(plan, sub)}
  </article>`;
}

function planAction(plan, sub) {
  if (!sub) {
    return session.isAuthed
      ? cta(t('pricing.choose'), { href: '#/pricing', block: true })
      : cta(t('pricing.startTrial', { days: plan.trialDays }), { href: `#/register?plan=${plan.code}`, block: true });
  }
  const same = sub.plan?.code === plan.code;
  if (!session.user.isVerified) return cta(t('pricing.verifyFirst'), { href: `#/verify?email=${encodeURIComponent(session.user.email)}`, block: true });
  if (sub.canStartTrial) {
    return html`${cta(t('pricing.startTrial', { days: plan.trialDays }), { action: 'trial', data: { plan: plan.id }, block: true })}
      <a class="plan__note" href="#/checkout/${plan.code}">${t('pricing.orSubscribe')}</a>`;
  }
  if (sub.status === 'trialing') {
    return html`${cta(t('pricing.subscribeKeepTrial'), { href: `#/checkout/${plan.code}`, block: true })}
      ${same ? html`<p class="plan__note muted">${t('pricing.trialOnThis', { date: fmt.date(sub.accessUntil) })}</p>` : ''}`;
  }
  if (sub.status === 'active' || sub.status === 'canceled') {
    if (same) {
      return sub.status === 'canceled'
        ? cta(t('membership.resume'), { action: 'resume', block: true })
        : html`<button class="btn" disabled>${icon('check')} ${t('pricing.current')}</button>`;
    }
    return sub.status === 'active' && !sub.isTrial
      ? cta(t('pricing.switchTo', { plan: plan.name }), { action: 'switch', data: { plan: plan.id, name: plan.name, price: fmt.money(plan.price, plan.currency) }, block: true })
      : html`<button class="btn" disabled>${t('pricing.switchAfter')}</button>`;
  }
  return cta(t('pricing.subscribe'), { href: `#/checkout/${plan.code}`, block: true });
}

function freeCard(sub) {
  const current = sub && ['none', 'expired'].includes(sub.status);
  return html`<article class="plan ${current ? 'plan--current' : ''}">
    <h3 class="plan__name">${t('pricing.freeName')}</h3>
    <p class="plan__desc">${t('pricing.freeDesc')}</p>
    <div class="plan__price"><strong>${fmt.money(0)}</strong><span>${t('pricing.forever')}</span></div>
    <div class="plan__sub"></div>
    <ul class="plan__features">
      ${['free1', 'free2', 'free3', 'free4'].map((k) => html`<li>${icon('check')}<span>${t('pricing.' + k)}</span></li>`)}
      <li class="is-off">${icon('x')}<span>${t('pricing.freeNo')}</span></li>
    </ul>
    ${session.isAuthed
      ? html`<button class="btn" disabled>${current ? html`${icon('check')} ${t('pricing.current')}` : t('pricing.included')}</button>`
      : cta(t('pricing.createAccount'), { href: '#/register', block: true })}
  </article>`;
}

export default {
  title: () => t('pricing.title'),
  async render(view) {
    render(view, loadingBlock());
    const load = async () => {
      const [plans, sub] = await Promise.all([get('/api/plans'), session.isAuthed ? get('/api/subscription') : Promise.resolve(null)]);
      render(view, html`
        <div class="page container">
          ${pageHero({ kicker: t('pricing.eyebrow'), title: t('pricing.heading'), lead: t('pricing.lead', { days: plans[0]?.trialDays ?? 7 }) })}
          ${sub && sub.status !== 'none' ? html`<div class="alert alert--info" style="max-width:760px;margin:0 auto 2rem">${icon('info')}<div>${t('pricing.yourStatus', { status: t('status.' + sub.status) })}
            ${sub.accessUntil ? t('pricing.until', { date: fmt.date(sub.accessUntil) }) : ''} <a href="#/account/membership">${t('pricing.manage')}</a></div></div>` : ''}
          <div class="plans">${freeCard(sub)}${plans.map((p) => planCard(p, sub))}</div>
          <div class="alert alert--warning" style="max-width:760px;margin:2.5rem auto 0">${icon('card')}<div><span class="alert__title">${t('pricing.sandboxTitle')}</span>${t('pricing.sandboxText')} <code>4242 4242 4242 4242</code></div></div>
          <section class="section container--narrow" style="padding:0">
            <h2 class="serif serif--xl">${t('home.faqTitle')}</h2>
            <div class="accordion">${[1, 2, 3, 4, 5, 6].map((n) => html`<details><summary>${t(`faq.q${n}`)} ${icon('plus')}</summary><p>${t(`faq.a${n}`, { days: plans[0]?.trialDays ?? 7 })}</p></details>`)}</div>
          </section>
        </div>`);
    };
    try { await load(); } catch (err) { render(view, html`<div class="container">${errorState(err)}</div>`); }

    const off = [
      on(view, 'click', '[data-action="retry"]', load),
      on(view, 'click', '[data-action="trial"]', async (e, btn) => {
        setBusy(btn, true);
        try {
          await post('/api/subscription/trial', { planId: Number(btn.dataset.plan) });
          await reloadUser();
          toast(t('pricing.trialStarted'), { type: 'success' });
          navigate('/books');
        } catch (err) { setBusy(btn, false); toastError(err); }
      }),
      on(view, 'click', '[data-action="switch"]', async (e, btn) => {
        const ok = await confirmDialog({ title: t('pricing.switchTitle', { plan: btn.dataset.name }), text: t('pricing.switchText', { price: btn.dataset.price }), confirmText: t('pricing.switchConfirm') });
        if (!ok) return;
        setBusy(btn, true);
        try {
          await put('/api/subscription/plan', { planId: Number(btn.dataset.plan) });
          await reloadUser();
          toast(t('pricing.switched'), { type: 'success' });
          resolve();
        } catch (err) { setBusy(btn, false); toastError(err); }
      }),
      on(view, 'click', '[data-action="resume"]', async (e, btn) => {
        setBusy(btn, true);
        try { await post('/api/subscription/resume'); await reloadUser(); toast(t('membership.resumed'), { type: 'success' }); resolve(); }
        catch (err) { setBusy(btn, false); toastError(err); }
      }),
    ];
    return () => off.forEach((f) => f());
  },
};
