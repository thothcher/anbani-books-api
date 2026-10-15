// A small book typesetter on top of pdfkit.
//
// pdfkit's own text flow cannot mix fonts inside a justified paragraph, and the
// Georgian font we use (Noto Serif Georgian) contains *only* Georgian letters —
// no spaces, digits or punctuation. So we do our own layout: every word is split
// into script runs (Georgian -> Noto Serif Georgian, everything else -> Spectral),
// lines are broken greedily and justified by distributing the free space between
// words, and each run is drawn at its exact baseline position.
import PDFDocument from 'pdfkit';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { FONTS } from './paths.mjs';

export const PAGE = { width: 419.53, height: 595.28 }; // A5
const M = { top: 66, bottom: 70, left: 56, right: 56 };
const C = { ink: '#211d18', muted: '#8b8279', faint: '#b9b0a3', accent: '#c42d1c', rule: '#d8cfc1', gold: '#a8812f' };

const FONT_FILES = {
  'L-regular': 'Spectral-Regular.ttf',
  'L-italic': 'Spectral-Italic.ttf',
  'L-semibold': 'Spectral-SemiBold.ttf',
  'L-light': 'Spectral-Light.ttf',
  'L-lightitalic': 'Spectral-LightItalic.ttf',
  'G-regular': 'NotoSerifGeorgian-Regular.ttf',
  'G-bold': 'NotoSerifGeorgian-Bold.ttf',
  'G-light': 'NotoSerifGeorgian-Light.ttf',
  'GS-regular': 'NotoSansGeorgian-Regular.ttf',
  'GS-semibold': 'NotoSansGeorgian-SemiBold.ttf',
};

// style -> [font for Latin & punctuation, font for Georgian letters]
const STYLES = {
  body: ['L-regular', 'G-regular'],
  italic: ['L-italic', 'G-light'],
  bold: ['L-semibold', 'G-bold'],
  display: ['L-light', 'G-regular'],
  label: ['L-semibold', 'GS-semibold'],
  sans: ['L-regular', 'GS-regular'],
};
const GEORGIAN_SCALE = 0.9; // Noto Serif Georgian reads larger than Spectral at the same size

const isGeorgian = (cp) => (cp >= 0x10a0 && cp <= 0x10ff) || (cp >= 0x1c90 && cp <= 0x1cbf) || (cp >= 0x2d00 && cp <= 0x2d2f);
const hasGeorgian = (s) => [...s].some((ch) => isGeorgian(ch.codePointAt(0)));

class StopLayout extends Error {}

export class Typesetter {
  constructor(doc, lang) {
    this.doc = doc;
    this.lang = lang;
    this.pages = []; // { kind: 'front'|'opening'|'body'|'part'|'end'|'cta' }
    this.y = M.top;
    this.stopAfter = Infinity;
    this.widthCache = new Map();
    for (const [name, file] of Object.entries(FONT_FILES)) doc.registerFont(name, join(FONTS, file));
  }

  get textWidth() { return PAGE.width - M.left - M.right; }
  get bottom() { return PAGE.height - M.bottom; }

  newPage(kind = 'body') {
    if (this.pages.length >= this.stopAfter) throw new StopLayout();
    this.doc.addPage({ size: [PAGE.width, PAGE.height], margins: { top: 0, bottom: 0, left: 0, right: 0 } });
    this.pages.push({ kind });
    this.y = M.top;
  }

  ensure(height) {
    if (this.y + height > this.bottom) this.newPage('body');
  }

  // ── measuring ────────────────────────────────────────────────────────────
  measure(text, font, size, cs = 0) {
    const key = `${font}|${size}|${cs}|${text}`;
    let w = this.widthCache.get(key);
    if (w === undefined) {
      this.doc.font(font).fontSize(size);
      w = this.doc.widthOfString(text, { characterSpacing: cs });
      if (this.widthCache.size > 200000) this.widthCache.clear();
      this.widthCache.set(key, w);
    }
    return w;
  }

  /** Splits a word into runs of one script and measures them. */
  word(text, style, size, cs = 0) {
    const [latin, georgian] = STYLES[style];
    const runs = [];
    let cur = null;
    for (const ch of text) {
      const g = isGeorgian(ch.codePointAt(0));
      if (!cur || cur.g !== g) { cur = { g, text: '' }; runs.push(cur); }
      cur.text += ch;
    }
    let width = 0;
    for (const r of runs) {
      r.font = r.g ? georgian : latin;
      r.size = r.g ? size * GEORGIAN_SCALE : size;
      r.width = this.measure(r.text, r.font, r.size, cs);
      width += r.width + cs;
    }
    return { text, runs, width: width - cs };
  }

  /** Greedy line breaking. widthFor(i) gives the available width of line i. */
  breakLines(words, widthFor, space) {
    const lines = [];
    let line = [];
    let w = 0;
    for (const word of words) {
      const avail = widthFor(lines.length);
      const next = line.length ? w + space + word.width : word.width;
      if (line.length && next > avail) {
        lines.push({ words: line, width: w });
        line = [word];
        w = word.width;
      } else {
        line.push(word);
        w = next;
      }
    }
    if (line.length) lines.push({ words: line, width: w, last: true });
    return lines;
  }

  drawLine(line, x, baseline, avail, align, space, color, cs = 0) {
    let gap = space;
    let startX = x;
    if (align === 'justify' && !line.last && line.words.length > 1) {
      const extra = (avail - line.width) / (line.words.length - 1);
      gap = space + Math.min(extra, space * 3); // very loose lines stay a little ragged
    } else if (align === 'center') {
      startX = x + (avail - line.width) / 2;
    } else if (align === 'right') {
      startX = x + avail - line.width;
    }
    let cx = startX;
    for (const word of line.words) {
      for (const r of word.runs) {
        this.doc.font(r.font).fontSize(r.size).fillColor(color)
          .text(r.text, cx, baseline, { lineBreak: false, baseline: 'alphabetic', characterSpacing: cs });
        cx += r.width + cs;
      }
      cx += gap - cs;
    }
  }

  /**
   * Lays out one paragraph at this.y, breaking pages as needed.
   * opts: style, size, leading, align, indent, color, dropCap, left (extra left margin),
   *       hanging (indent of continuation lines), cs (letter spacing), keepLines
   */
  paragraph(text, opts = {}) {
    const style = opts.style ?? 'body';
    const size = opts.size ?? 10.5;
    const leading = opts.leading ?? size * 1.5;
    const align = opts.align ?? 'justify';
    const color = opts.color ?? C.ink;
    const cs = opts.cs ?? 0;
    const left = M.left + (opts.left ?? 0);
    const full = this.textWidth - (opts.left ?? 0) - (opts.right ?? 0);
    const indent = opts.indent ?? 0;
    const hanging = opts.hanging ?? 0;
    const space = this.measure(' ', STYLES[style][0], size) + cs;

    const words = text.split(/\s+/).filter(Boolean).map((w) => this.word(w, style, size, cs));
    if (!words.length) return;

    let cap = null;
    if (opts.dropCap) cap = this.prepareDropCap(words, size, leading);

    const capLines = cap ? cap.lines : 0;
    const widthFor = (i) => (i < capLines ? full - cap.indent : i === 0 ? full - indent : full - hanging);
    const lines = this.breakLines(words, widthFor, space);

    const ascent = size * 0.75;
    const keep = Math.min(lines.length, opts.keepLines ?? 2);
    this.ensure(ascent + leading * (Math.max(keep, capLines) - 1) + size * 0.3);

    if (cap) this.drawDropCap(cap, left, this.y + ascent, leading);

    lines.forEach((line, i) => {
      if (i > 0 && this.y + ascent > this.bottom) this.newPage('body');
      const offset = i < capLines ? cap.indent : i === 0 ? indent : hanging;
      this.drawLine(line, left + offset, this.y + ascent, widthFor(i), align, space, color, cs);
      this.y += leading;
    });
    if (cap) this.y = Math.max(this.y, cap.bottom + leading * 0.25);
  }

  /** The first letter becomes an illuminated initial in the accent colour. */
  prepareDropCap(words, size, leading) {
    const first = words[0].text;
    const letter = [...first][0];
    if (!/\p{L}/u.test(letter)) return null;
    const g = isGeorgian(letter.codePointAt(0));
    const font = g ? 'G-regular' : 'L-regular';
    this.doc.font(font);
    const fk = this.doc._font.font;
    const glyph = fk.layout(letter).glyphs[0];
    const upm = fk.unitsPerEm;
    const top = glyph.bbox.maxY / upm;
    const bottomEm = Math.min(0, glyph.bbox.minY / upm);
    // the part above the baseline spans from the cap-height of line 1 to the baseline of line 2
    const target = leading + size * 0.68;
    const capSize = Math.min(target / Math.max(top, 0.45), size * 4.4);
    const advance = (glyph.advanceWidth / upm) * capSize;
    const descent = -bottomEm * capSize;
    const lines = 2 + (descent > 2 ? Math.ceil(descent / leading) : 0);

    // remove the letter from the first word
    const rest = first.slice(letter.length);
    words[0] = this.word(rest || '​', 'body', size);
    if (!rest) words.shift();
    return { letter, font, capSize, indent: advance + size * 0.45, lines, descent, top: top * capSize };
  }

  drawDropCap(cap, left, firstBaseline, leading) {
    const baseline = firstBaseline + leading; // sits on the baseline of line 2
    this.doc.font(cap.font).fontSize(cap.capSize).fillColor(C.accent)
      .text(cap.letter, left, baseline, { lineBreak: false, baseline: 'alphabetic' });
    cap.bottom = baseline + cap.descent;
  }

  // ── building blocks ──────────────────────────────────────────────────────
  rule(width = 36, color = C.accent, thickness = 0.8) {
    const x = M.left + (this.textWidth - width) / 2;
    this.doc.save().moveTo(x, this.y).lineTo(x + width, this.y).lineWidth(thickness).strokeColor(color).stroke().restore();
  }

  /** A small diamond-and-dots ornament, drawn as vectors so no font is needed. */
  ornament(cy, color = C.accent, scale = 1) {
    const cx = PAGE.width / 2;
    const d = 3.2 * scale;
    const doc = this.doc;
    doc.save().fillColor(color);
    doc.moveTo(cx, cy - d).lineTo(cx + d, cy).lineTo(cx, cy + d).lineTo(cx - d, cy).closePath().fill();
    for (const dx of [-11, 11]) doc.circle(cx + dx * scale, cy, 1.1 * scale).fill();
    doc.restore();
    doc.save().lineWidth(0.6).strokeColor(color);
    doc.moveTo(cx - 40 * scale, cy).lineTo(cx - 16 * scale, cy).stroke();
    doc.moveTo(cx + 16 * scale, cy).lineTo(cx + 40 * scale, cy).stroke();
    doc.restore();
  }

  sceneBreak() {
    this.ensure(30);
    this.y += 10;
    const cx = PAGE.width / 2;
    this.doc.save().fillColor(C.accent);
    for (const dx of [-10, 0, 10]) this.doc.circle(cx + dx, this.y, 1.3).fill();
    this.doc.restore();
    this.y += 18;
  }

  /** Text helper for single lines at absolute positions (titles, labels, footers). */
  line(text, { y, style = 'body', size = 10, color = C.ink, align = 'center', cs = 0, x = M.left, width = this.textWidth }) {
    const words = text.split(/\s+/).filter(Boolean).map((w) => this.word(w, style, size, cs));
    const space = this.measure(' ', STYLES[style][0], size) + cs;
    const lines = this.breakLines(words, () => width, space);
    let baseline = y;
    for (const l of lines) {
      this.drawLine(l, x, baseline, width, align, space, color, cs);
      baseline += size * 1.3;
    }
    return baseline - size * 1.3; // last baseline
  }
}

// ── the book ───────────────────────────────────────────────────────────────

const T = {
  en: {
    contents: 'Contents', end: 'The End', thanks: 'Thank you for reading on Anbani.',
    previewTitle: 'The preview ends here',
    previewBody: (n, t) => `You have just read the first ${n} pages of “${t}”.`,
    previewCta: 'Start a 7-day free trial on Anbani to keep reading — every book in the library, one subscription.',
    previewBadge: 'ANBANI · 7 DAYS FREE',
    translated: (t) => `Translated by ${t}`,
    demo: 'Anbani Demo Library',
    colophon: (b, src) => [
      `${b.title}`,
      `${b.author} · ${yearLabel(b, 'en')}`,
      ...(b.translator ? [`Translated by ${b.translator}`] : []),
      '',
      `Source text: ${src}.`,
      'This work is in the public domain. This edition was typeset for the Anbani demo library — a learning project for the students of STEP IT Academy Georgia. You may share it freely. Not for sale.',
      '',
      'Typefaces: Spectral and Noto Serif Georgian (SIL Open Font License).',
      'Anbani Demo Edition · 2026',
    ],
  },
  ka: {
    contents: 'სარჩევი', end: 'დასასრული', thanks: 'გმადლობთ, რომ ანბანზე კითხულობთ.',
    previewTitle: 'ფრაგმენტი აქ მთავრდება',
    previewBody: (n, t) => `თქვენ წაიკითხეთ „${t}“-ის პირველი ${n} გვერდი.`,
    previewCta: 'დაიწყეთ 7-დღიანი უფასო საცდელი პერიოდი ანბანზე და განაგრძეთ კითხვა — ბიბლიოთეკის ყველა წიგნი ერთი გამოწერით.',
    previewBadge: 'ანბანი · 7 დღე უფასოდ',
    translated: (t) => `თარგმანი: ${t}`,
    demo: 'ანბანი — სადემონსტრაციო ბიბლიოთეკა',
    colophon: (b, src) => [
      `${b.title}`,
      `${b.author} · ${yearLabel(b, 'ka')}`,
      '',
      `ტექსტის წყარო: ${src}.`,
      'ნაწარმოები საზოგადოებრივ საკუთრებაშია (public domain). ეს გამოცემა აიწყო „ანბანის“ სადემონსტრაციო ბიბლიოთეკისთვის — STEP IT აკადემიის სტუდენტების სასწავლო პროექტისთვის. თავისუფლად შეგიძლიათ გაზიარება. არ არის გასაყიდად.',
      '',
      'შრიფტები: Spectral და Noto Serif Georgian (SIL Open Font License).',
      'ანბანი · სადემონსტრაციო გამოცემა · 2026',
    ],
  },
};

export function yearLabel(book, lang) {
  if (book.yearLabel) return book.yearLabel[lang];
  const y = book.year;
  if (y < 0) return lang === 'ka' ? `ძვ. წ. დაახ. ${-y} წ.` : `c. ${-y} BC`;
  if (y < 1000) return lang === 'ka' ? `დაახ. ${y} წ.` : `c. ${y} AD`;
  return lang === 'ka' ? `${y} წ.` : String(y);
}

function sourceLabel(book) {
  if (book.source.type === 'gutenberg') return `Project Gutenberg eBook #${book.source.id} (gutenberg.org)`;
  if (book.source.type === 'original') return book.language === 'ka' ? 'ორიგინალური ტექსტი, დაწერილი ამ პროექტისთვის' : 'original text written for this project';
  return book.language === 'ka' ? 'ვიკიწყარო (ka.wikisource.org)' : 'Georgian Wikisource (ka.wikisource.org)';
}

const headingText = (b) => [b.label, b.title].filter(Boolean).join(b.label && /^[IVXLC\d]+$/.test(b.label) ? '. ' : ' · ');

/**
 * Typesets a whole book (or a preview) into a PDF file.
 * options: { out, stopAfter, tocFrom } — stopAfter: number of pages to keep for a preview;
 *          tocFrom: chapter list of the full edition (so the preview shows real page numbers).
 */
export async function typesetBook(book, blocks, { out, stopAfter = Infinity, tocFrom = null }) {
  const lang = book.language === 'ka' ? 'ka' : 'en';
  const t = T[lang];
  const doc = new PDFDocument({
    autoFirstPage: false,
    bufferPages: true,
    compress: true,
    pdfVersion: '1.7',
    lang: lang === 'ka' ? 'ka-GE' : 'en-GB',
    displayTitle: true,
    info: {
      Title: book.title,
      Author: book.author,
      Subject: stopAfter < Infinity ? `${book.title} — preview` : book.title,
      Keywords: ['Anbani', 'public domain', ...(book.tags ?? [])].join(', '),
      Creator: 'Anbani Content Builder',
      Producer: 'pdfkit',
    },
  });
  const stream = createWriteStream(out);
  doc.pipe(stream);
  const ts = new Typesetter(doc, lang);
  ts.stopAfter = stopAfter;

  const verseMode = book.parse?.mode === 'verse';
  const body = book.language === 'ka'
    ? { size: verseMode ? 10.2 : 10.3, leading: verseMode ? 15.4 : 15.9 }
    : { size: 10.4, leading: 15.2 };

  const headings = blocks.filter((b) => b.type === 'chapter' || b.type === 'part');
  const wantToc = headings.length >= 3;
  const tocPerPage = 24;
  const tocPageCount = wantToc ? Math.ceil(headings.length / tocPerPage) : 0;
  const chapters = [];
  let verseLeft = verseOffset(ts, blocks, body);

  try {
    // ── title page
    ts.newPage('front');
    titlePage(ts, book, t, lang);
    // ── colophon
    ts.newPage('front');
    const colophon = t.colophon(book, sourceLabel(book));
    let cy = PAGE.height - M.bottom - colophon.length * 12.5 - 20;
    for (const [i, l] of colophon.entries()) {
      if (!l) { cy += 6; continue; }
      ts.y = cy;
      ts.paragraph(l, { size: i === 0 ? 9 : 7.6, leading: 11, align: 'left', style: i === 0 ? 'bold' : 'body', color: i === 0 ? C.ink : C.muted });
      cy = ts.y + 1.5;
    }
    // ── contents (filled in at the end, when page numbers are known)
    for (let i = 0; i < tocPageCount; i++) ts.newPage('front');

    // ── body. Text that comes before the first heading (epigraph, dedication)
    //    gets its own opening page instead of landing on the contents page.
    if (blocks[0] && blocks[0].type !== 'chapter' && blocks[0].type !== 'part') {
      ts.newPage('opening');
      ts.y = M.top + 58;
    }
    // Short sections (poems split into I, II, III…) flow on instead of each taking a page.
    const chapterCount = blocks.filter((b) => b.type === 'chapter').length;
    const wordCount = blocks.reduce((n, b) => n + (b.text ?? (b.lines ?? []).join(' ')).split(/\s+/).length, 0);
    const inlineChapters = verseMode || wordCount / Math.max(1, chapterCount) < 350;
    let chapterIndex = 0;
    let afterHeading = true;
    let parentOutline = null;
    for (const b of blocks) {
      if (b.type === 'part') {
        ts.newPage('part');
        const p = ts.pages.length;
        const title = b.title;
        ts.ornament(PAGE.height * 0.36);
        ts.line(title, { y: PAGE.height * 0.36 + 42, style: 'display', size: 22, color: C.ink });
        parentOutline = doc.outline.addItem(title, { expanded: true });
        doc.addNamedDestination(`h${chapters.length}`);
        chapters.push({ title, page: p, level: 0, isPart: true });
        afterHeading = true;
        ts.y = M.top; ts.newPage('opening-soft');
        continue;
      }
      if (b.type === 'chapter' && inlineChapters && chapterIndex++ > 0) {
        // a section heading inside the flow: a centred numeral (and title) between ornaments
        ts.ensure(110);
        ts.y += 22;
        const p = ts.pages.length;
        const label = [b.label, b.title].filter(Boolean).join(' · ');
        ts.line(label, { y: ts.y, style: 'label', size: 8, color: C.accent, cs: 1.2 });
        ts.y += 24;
        const title = headingText(b) || book.title;
        (parentOutline ?? doc.outline).addItem(title);
        doc.addNamedDestination(`h${chapters.length}`);
        chapters.push({ title, page: p, level: parentOutline ? 1 : 0 });
        afterHeading = true;
        continue;
      }
      if (b.type === 'chapter') {
        const current = ts.pages[ts.pages.length - 1];
        const fresh = (current?.kind === 'opening-soft' || current?.kind === 'opening') && ts.y <= M.top + 58 + 1;
        if (fresh) current.kind = 'opening';
        else ts.newPage('opening');
        const p = ts.pages.length;
        ts.y = M.top + 58;
        const label = b.label ? displayLabel(b.label, lang) : '';
        if (label) {
          ts.line(lang === 'en' ? label.toUpperCase() : label, { y: ts.y, style: 'label', size: 7.6, color: C.accent, cs: 1.6 });
          ts.y += 22;
        }
        if (b.title) {
          const last = ts.line(b.title, { y: ts.y + 6, style: 'display', size: b.title.length > 40 ? 15 : 18, color: C.ink, x: M.left + 10, width: ts.textWidth - 20 });
          ts.y = last + 20;
        } else {
          ts.y += 6;
        }
        ts.rule(28);
        ts.y += 30;
        const title = headingText(b) || book.title;
        (parentOutline ?? doc.outline).addItem(title);
        doc.addNamedDestination(`h${chapters.length}`);
        chapters.push({ title, page: p, level: parentOutline ? 1 : 0 });
        afterHeading = true;
        continue;
      }
      if (b.type === 'break') { ts.sceneBreak(); afterHeading = true; continue; }
      if (b.type === 'epigraph') {
        ts.ensure(40);
        ts.y += 6;
        for (const l of b.lines) ts.paragraph(l, { style: 'italic', size: body.size * 0.9, leading: body.leading * 0.92, align: 'right', color: C.muted });
        ts.y += 16;
        afterHeading = true;
        continue;
      }
      if (b.type === 'verse') {
        const lineH = body.leading;
        const need = Math.min(b.lines.length, 8) * lineH;
        if (ts.y + need > ts.bottom && b.lines.length <= 12) ts.newPage('body');
        const left = verseMode ? verseLeft : verseOffsetFor(ts, b, body);
        if (b.number) {
          ts.ensure(lineH * 2);
          ts.line(b.number, { y: ts.y + body.size * 0.75, style: 'label', size: 6.8, color: C.accent, align: 'right', x: M.left, width: Math.max(left - 8, 10) });
        }
        for (const l of b.lines) ts.paragraph(l, { size: body.size, leading: lineH, align: 'left', left, hanging: 16, keepLines: 1 });
        ts.y += lineH * 0.55;
        afterHeading = false;
        continue;
      }
      // prose paragraph
      if (ts.pages[ts.pages.length - 1]?.kind === 'opening-soft' && ts.y === M.top) ts.y += 46;
      const style = b.italic ? 'italic' : 'body';
      ts.paragraph(b.text, {
        style,
        size: b.small ? body.size * 0.86 : body.size,
        leading: b.small ? body.leading * 0.88 : body.leading,
        align: b.align ?? (b.center ? 'center' : 'justify'),
        indent: afterHeading || b.align ? 0 : body.size * 1.25,
        dropCap: afterHeading && !b.italic && !b.align && b.text.length > 120,
      });
      afterHeading = false;
    }

    // ── end page
    ts.ensure(110);
    ts.y += 26;
    ts.ornament(ts.y);
    ts.line(t.end, { y: ts.y + 32, style: 'display', size: 13, color: C.ink });
    ts.line(t.thanks, { y: ts.y + 50, style: 'italic', size: 8.6, color: C.muted });
  } catch (err) {
    if (!(err instanceof StopLayout)) throw err;
    // preview: add the "preview ends here" page
    ts.stopAfter = Infinity;
    ts.newPage('cta');
    previewPage(ts, book, t, stopAfter);
  }

  // ── contents pages (now that we know where chapters start)
  const tocEntries = tocFrom ?? chapters;
  if (wantToc) {
    const firstToc = 2; // after title page and colophon
    for (let i = 0; i < tocPageCount && firstToc + i < ts.pages.length; i++) {
      doc.switchToPage(firstToc + i);
      let y = M.top + 28;
      if (i === 0) {
        ts.line(t.contents, { y: M.top + 30, style: 'display', size: 18 });
        ts.y = M.top + 50; ts.rule(28);
        y = M.top + 84;
      }
      for (const [k, e] of tocEntries.slice(i * tocPerPage, (i + 1) * tocPerPage).entries()) {
        const idx = i * tocPerPage + k;
        tocLine(ts, e, y, `h${idx}`, !tocFrom);
        y += 16.4;
      }
    }
  }

  // ── running heads and page numbers
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const kind = ts.pages[i]?.kind ?? 'body';
    const n = i + 1;
    if (kind !== 'front' || i >= 2) {
      if (kind !== 'cta') ts.line(String(n), { y: PAGE.height - M.bottom + 34, style: 'body', size: 8, color: C.muted });
    }
    if (kind === 'body') {
      const head = n % 2 === 0 ? book.author : book.title;
      ts.line(lang === 'en' ? head.toUpperCase() : head, { y: M.top - 30, style: 'label', size: 6.4, color: C.faint, cs: lang === 'en' ? 1.4 : 0.6 });
    }
  }

  doc.end();
  await new Promise((resolve, reject) => { stream.on('finish', resolve); stream.on('error', reject); });
  return { pages: range.count, chapters: chapters.map(({ title, page, level, isPart }) => ({ title, page, level, ...(isPart ? { isPart } : {}) })) };
}

function displayLabel(label, lang) {
  if (/^[IVXLC]+$/.test(label)) return label;
  return label;
}

function titlePage(ts, book, t, lang) {
  const doc = ts.doc;
  // a thin frame like an old bookplate
  doc.save().lineWidth(0.6).strokeColor(C.rule).rect(28, 28, PAGE.width - 56, PAGE.height - 56).stroke().restore();
  ts.line(lang === 'en' ? 'ANBANI' : 'ანბანი', { y: 78, style: 'label', size: 7.4, color: C.accent, cs: 3 });

  const author = lang === 'en' ? book.author.toUpperCase() : book.author;
  ts.line(author, { y: 196, style: 'label', size: 8.6, color: C.muted, cs: lang === 'en' ? 2 : 0.8 });
  const titleSize = book.title.length > 30 ? 21 : 26;
  const last = ts.line(book.title, { y: 238, style: 'display', size: titleSize, color: C.ink, x: M.left + 6, width: ts.textWidth - 12 });
  ts.ornament(last + 34);
  let y = last + 66;
  if (book.translator) { ts.line(t.translated(book.translator), { y, style: 'italic', size: 9, color: C.muted }); y += 16; }
  ts.line(yearLabel(book, lang), { y, style: 'italic', size: 9, color: C.muted });

  // logo mark: the round seal with the letter "ა" (same as the website)
  const s = 26;
  const x = (PAGE.width - s) / 2;
  const yy = PAGE.height - 118;
  doc.save().circle(x + s / 2, yy + s / 2, s / 2).fill(C.accent).restore();
  doc.save().lineWidth(0.45).strokeColor('#fcefe4').strokeOpacity(0.55).circle(x + s / 2, yy + s / 2, s / 2 - 2.4).stroke().restore();
  doc.font('G-regular').fontSize(17).fillColor('#ffffff').text('ა', x + 7.2, yy + 19.5, { lineBreak: false, baseline: 'alphabetic' });
  ts.line(t.demo, { y: yy + s + 18, style: 'label', size: 6.8, color: C.muted, cs: lang === 'en' ? 1.4 : 0.4 });
}

function previewPage(ts, book, t, pagesRead) {
  const doc = ts.doc;
  doc.save().rect(0, 0, PAGE.width, PAGE.height).fill('#f3e3d5').restore();
  ts.ornament(PAGE.height * 0.3);
  ts.line(t.previewTitle, { y: PAGE.height * 0.3 + 44, style: 'display', size: 20 });
  ts.y = PAGE.height * 0.3 + 74;
  ts.paragraph(t.previewBody(pagesRead, book.title), { align: 'center', size: 10, leading: 15, color: C.ink, left: 18, right: 18 });
  ts.y += 6;
  ts.paragraph(t.previewCta, { align: 'center', size: 10, leading: 15, color: C.muted, left: 18, right: 18 });
  const w = 200, h = 34, x = (PAGE.width - w) / 2, y = ts.y + 22;
  doc.save().roundedRect(x, y, w, h, 17).fill(C.accent).restore();
  ts.line(t.previewBadge, { y: y + 21, style: 'label', size: 8, color: '#ffffff', cs: 1.2 });
}

function tocLine(ts, entry, y, dest, link) {
  const doc = ts.doc;
  const indent = entry.level ? 14 : 0;
  const x = M.left + indent;
  const numW = 26;
  const avail = ts.textWidth - indent - numW - 10;
  let title = entry.title;
  const style = entry.level === 0 && hasPartsHint(entry) ? 'bold' : 'body';
  while (ts.word(title, style, 9.4).width > avail && title.length > 4) title = title.slice(0, -2).trimEnd() + '…';
  ts.line(title, { y, style, size: 9.4, align: 'left', x, width: avail + 4 });
  const tw = ts.word(title, style, 9.4).width;
  // dotted leader
  doc.save().lineWidth(0.6).strokeColor(C.faint).dash(0.6, { space: 2.6 })
    .moveTo(x + tw + 6, y).lineTo(M.left + ts.textWidth - numW + 2, y).stroke().undash().restore();
  ts.line(String(entry.page), { y, style: 'body', size: 9.2, align: 'right', x: M.left + ts.textWidth - numW, width: numW, color: C.muted });
  if (link) doc.goTo(M.left, y - 10, ts.textWidth, 13, dest);
}

const hasPartsHint = (e) => e.level === 0 && e.isPart;

/** For poems: one consistent left offset that optically centres the typical line. */
function verseOffset(ts, blocks, body) {
  const widths = [];
  for (const b of blocks) {
    if (b.type !== 'verse') continue;
    for (const l of b.lines) widths.push(ts.word(l, 'body', body.size).width + l.split(' ').length * 2.6);
  }
  if (!widths.length) return 20;
  widths.sort((a, b) => a - b);
  const p80 = widths[Math.floor(widths.length * 0.8)];
  return Math.max(16, Math.min(90, (ts.textWidth - p80) / 2));
}

function verseOffsetFor(ts, block, body) {
  const max = Math.max(...block.lines.map((l) => ts.word(l, 'body', body.size).width + l.split(' ').length * 2.6));
  return Math.max(16, Math.min(80, (ts.textWidth - max) / 2));
}
