// Login, registration, e-mail verification and password reset.
import { html, render, on, $, $$, formData } from '../core/dom.js';
import { t, getLang } from '../core/i18n.js';
import { post } from '../core/api.js';
import { session, login, register, verifyEmail } from '../core/session.js';
import { navigate } from '../core/router.js';
import { icon, toast, toastError, setBusy, showFormErrors, cta, capsHtml } from '../core/ui.js';
import { fillWall } from '../components/coverWall.js';

const DEMO = [
  { email: 'admin@anbani.ge', key: 'demoAdmin' },
  { email: 'reader@anbani.ge', key: 'demoReader' },
  { email: 'new@anbani.ge', key: 'demoNew' },
];
const DEMO_PASSWORD = 'Anbani2026!';

const QUOTES = {
  login: { ka: ['„რასაცა გასცემ, შენია, რაც არა — დაკარგულია.“', 'შოთა რუსთაველი'], en: ['“A book must be the axe for the frozen sea within us.”', 'Franz Kafka'] },
  register: { ka: ['„რას მიქვიან ტკბილი სიტყვა?“', 'ილია ჭავჭავაძე, „ოთარაანთ ქვრივი“'], en: ['“And what is the use of a book,” thought Alice, “without pictures or conversations?”', 'Lewis Carroll'] },
};

function side(kind) {
  const [quote, by] = QUOTES[kind][getLang()] ?? QUOTES[kind].en;
  return html`<aside class="auth__side on-dark" aria-hidden="true">
    <div class="hero__wall" data-auth-wall></div>
    <div class="hero__shade"></div>
    <img class="auth__seal" src="assets/seal.svg" alt="" width="84" height="84">
    <p class="auth__quote">${quote}</p>
    <p class="auth__quote-by">— ${capsHtml(by)}</p>
  </aside>`;
}

const field = (name, label, attrs = '', extra = '') => html`<div class="field">
  <label class="field__label" for="f-${name}">${label}${extra}</label>
  ${attrs}
  <span class="field__error"></span>
</div>`;

const passwordInput = (name, autocomplete) => html`<div class="input-group">
  <input class="input" id="f-${name}" name="${name}" type="password" autocomplete="${autocomplete}" required>
  <button class="btn btn--ghost btn--icon btn--sm input-group__btn" type="button" data-action="toggle-password" aria-label="${t('auth.showPassword')}">${icon('eye')}</button>
</div>`;

export default {
  title: (ctx) => t(`auth.titles.${ctx.path.slice(1)}`),
  render(view, ctx) {
    const kind = ctx.path.slice(1); // login | register | verify | forgot | reset
    const next = ctx.query.get('next');
    const email = ctx.query.get('email') ?? session.user?.email ?? '';
    const pages = { login: loginPage, register: registerPage, verify: () => verifyPage(email), forgot: forgotPage, reset: () => resetPage(email) };
    render(view, html`<div class="auth">
      <div class="auth__form"><div class="auth__box">${pages[kind]()}</div></div>
      ${side(kind === 'register' ? 'register' : 'login')}
    </div>`);
    fillWall($('[data-auth-wall]', view), 5);
    let timer = null;

    const off = [
      on(view, 'click', '[data-action="toggle-password"]', (e, b) => {
        const input = b.parentElement.querySelector('input');
        input.type = input.type === 'password' ? 'text' : 'password';
        render(b, icon(input.type === 'password' ? 'eye' : 'eyeOff'));
      }),
      on(view, 'input', '[name="password"]', (e) => {
        const meter = $('.password-meter', view);
        if (meter) meter.dataset.score = String(score(e.target.value));
      }),
      on(view, 'click', '[data-demo]', async (e, b) => {
        const form = $('form', view);
        form.elements.email.value = b.dataset.demo;
        form.elements.password.value = DEMO_PASSWORD;
        form.requestSubmit();
      }),
      on(view, 'click', '[data-action="open-inbox"]', () => window.dispatchEvent(new CustomEvent('devpanel:open', { detail: 'inbox' }))),
      on(view, 'submit', 'form', async (e) => {
        e.preventDefault();
        const form = e.target;
        const btn = $('button[type="submit"]', form);
        const data = formData(form);
        setBusy(btn, true);
        try {
          if (kind === 'login') {
            const user = await login(data.email, data.password);
            toast(t('auth.welcomeBack', { name: user.firstName }), { type: 'success' });
            navigate(user.isVerified ? (next || '/') : `/verify?email=${encodeURIComponent(user.email)}`);
          } else if (kind === 'register') {
            if (!form.elements.terms.checked) {
              setBusy(btn, false);
              return showFormErrors(form, { errors: { terms: [t('auth.acceptTerms')] } });
            }
            const user = await register({ firstName: data.firstName, lastName: data.lastName, email: data.email, password: data.password });
            toast(t('auth.registered'), { type: 'success' });
            navigate(`/verify?email=${encodeURIComponent(user.email)}`);
          } else if (kind === 'verify') {
            const code = $$('.otp input', form).map((i) => i.value).join('');
            const user = await verifyEmail(form.elements.email.value, code);
            toast(t('auth.verified', { name: user.firstName }), { type: 'success' });
            navigate('/pricing');
          } else if (kind === 'forgot') {
            const res = await post('/api/auth/forgot-password', { email: data.email }, { auth: false });
            toast(res.message, { type: 'success' });
            navigate(`/reset?email=${encodeURIComponent(data.email)}`);
          } else if (kind === 'reset') {
            const res = await post('/api/auth/reset-password', { email: data.email, code: data.code, newPassword: data.newPassword }, { auth: false });
            toast(res.message, { type: 'success' });
            navigate('/login');
          }
        } catch (err) {
          setBusy(btn, false);
          if (kind === 'verify' && err.code) {
            render($('[data-otp-error]', view), html`${err.detail}${err.body?.attemptsLeft != null ? ` (${t('auth.attemptsLeft', { n: err.body.attemptsLeft })})` : ''}`);
            $$('.otp input', view).forEach((i) => { i.value = ''; });
            $('.otp input', view)?.focus();
            return;
          }
          if (!showFormErrors(form, err)) toastError(err);
        }
      }),
    ];

    if (kind === 'verify') {
      const inputs = $$('.otp input', view);
      inputs[0]?.focus();
      off.push(on(view, 'input', '.otp input', (e) => {
        const i = inputs.indexOf(e.target);
        e.target.value = e.target.value.replace(/\D/g, '').slice(-1);
        if (e.target.value && i < inputs.length - 1) inputs[i + 1].focus();
        if (inputs.every((x) => x.value)) $('form', view).requestSubmit();
      }));
      off.push(on(view, 'keydown', '.otp input', (e) => {
        const i = inputs.indexOf(e.target);
        if (e.key === 'Backspace' && !e.target.value && i > 0) inputs[i - 1].focus();
      }));
      off.push(on(view, 'paste', '.otp', (e) => {
        const text = (e.clipboardData.getData('text') ?? '').replace(/\D/g, '').slice(0, 6);
        if (!text) return;
        e.preventDefault();
        [...text].forEach((c, i) => { if (inputs[i]) inputs[i].value = c; });
        if (text.length === 6) $('form', view).requestSubmit();
      }));
      const resend = $('[data-action="resend"]', view);
      const startCooldown = (seconds) => {
        let left = seconds;
        resend.disabled = true;
        clearInterval(timer);
        timer = setInterval(() => {
          left -= 1;
          resend.textContent = left > 0 ? t('auth.resendIn', { s: left }) : t('auth.resend');
          if (left <= 0) { clearInterval(timer); resend.disabled = false; }
        }, 1000);
      };
      startCooldown(30);
      off.push(on(view, 'click', '[data-action="resend"]', async () => {
        try {
          const res = await post('/api/auth/resend-verification', { email: $('form', view).elements.email.value }, { auth: false });
          toast(res.message, { type: 'success' });
          startCooldown(60);
        } catch (err) { toastError(err); }
      }));
    }
    return () => { off.forEach((f) => f()); clearInterval(timer); };
  },
};

function score(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[a-zა-ჰ]/i.test(pw) && /\d/.test(pw)) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (pw.length >= 12 || /[^\w]/.test(pw)) s++;
  return pw ? Math.max(1, s) : 0;
}

function loginPage() {
  const demo = (window.ANBANI_CONFIG?.apiKey ?? '') === 'anbani-demo-key';
  return html`
    <h1>${t('auth.loginTitle')}</h1>
    <p>${t('auth.loginLead')}</p>
    <form novalidate>
      ${field('email', t('auth.email'), html`<input class="input" id="f-email" name="email" type="email" autocomplete="email" required>`)}
      ${field('password', t('auth.password'), passwordInput('password', 'current-password'), html`<a class="small" href="#/forgot">${t('auth.forgot')}</a>`)}
      ${cta(t('auth.loginButton'), { type: 'submit', block: true, variant: 'ink' })}
    </form>
    <p class="auth__alt">${t('auth.noAccount')} <a href="#/register">${t('auth.createOne')}</a></p>
    ${demo ? html`<div class="demo-accounts panel">
      <strong class="small">${icon('key')} ${t('auth.demoTitle')}</strong>
      <div class="demo-accounts__list">${DEMO.map((d) => html`<button type="button" data-demo="${d.email}"><span>${d.email}</span><small>${t('auth.' + d.key)}</small></button>`)}</div>
      <p class="xsmall muted" style="margin:.6rem 0 0">${t('auth.demoPassword')} <code>${DEMO_PASSWORD}</code></p>
    </div>` : ''}`;
}

function registerPage() {
  return html`
    <h1>${t('auth.registerTitle')}</h1>
    <p>${t('auth.registerLead')}</p>
    <form novalidate>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
        ${field('firstName', t('auth.firstName'), html`<input class="input" id="f-firstName" name="firstName" autocomplete="given-name" required>`)}
        <div style="margin-top:0">${field('lastName', t('auth.lastName'), html`<input class="input" id="f-lastName" name="lastName" autocomplete="family-name" required>`)}</div>
      </div>
      ${field('email', t('auth.email'), html`<input class="input" id="f-email" name="email" type="email" autocomplete="email" required>`)}
      ${field('password', t('auth.password'), html`${passwordInput('password', 'new-password')}<div class="password-meter" data-score="0"><span></span><span></span><span></span><span></span></div><span class="field__hint">${t('auth.passwordRule')}</span>`)}
      <div class="field">
        <label class="checkbox"><input type="checkbox" name="terms"> <span>${t('auth.terms')}</span></label>
        <span class="field__error"></span>
      </div>
      ${cta(t('auth.registerButton'), { type: 'submit', block: true, variant: 'ink' })}
    </form>
    <p class="auth__alt">${t('auth.haveAccount')} <a href="#/login">${t('nav.login')}</a></p>`;
}

function verifyPage(email) {
  return html`
    <h1>${t('auth.verifyTitle')}</h1>
    <p>${t('auth.verifyLead')} <strong>${email}</strong></p>
    <form novalidate>
      <input type="hidden" name="email" value="${email}">
      <div class="otp" aria-label="${t('auth.code')}">${[0, 1, 2, 3, 4, 5].map((i) => html`<input inputmode="numeric" maxlength="1" aria-label="${t('auth.digit', { n: i + 1 })}" autocomplete="${i === 0 ? 'one-time-code' : 'off'}">`)}</div>
      <p class="field__error center" data-otp-error style="margin-top:.75rem;min-height:1.2em"></p>
      ${cta(t('auth.verifyButton'), { type: 'submit', block: true, variant: 'ink' })}
    </form>
    <div class="row" style="justify-content:center;margin-top:1rem"><button class="btn btn--ghost btn--sm" data-action="resend">${t('auth.resend')}</button></div>
    <div class="alert alert--info" style="margin-top:1.5rem">${icon('inbox')}<div><span class="alert__title">${t('auth.sandboxInboxTitle')}</span>${t('auth.sandboxInboxText')}
      <button class="link-btn" data-action="open-inbox">${t('auth.openInbox')}</button></div></div>`;
}

function forgotPage() {
  return html`
    <h1>${t('auth.forgotTitle')}</h1>
    <p>${t('auth.forgotLead')}</p>
    <form novalidate>
      ${field('email', t('auth.email'), html`<input class="input" id="f-email" name="email" type="email" autocomplete="email" required>`)}
      ${cta(t('auth.sendCode'), { type: 'submit', block: true, variant: 'ink' })}
    </form>
    <p class="auth__alt"><a href="#/login">${t('auth.backToLogin')}</a></p>`;
}

function resetPage(email) {
  return html`
    <h1>${t('auth.resetTitle')}</h1>
    <p>${t('auth.resetLead')}</p>
    <form novalidate>
      ${field('email', t('auth.email'), html`<input class="input" id="f-email" name="email" type="email" value="${email}" autocomplete="email" required>`)}
      ${field('code', t('auth.code'), html`<input class="input" id="f-code" name="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" required>`)}
      ${field('newPassword', t('auth.newPassword'), html`${passwordInput('newPassword', 'new-password')}<span class="field__hint">${t('auth.passwordRule')}</span>`)}
      ${cta(t('auth.resetButton'), { type: 'submit', block: true, variant: 'ink' })}
    </form>
    <div class="alert alert--info" style="margin-top:1.5rem">${icon('inbox')}<div>${t('auth.sandboxInboxText')} <button class="link-btn" data-action="open-inbox">${t('auth.openInbox')}</button></div></div>`;
}
