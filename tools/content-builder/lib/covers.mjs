// Generative book covers (SVG, 400×600).
//
// Every cover = palette + a motif chosen by genre + typography. The title and
// author are converted to vector outlines with fontkit, so the covers look the
// same on every device without loading any web font (an <img src="…svg"> can't).
import { openSync } from 'fontkit';
import { join } from 'node:path';
import { FONTS } from './paths.mjs';

const W = 400;
const H = 600;

export const PALETTES = [
  { bg: '#1f3a5f', ink: '#f4ede1', accent: '#e8b04a', soft: '#2b4c7a' }, // lapis
  { bg: '#b4352a', ink: '#fbf3e6', accent: '#2a1d16', soft: '#c4493d' }, // cinnabar
  { bg: '#efe5d1', ink: '#211d18', accent: '#b4352a', soft: '#e2d5bc' }, // paper
  { bg: '#2f4a3a', ink: '#f1e9da', accent: '#d9a441', soft: '#3c5c49' }, // forest
  { bg: '#211d18', ink: '#efe5d3', accent: '#d0603f', soft: '#332c25' }, // ink
  { bg: '#e6b85c', ink: '#211d18', accent: '#8f2a20', soft: '#d9a845' }, // saffron
  { bg: '#5e2a40', ink: '#f6ead9', accent: '#e7a977', soft: '#71354f' }, // plum
  { bg: '#d9e3dc', ink: '#21323a', accent: '#b8474d', soft: '#c6d4ca' }, // sage
  { bg: '#3a3d58', ink: '#f4f1de', accent: '#e07a5f', soft: '#474b6b' }, // slate
  { bg: '#e8d3c0', ink: '#3b2a20', accent: '#2f5d62', soft: '#dcc2aa' }, // clay
];

const MOTIF_BY_CATEGORY = {
  georgian: 'borjgali',
  poetry: 'vine',
  classics: 'frame',
  scifi: 'orbits',
  mystery: 'lens',
  gothic: 'moon',
  adventure: 'waves',
  philosophy: 'grid',
  kids: 'stars',
};

// ── helpers ─────────────────────────────────────────────────────────────────
function hash(str) {
  let h = 2166136261;
  for (const ch of str) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const f = (n) => Math.round(n * 10) / 10;

const fontCache = new Map();
function font(file) {
  if (!fontCache.has(file)) fontCache.set(file, openSync(join(FONTS, file)));
  return fontCache.get(file);
}
const isGeorgian = (cp) => (cp >= 0x10a0 && cp <= 0x10ff) || (cp >= 0x1c90 && cp <= 0x1cbf);

/** Text -> { d: svg path data, width } using Latin + Georgian fonts with per-run fallback. */
function outline(text, { latin, georgian, size, tracking = 0 }) {
  const runs = [];
  for (const ch of text) {
    const g = isGeorgian(ch.codePointAt(0));
    const last = runs[runs.length - 1];
    if (last && last.g === g) last.text += ch; else runs.push({ g, text: ch });
  }
  let x = 0;
  const parts = [];
  for (const r of runs) {
    const fk = font(r.g ? georgian : latin);
    const scale = (r.g ? size * 0.92 : size) / fk.unitsPerEm;
    const layout = fk.layout(r.text);
    layout.glyphs.forEach((glyph, i) => {
      const pos = layout.positions[i];
      const gx = x + pos.xOffset * scale;
      const d = glyph.path.commands.map((c) => {
        const pts = [];
        for (let k = 0; k < c.args.length; k += 2) pts.push(`${f(gx + c.args[k] * scale)} ${f(-c.args[k + 1] * scale)}`);
        const op = { moveTo: 'M', lineTo: 'L', quadraticCurveTo: 'Q', bezierCurveTo: 'C', closePath: 'Z' }[c.command];
        return op + pts.join(' ');
      }).join('');
      parts.push(d);
      x += pos.xAdvance * scale + tracking;
    });
  }
  return { d: parts.join(''), width: x - tracking };
}

/**
 * Balanced wrap of a title into the fewest lines (max `maxLines`) that fit `maxWidth`.
 * Long hyphenated words ("სტუმარ-მასპინძელი") may break after the hyphen.
 */
function wrap(text, opts, maxWidth, maxLines) {
  // tokens remember whether they glue to the previous token (after a hyphen) or need a space
  const tokens = [];
  for (const word of text.split(/\s+/)) {
    word.split(/(?<=-)/).forEach((part, i) => tokens.push({ text: part, glue: i > 0 }));
  }
  const join = (group) => group.map((t, i) => (i > 0 && !t.glue ? ' ' : '') + t.text).join('');
  let best = null;
  const n = tokens.length;
  for (let lines = 1; lines <= Math.min(maxLines, n); lines++) {
    // try every way to cut the tokens into `lines` consecutive groups
    const cuts = (start, left) => {
      if (left === 1) return [[tokens.slice(start)]];
      const out = [];
      for (let end = start + 1; end <= n - left + 1; end++) {
        for (const rest of cuts(end, left - 1)) out.push([tokens.slice(start, end), ...rest]);
      }
      return out;
    };
    for (const groups of cuts(0, lines)) {
      const texts = groups.map(join);
      const widest = Math.max(...texts.map((t) => outline(t, opts).width));
      if (widest <= maxWidth && (!best || widest < best.widest)) best = { texts, widest };
    }
    if (best) return best.texts;
  }
  return null;
}

// ── motifs (each draws into the top part of the cover) ──────────────────────
const motifs = {
  borjgali(p, r) {
    // a seven-armed sun, the old Georgian symbol of eternity
    const cx = W / 2 + (r() - 0.5) * 30, cy = 205, R = 112 + r() * 18;
    const arm = `M0 0C${f(R * 0.18)} ${f(-R * 0.52)} ${f(R * 0.78)} ${f(-R * 0.6)} ${f(R)} ${f(-R * 0.12)}C${f(R * 0.66)} ${f(R * 0.02)} ${f(R * 0.32)} ${f(-R * 0.02)} 0 0Z`;
    const rot = r() * 50;
    let s = `<circle cx="${f(cx)}" cy="${cy}" r="${f(R * 1.32)}" fill="${p.soft}"/>`;
    s += `<g transform="translate(${f(cx)} ${cy}) rotate(${f(rot)})">`;
    for (let i = 0; i < 7; i++) s += `<path d="${arm}" fill="${i % 2 ? p.accent : p.ink}" transform="rotate(${f((360 / 7) * i)})"/>`;
    s += `<circle r="${f(R * 0.16)}" fill="${p.bg}"/><circle r="${f(R * 0.07)}" fill="${p.accent}"/></g>`;
    return s;
  },
  vine(p, r) {
    // a climbing vine (ვაზი) — the most Georgian of ornaments
    let s = '';
    const x0 = 70 + r() * 40;
    let path = `M${f(x0)} 360`;
    const leaves = [];
    for (let i = 0; i < 6; i++) {
      const y = 360 - (i + 1) * 52;
      const x = i % 2 ? x0 + 170 + r() * 40 : x0 + 40 + r() * 30;
      path += `S${f(x)} ${f(y + 26)} ${f((x + x0 + 120) / 2)} ${f(y)}`;
      leaves.push([(x + x0 + 120) / 2, y, i]);
    }
    s += `<path d="${path}" fill="none" stroke="${p.ink}" stroke-width="3" stroke-linecap="round"/>`;
    for (const [x, y, i] of leaves) {
      const dir = i % 2 ? 1 : -1;
      s += `<path d="M${f(x)} ${f(y)}q${f(dir * 34)} -30 ${f(dir * 62)} -6q${f(-dir * 26)} 34 ${f(-dir * 62)} 6Z" fill="${i % 3 === 0 ? p.accent : p.ink}" opacity="${i % 3 === 0 ? 1 : 0.9}"/>`;
      if (i % 2 === 0) for (let k = 0; k < 5; k++) s += `<circle cx="${f(x - dir * (16 + (k % 3) * 9))}" cy="${f(y + 18 + Math.floor(k / 3) * 10 + (k % 3) * 3)}" r="5.5" fill="${p.accent}"/>`;
    }
    return s;
  },
  frame(p, r) {
    const m = 46;
    let s = `<rect x="${m}" y="${m}" width="${W - 2 * m}" height="300" fill="none" stroke="${p.ink}" stroke-width="2"/>`;
    s += `<rect x="${m + 9}" y="${m + 9}" width="${W - 2 * m - 18}" height="282" fill="none" stroke="${p.accent}" stroke-width="1"/>`;
    for (const [x, y] of [[m, m], [W - m, m], [m, m + 300], [W - m, m + 300]]) s += `<rect x="${x - 7}" y="${y - 7}" width="14" height="14" transform="rotate(45 ${x} ${y})" fill="${p.accent}"/>`;
    const cx = W / 2, cy = m + 150, rad = 62 + r() * 12;
    s += `<circle cx="${cx}" cy="${cy}" r="${f(rad)}" fill="${p.soft}" stroke="${p.ink}" stroke-width="1.5"/>`;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      s += `<circle cx="${f(cx + Math.cos(a) * rad * 0.72)}" cy="${f(cy + Math.sin(a) * rad * 0.72)}" r="${i % 3 === 0 ? 5 : 2.6}" fill="${i % 3 === 0 ? p.accent : p.ink}"/>`;
    }
    s += `<path d="M${cx} ${f(cy - 22)}L${cx + 22} ${cy}L${cx} ${f(cy + 22)}L${cx - 22} ${cy}Z" fill="${p.accent}"/>`;
    return s;
  },
  orbits(p, r) {
    const cx = W / 2 + (r() - 0.5) * 60, cy = 200;
    let s = `<circle cx="${f(cx)}" cy="${cy}" r="${f(40 + r() * 14)}" fill="${p.accent}"/>`;
    for (let i = 0; i < 4; i++) {
      const rx = 90 + i * 34, ry = 34 + i * 16, rot = -18 + r() * 10;
      s += `<ellipse cx="${f(cx)}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${p.ink}" stroke-width="${i === 1 ? 2.4 : 1.2}" opacity="${0.9 - i * 0.15}" transform="rotate(${f(rot)} ${f(cx)} ${cy})"/>`;
      const a = r() * Math.PI * 2;
      const px = cx + Math.cos(a) * rx, py = cy + Math.sin(a) * ry;
      s += `<circle cx="${f(px)}" cy="${f(py)}" r="${f(5 + r() * 7)}" fill="${i % 2 ? p.ink : p.accent}" transform="rotate(${f(rot)} ${f(cx)} ${cy})"/>`;
    }
    for (let i = 0; i < 24; i++) s += `<circle cx="${f(r() * W)}" cy="${f(r() * 330)}" r="${f(0.8 + r() * 1.4)}" fill="${p.ink}" opacity="0.7"/>`;
    return s;
  },
  lens(p, r) {
    // concentric rings like a magnifying glass over a street grid
    let s = '';
    for (let i = 0; i < 9; i++) s += `<line x1="0" y1="${60 + i * 34}" x2="${W}" y2="${60 + i * 34 + (r() - 0.5) * 30}" stroke="${p.soft}" stroke-width="10"/>`;
    const cx = 170 + r() * 60, cy = 190, R = 92;
    s += `<circle cx="${f(cx)}" cy="${cy}" r="${R}" fill="${p.bg}" stroke="${p.ink}" stroke-width="10"/>`;
    s += `<circle cx="${f(cx)}" cy="${cy}" r="${R - 22}" fill="none" stroke="${p.accent}" stroke-width="2"/>`;
    s += `<line x1="${f(cx + R * 0.7)}" y1="${f(cy + R * 0.7)}" x2="${f(cx + R * 1.35)}" y2="${f(cy + R * 1.35)}" stroke="${p.ink}" stroke-width="16" stroke-linecap="round"/>`;
    s += `<path d="M${f(cx - 14)} ${cy - 30}a14 14 0 1 1 28 0c0 10 -8 14 -8 22v12h-12v-12c0 -8 -8 -12 -8 -22Z" fill="${p.accent}"/>`;
    return s;
  },
  moon(p, r) {
    // a pointed gothic window and a crescent moon
    const cx = W / 2, top = 70, bottom = 340, w = 150;
    let s = `<path d="M${cx - w / 2} ${bottom}V${top + 120}Q${cx - w / 2} ${top + 20} ${cx} ${top}Q${cx + w / 2} ${top + 20} ${cx + w / 2} ${top + 120}V${bottom}Z" fill="${p.soft}" stroke="${p.ink}" stroke-width="3"/>`;
    s += `<line x1="${cx}" y1="${top + 30}" x2="${cx}" y2="${bottom}" stroke="${p.ink}" stroke-width="2"/>`;
    s += `<line x1="${cx - w / 2}" y1="${top + 190}" x2="${cx + w / 2}" y2="${top + 190}" stroke="${p.ink}" stroke-width="2"/>`;
    const mx = cx + (r() - 0.5) * 40, my = top + 105, mr = 34;
    s += `<circle cx="${f(mx)}" cy="${my}" r="${mr}" fill="${p.accent}"/><circle cx="${f(mx + 14)}" cy="${my - 8}" r="${mr - 4}" fill="${p.soft}"/>`;
    for (let i = 0; i < 14; i++) s += `<circle cx="${f(r() * W)}" cy="${f(30 + r() * 300)}" r="${f(0.8 + r() * 1.2)}" fill="${p.ink}" opacity="0.6"/>`;
    return s;
  },
  waves(p, r) {
    let s = '';
    const sunX = 90 + r() * 220;
    s += `<circle cx="${f(sunX)}" cy="120" r="${f(42 + r() * 12)}" fill="${p.accent}"/>`;
    for (let i = 0; i < 7; i++) {
      const y = 190 + i * 24, amp = 9 + r() * 8, len = 70 + r() * 30, off = r() * len;
      let d = `M${f(-off)} ${y}`;
      for (let x = -off; x < W + len; x += len) d += `q${f(len / 4)} ${f(-amp)} ${f(len / 2)} 0t${f(len / 2)} 0`;
      s += `<path d="${d}" fill="none" stroke="${i % 3 === 0 ? p.accent : p.ink}" stroke-width="${i % 3 === 0 ? 3 : 2}" opacity="${1 - i * 0.08}"/>`;
    }
    return s;
  },
  grid(p, r) {
    let s = '';
    const n = 5, size = 52, gap = 12, x0 = (W - (n * size + (n - 1) * gap)) / 2, y0 = 60;
    const hi = Math.floor(r() * n * n);
    for (let i = 0; i < n * n; i++) {
      const x = x0 + (i % n) * (size + gap), y = y0 + Math.floor(i / n) * (size + gap);
      const kind = (i * 7 + hi) % 4;
      const fill = i === hi ? p.accent : p.ink;
      if (i === hi || kind === 0) s += `<circle cx="${f(x + size / 2)}" cy="${f(y + size / 2)}" r="${size / 2}" fill="${fill}"/>`;
      else if (kind === 1) s += `<path d="M${f(x)} ${f(y + size)}A${size} ${size} 0 0 1 ${f(x + size)} ${f(y)}V${f(y + size)}Z" fill="${p.ink}" opacity="0.85"/>`;
      else s += `<circle cx="${f(x + size / 2)}" cy="${f(y + size / 2)}" r="${size / 2 - 1}" fill="none" stroke="${p.ink}" stroke-width="2"/>`;
    }
    return s;
  },
  stars(p, r) {
    let s = '';
    const star = (cx, cy, R, fill) => {
      let d = '';
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? R * 0.45 : R;
        d += `${i ? 'L' : 'M'}${f(cx + Math.cos(a) * rr)} ${f(cy + Math.sin(a) * rr)}`;
      }
      return `<path d="${d}Z" fill="${fill}"/>`;
    };
    s += `<circle cx="${f(120 + r() * 160)}" cy="190" r="96" fill="${p.soft}"/>`;
    for (let i = 0; i < 9; i++) s += star(40 + r() * 320, 50 + r() * 290, 8 + r() * 20, i % 3 ? p.ink : p.accent);
    for (let i = 0; i < 18; i++) s += `<circle cx="${f(r() * W)}" cy="${f(40 + r() * 300)}" r="${f(2 + r() * 3)}" fill="${i % 2 ? p.accent : p.ink}"/>`;
    return s;
  },
};

/**
 * Renders the cover of a catalog book.
 * book: { slug, title, author, category, language }
 */
export function renderCover(book) {
  const seed = hash(book.slug);
  const r = rng(seed);
  const palette = PALETTES[seed % PALETTES.length];
  const motif = motifs[MOTIF_BY_CATEGORY[book.category] ?? 'frame'];
  const ka = book.language === 'ka';

  const titleFonts = { latin: 'Spectral-SemiBold.ttf', georgian: 'NotoSerifGeorgian-Bold.ttf' };
  const maxWidth = W - 72;
  let size = 46;
  let lines = null;
  while (size > 20 && !(lines = wrap(book.title, { ...titleFonts, size }, maxWidth, 3))) size -= 2;
  if (!lines) lines = [book.title];

  const lineH = size * 1.12;
  const authorY = H - 92;
  const titleBottom = authorY - 34;
  const titleTop = titleBottom - (lines.length - 1) * lineH;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${escapeXml(book.title)} — ${escapeXml(book.author)}">`;
  svg += `<title>${escapeXml(book.title)}</title>`;
  svg += `<rect width="${W}" height="${H}" fill="${palette.bg}"/>`;
  // the motif must stay clear of the title block
  const clip = Math.min(360, titleTop - size * 0.85 - 18);
  svg += `<defs><clipPath id="m"><rect width="${W}" height="${f(clip)}"/></clipPath></defs>`;
  svg += `<g clip-path="url(#m)">${motif(palette, r)}</g>`;
  // title
  for (const [i, line] of lines.entries()) {
    const o = outline(line, { ...titleFonts, size });
    svg += `<path transform="translate(${f((W - o.width) / 2)} ${f(titleTop + i * lineH)})" d="${o.d}" fill="${palette.ink}"/>`;
  }
  // author
  const authorText = ka ? book.author : book.author.toUpperCase();
  const a = outline(authorText, { latin: 'Spectral-Regular.ttf', georgian: 'NotoSansGeorgian-SemiBold.ttf', size: ka ? 17 : 14, tracking: ka ? 1 : 2.6 });
  svg += `<rect x="${(W - 40) / 2}" y="${authorY - 26}" width="40" height="2" fill="${palette.accent}"/>`;
  svg += `<path transform="translate(${f((W - a.width) / 2)} ${authorY})" d="${a.d}" fill="${palette.ink}" opacity="0.88"/>`;
  // publisher mark
  const mark = outline('ANBANI', { latin: 'Spectral-SemiBold.ttf', georgian: 'NotoSansGeorgian-SemiBold.ttf', size: 10, tracking: 3.2 });
  svg += `<path transform="translate(${f((W - mark.width) / 2)} ${H - 34})" d="${mark.d}" fill="${palette.ink}" opacity="0.55"/>`;
  // binding shadow on the left edge, so the cover reads as a book
  svg += `<rect width="16" height="${H}" fill="#000" opacity="0.14"/><rect x="16" width="2" height="${H}" fill="#fff" opacity="0.12"/>`;
  svg += '</svg>';
  return svg;
}

const escapeXml = (s) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
