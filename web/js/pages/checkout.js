// Checkout with a test card. Shows the full validation story:
//   1) the browser checks the format (Luhn, expiry, CVC length) before sending,
//   2) the API validates again (400 + field errors under "card.number" etc.),
//   3) the "bank" may decline (402 CARD_DECLINED, INSUFFICIENT_FUNDS, …).
import { html, render, on, $ } from '../core/dom.js';
import { t, fmt } from '../core/i18n.js';
import { get, post } from '../core/api.js';
import { session, reloadUser } from '../core/session.js';
import { navigate } from '../core/router.js';
import { icon, loadingBlock, errorState, toastError, setBusy, showFormErrors, clearFormErrors, emptyState, cta } from '../core/ui.js';

let plan;
let sub;
let cards = [];

const brandOf = (n) => (/^4/.test(n) ? 'visa' : /^(5[1-5]|2[2-7])/.test(n) ? 'mastercard' : /^3[47]/.test(n) ? 'amex' : '');
const digits = (s) => s.replace(/\D/g, '');
function luhn(n) {
  let sum = 0;
  let alt = false;
  for (let i = n.length - 1; i >= 0; i--) {
    let d = Number(n[i]);
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    alt = !alt;
  }
  return n.length >= 13 && sum % 10 === 0;
}

export default {
  title: () => t('checkout.title'),
  async render(view, ctx) {
    render(view, loadingBlock());
    try {
      const [plans, subscription, testCards] = await Promise.all([get('/api/plans'), get('/api/subscription'), get('/api/sandbox/test-cards').catch(() => [])]);
      plan = plans.find((p) => p.code === ctx.params.plan);
      sub = subscription;
      cards = testCards;
    } catch (err) {
      return render(view, html`<div class="container">${errorState(err)}</div>`);
    }
    if (!plan) return render(view, html`<div class="container">${emptyState({ title: t('checkout.noPlan'), action: html`<a class="btn" href="#/pricing">${t('nav.pricing')}</a>` })}</div>`);
    if (['active', 'canceled'].includes(sub.status)) {
      return render(view, html`<div class="container">${emptyState({ letter: '✓', title: t('checkout.alreadyTitle'), text: t('checkout.alreadyText'), action: html`<a class="btn btn--primary" href="#/account/membership">${t('pricing.manage')}</a>` })}</div>`);
    }
    if (!session.user.isVerified) {
      return render(view, html`<div class="container">${emptyState({ letter: '@', title: t('pricing.verifyFirst'), text: t('checkout.verifyText'), action: html`<a class="btn btn--primary" href="#/verify?email=${encodeURIComponent(session.user.email)}">${t('banner.verifyCta')}</a>` })}</div>`);
    }

    render(view, page());
    const form = $('form', view);
    const card = $('.cc', view);
    const update = () => {
      const number = digits(form.elements['card.number'].value);
      const brand = brandOf(number);
      card.dataset.brand = brand;
      $('[data-cc-brand]', view).textContent = brand || 'card';
      $('[data-cc-number]', view).textContent = (number.padEnd(16, '•').match(/.{1,4}/g) ?? []).join(' ');
      $('[data-cc-name]', view).textContent = form.elements['card.holderName'].value || t('checkout.cardholder');
      $('[data-cc-exp]', view).textContent = form.elements.exp.value || 'MM/YY';
      $('[data-cc-cvc]', view).textContent = form.elements['card.cvc'].value.replace(/./g, '•') || '•••';
    };

    const off = [
      on(view, 'input', '[name="card.number"]', (e) => {
        const d = digits(e.target.value).slice(0, 19);
        e.target.value = d.replace(/(.{4})/g, '$1 ').trim();
        update();
      }),
      on(view, 'input', '[name="exp"]', (e) => {
        const d = digits(e.target.value).slice(0, 4);
        e.target.value = d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
        update();
      }),
      on(view, 'input', '[name="card.cvc"], [name="card.holderName"]', update),
      on(view, 'focusin', '[name="card.cvc"]', () => card.classList.add('is-flipped')),
      on(view, 'focusout', '[name="card.cvc"]', () => card.classList.remove('is-flipped')),
      on(view, 'click', '[data-fill]', (e, b) => {
        form.elements['card.number'].value = b.dataset.fill.replace(/(.{4})/g, '$1 ').trim();
        form.elements['card.holderName'].value ||= session.user.fullName;
        form.elements.exp.value ||= `12/${String((new Date().getFullYear() + 3) % 100).padStart(2, '0')}`;
        form.elements['card.cvc'].value ||= '123';
        update();
        clearFormErrors(form);
      }),
      on(view, 'submit', 'form', async (e) => {
        e.preventDefault();
        const button = $('button[type="submit"]', form);
        const number = digits(form.elements['card.number'].value);
        const [mm, yy] = form.elements.exp.value.split('/');
        const body = {
          planId: plan.id,
          card: {
            number,
            holderName: form.elements['card.holderName'].value.trim(),
            expMonth: Number(mm) || null,
            expYear: yy ? 2000 + Number(yy) : null,
            cvc: form.elements['card.cvc'].value.trim(),
          },
        };
        // 1) client-side checks — instant feedback, but the server checks again
        const local = {};
        if (!luhn(number)) local['card.number'] = [t('checkout.errors.number')];
        if (!body.card.holderName) local['card.holderName'] = [t('checkout.errors.holder')];
        if (!body.card.expMonth || body.card.expMonth > 12 || !yy) local.exp = [t('checkout.errors.exp')];
        if (!/^\d{3,4}$/.test(body.card.cvc)) local['card.cvc'] = [t('checkout.errors.cvc')];
        if (Object.keys(local).length) return showFormErrors(form, { errors: local });

        clearFormErrors(form);
        $('[data-pay-error]', view).innerHTML = '';
        setBusy(button, true);
        try {
          const res = await post('/api/subscription/checkout', body);
          await reloadUser();
          render(view, success(res));
        } catch (err) {
          setBusy(button, false);
          // 2) server validation: errors keyed "card.expYear" etc. ("exp" covers both month and year)
          if (err.errors) {
            const mapped = { ...err.errors };
            for (const k of ['card.expMonth', 'card.expYear']) if (mapped[k]) { mapped.exp = [...(mapped.exp ?? []), ...mapped[k]]; delete mapped[k]; }
            if (showFormErrors(form, { errors: mapped })) return;
          }
          // 3) declined by the "bank"
          render($('[data-pay-error]', view), html`<div class="alert alert--danger">${icon('xCircle')}<div><span class="alert__title">${t('checkout.declined')}</span>${err.detail} <code>${err.code}</code></div></div>`);
        }
      }),
    ];
    update();
    return () => off.forEach((f) => f());
  },
};

function page() {
  const trialing = sub.status === 'trialing' && sub.accessUntil;
  const firstPeriodEnd = (() => {
    const d = new Date(trialing ? sub.accessUntil : Date.now());
    plan.interval === 'year' ? d.setFullYear(d.getFullYear() + 1) : d.setMonth(d.getMonth() + 1);
    return d;
  })();
  const field = (name, label, attrs = {}) => html`<div class="field">
      <label class="field__label" for="${name}">${label}</label>
      <input class="input" id="${name}" name="${name}" ${Object.entries(attrs).map(([k, v]) => html`${k}="${v}" `)}>
      <span class="field__error"></span>
    </div>`;
  return html`<div class="page container">
    <nav class="breadcrumbs"><a href="#/pricing">${t('nav.pricing')}</a>${icon('chevronRight')}<span>${t('checkout.title')}</span></nav>
    <div class="checkout">
      <div class="card card--pad">
        <h1 style="font-size:var(--text-2xl)">${t('checkout.heading')}</h1>
        <p class="muted">${t('checkout.lead')}</p>
        <div class="cc" data-brand="">
          <div class="cc__inner">
            <div class="cc__face">
              <div class="cc__top"><span class="cc__chip"></span><span class="cc__brand" data-cc-brand>card</span></div>
              <div class="cc__number" data-cc-number>•••• •••• •••• ••••</div>
              <div class="cc__bottom">
                <div><small>${t('checkout.cardholder')}</small><strong data-cc-name></strong></div>
                <div><small>${t('checkout.expires')}</small><strong data-cc-exp>MM/YY</strong></div>
              </div>
            </div>
            <div class="cc__face cc__back"><div class="cc__stripe"></div><div class="cc__cvc" data-cc-cvc>•••</div></div>
          </div>
        </div>
        <form novalidate>
          ${field('card.number', t('checkout.number'), { inputmode: 'numeric', autocomplete: 'cc-number', placeholder: '4242 4242 4242 4242' })}
          ${field('card.holderName', t('checkout.cardholder'), { autocomplete: 'cc-name', placeholder: session.user.fullName })}
          <div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-top:1rem">
            ${field('exp', t('checkout.expires'), { inputmode: 'numeric', autocomplete: 'cc-exp', placeholder: 'MM/YY' })}
            ${field('card.cvc', 'CVC', { inputmode: 'numeric', autocomplete: 'cc-csc', placeholder: '123', maxlength: '4' })}
          </div>
          <div data-pay-error style="margin-top:1rem"></div>
          <div style="margin-top:1.4rem">${cta(t('checkout.pay', { amount: fmt.money(plan.price, plan.currency) }), { type: 'submit', block: true, variant: 'ink', icon: 'lock' })}</div>
          <p class="xsmall muted center" style="margin-top:.75rem">${t('checkout.secureNote')}</p>
        </form>
      </div>
      <aside class="stack">
        <div class="card card--pad">
          <h2 style="font-size:var(--text-lg)">${t('checkout.summary')}</h2>
          <div class="summary-line"><span>${plan.name} · ${plan.interval === 'year' ? t('pricing.yearly') : t('pricing.monthly')}</span><strong>${fmt.money(plan.price, plan.currency)}</strong></div>
          ${trialing ? html`<div class="summary-line"><span>${t('checkout.trialKept')}</span><span class="badge badge--success">${t('checkout.untilDate', { date: fmt.short(sub.accessUntil) })}</span></div>` : ''}
          <div class="summary-line"><span>${t('checkout.firstPeriod')}</span><span>${fmt.short(firstPeriodEnd)}</span></div>
          <div class="summary-line summary-line--total"><span>${t('checkout.totalToday')}</span><span>${fmt.money(plan.price, plan.currency)}</span></div>
          <p class="xsmall muted" style="margin:.75rem 0 0">${t('checkout.renews', { interval: plan.interval === 'year' ? t('pricing.yearly') : t('pricing.monthly') })}</p>
        </div>
        <div class="card card--pad">
          <h2 style="font-size:var(--text-lg)">${icon('card')} ${t('checkout.testCards')}</h2>
          <p class="small muted">${t('checkout.testCardsText')}</p>
          <div class="test-cards">${cards.map((c) => html`<button type="button" data-fill="${c.number.replace(/ /g, '')}"><code>${c.number}</code><span class="muted">${c.description}</span></button>`)}</div>
        </div>
      </aside>
    </div>
  </div>`;
}

function success(res) {
  const p = res.payment;
  return html`<div class="page container container--narrow">
    <div class="card card--pad success-card">
      <div class="success-card__icon">${icon('check')}</div>
      <h1>${t('checkout.successTitle')}</h1>
      <p class="muted">${t('checkout.successText', { date: fmt.date(res.subscription.currentPeriodEnd) })}</p>
      <dl class="kv" style="max-width:360px;margin:1.5rem auto;text-align:left">
        <dt>${t('payments.invoice')}</dt><dd class="mono">${p.invoiceNumber}</dd>
        <dt>${t('payments.amount')}</dt><dd>${fmt.money(p.amount, p.currency)}</dd>
        <dt>${t('payments.card')}</dt><dd>${(p.cardBrand ?? '').toUpperCase()} •••• ${p.cardLast4}</dd>
        <dt>${t('payments.period')}</dt><dd>${fmt.short(p.periodStart)} – ${fmt.short(p.periodEnd)}</dd>
      </dl>
      <div class="row" style="justify-content:center">
        <a class="btn btn--primary" href="#/books">${icon('bookOpen')} ${t('checkout.startReading')}</a>
        <a class="btn" href="#/account/payments">${t('nav.payments')}</a>
      </div>
    </div>
  </div>`;
}
