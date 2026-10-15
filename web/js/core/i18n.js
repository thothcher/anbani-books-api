// Translations and formatting. The API also follows the language: every request
// sends Accept-Language, so error messages and category names come back translated.
import ka from '../i18n/ka.js';
import en from '../i18n/en.js';

const DICTS = { ka, en };
const STORAGE_KEY = 'anbani.lang';
const listeners = new Set();

let lang = (() => {
  try { return localStorage.getItem(STORAGE_KEY) || window.ANBANI_CONFIG?.defaultLanguage || 'ka'; } catch { return 'ka'; }
})();
document.documentElement.lang = lang;

export const getLang = () => lang;

export function setLang(next) {
  if (next === lang || !DICTS[next]) return;
  lang = next;
  try { localStorage.setItem(STORAGE_KEY, next); } catch { /* private mode */ }
  document.documentElement.lang = next;
  listeners.forEach((fn) => fn(next));
}

export const onLangChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

const lookup = (dict, key) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), dict);

/** t('catalog.results', { count: 3 }) — falls back to English, then to the key itself. */
export function t(key, params) {
  let s = lookup(DICTS[lang], key) ?? lookup(DICTS.en, key) ?? key;
  if (typeof s === 'function') s = s(params ?? {});
  if (params && typeof s === 'string') s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] ?? m));
  return s;
}

// Many browsers ship without Georgian locale data (Intl silently falls back to English),
// so Georgian dates, relative times and numbers are formatted by hand.
const KA_MONTHS = ['იანვარი', 'თებერვალი', 'მარტი', 'აპრილი', 'მაისი', 'ივნისი', 'ივლისი', 'აგვისტო', 'სექტემბერი', 'ოქტომბერი', 'ნოემბერი', 'დეკემბერი'];
const KA_MONTHS_SHORT = ['იან', 'თებ', 'მარ', 'აპრ', 'მაი', 'ივნ', 'ივლ', 'აგვ', 'სექ', 'ოქტ', 'ნოე', 'დეკ'];
const KA_UNITS = { year: 'წლის', month: 'თვის', week: 'კვირის', day: 'დღის', hour: 'საათის', minute: 'წუთის' };
const KA_UNITS_FUTURE = { year: 'წელიწადში', month: 'თვეში', week: 'კვირაში', day: 'დღეში', hour: 'საათში', minute: 'წუთში' };
const pad = (n) => String(n).padStart(2, '0');

const locale = () => (lang === 'ka' ? 'ka-GE' : 'en-GB');

export const fmt = {
  date(value, opts = { day: 'numeric', month: 'long', year: 'numeric' }) {
    if (!value) return '—';
    const d = new Date(value);
    if (lang === 'ka') {
      const month = opts.month === 'short' ? `${KA_MONTHS_SHORT[d.getMonth()]}.` : KA_MONTHS[d.getMonth()];
      const time = opts.hour ? `, ${pad(d.getHours())}:${pad(d.getMinutes())}` : '';
      return `${d.getDate()} ${month}${opts.year ? ' ' + d.getFullYear() : ''}${time}`;
    }
    return new Intl.DateTimeFormat(locale(), opts).format(d);
  },
  short(value) {
    return fmt.date(value, { day: 'numeric', month: 'short', year: 'numeric' });
  },
  dateTime(value) {
    return fmt.date(value, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  },
  relative(value) {
    if (!value) return '';
    const diff = (new Date(value).getTime() - Date.now()) / 1000;
    const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
    const [unit, sec] = units.find(([, s]) => Math.abs(diff) >= s) ?? ['second', 1];
    const n = Math.round(diff / sec);
    if (lang === 'ka') {
      if (unit === 'second') return 'ახლახან';
      if (unit === 'day' && n === -1) return 'გუშინ';
      if (unit === 'day' && n === 1) return 'ხვალ';
      return n < 0 ? `${-n} ${KA_UNITS[unit]} წინ` : `${n} ${KA_UNITS_FUTURE[unit]}`;
    }
    return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(n, unit);
  },
  /** Money: the API sends decimals (12.99) and a currency code ("GEL"). */
  money(amount, currency = 'GEL') {
    const n = Number(amount ?? 0);
    const symbol = currency === 'GEL' ? '₾' : currency + ' ';
    return lang === 'ka' ? `${n.toFixed(2).replace('.', ',')} ${symbol.trim()}` : `${symbol}${n.toFixed(2)}`;
  },
  number(n) {
    const s = new Intl.NumberFormat('en-US').format(n ?? 0);
    return lang === 'ka' ? s.replace(/,/g, ' ').replace(/\./g, ',') : s;
  },
  compact(n) {
    const v = n ?? 0;
    if (lang !== 'ka') return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
    const one = (x) => x.toFixed(1).replace(/\.0$/, '').replace('.', ',');
    if (v >= 1e6) return `${one(v / 1e6)} მლნ`;
    if (v >= 1e3) return `${one(v / 1e3)} ათ.`;
    return String(v);
  },
  minutes(total) {
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (!h) return t('format.minutes', { m });
    return m ? t('format.hoursMinutes', { h, m }) : t('format.hours', { h });
  },
  year(book) {
    return book.yearLabel || (book.year < 0 ? `${-book.year} BC` : String(book.year ?? ''));
  },
};
