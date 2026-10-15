// Georgian Wikisource wikitext -> book blocks (see gutenberg.mjs for the block model).
//
// The Georgian texts come in three flavours:
//   • 'lines'   — every line is a paragraph (most prose wrapped in <poem>…</poem>)
//   • 'wrapped' — hard-wrapped at ~80 chars, paragraphs start with an indent (მამის მკვლელი)
//   • 'verse'   — poems: lines are kept, blank lines separate stanzas

const ORDINALS = 'პირველი|მეორე|მესამე|მეოთხე|მეხუთე|მეექვსე|მეშვიდე|მერვე|მეცხრე|მეათე|მეთერთმეტე|მეთორმეტე|მეცამეტე|მეთოთხმეტე|მეთხუთმეტე|მეთექვსმეტე|მეჩვიდმეტე|მეთვრამეტე|მეცხრამეტე|მეოცე';
const PART_RE = new RegExp(`^\\(?ნაწილი (${ORDINALS})\\)?$`);
const CHAPTER_WORD_RE = new RegExp(`^თავი (${ORDINALS})$`);
const ROMAN_RE = /^[IVXLC]+\.?$/;
const YEAR_LINE_RE = /^(\d{1,2} \S+ )?\d{4}( ?წ\.?)?( .{0,30})?$/;

/** Removes {{templates}} (nested), refs, categories, files and most HTML. Keeps ''' and '' markers. */
export function cleanWikitext(raw) {
  let s = raw.replace(/\r\n?/g, '\n');
  s = s.replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '');
  s = stripTemplates(s);
  s = s.replace(/\[\[(?:კატეგორია|Category|ფაილი|File|Image|სურათი):[^\]]*(?:\[\[[^\]]*\]\][^\]]*)*\]\]/gi, '');
  s = s.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1').replace(/\[\[([^\]]*)\]\]/g, '$1');
  s = s.replace(/<\/?small>/g, '').replace(/<br\s*\/?>/g, '\n');
  s = s.replace(/<\/?(?:center|div|span|p|big|sup|sub|u|s|font|blockquote)[^>]*>/gi, '');
  s = s.replace(/&nbsp;/g, ' ').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  return s;
}

function stripTemplates(s) {
  let out = '';
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '{' && s[i + 1] === '{') { depth++; i++; continue; }
    if (s[i] === '}' && s[i + 1] === '}' && depth > 0) { depth--; i++; continue; }
    if (depth === 0) out += s[i];
  }
  return out;
}

const unbold = (s) => s.replace(/'''/g, '').replace(/''/g, '');
const isBoldLine = (s) => /^'''.+'''$/.test(s.trim());

function tidy(s) {
  return unbold(s)
    .replace(/^:+/, '')
    .replace(/\s*--\s*/g, ' — ')
    .replace(/^[-–]\.?\s+/, '— ')          // dialogue dash at line start
    .replace(/\s[-–]\s/g, ' — ')           // spaced hyphen inside a sentence
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/,(?=\S)(?![\d»”“"])/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Drops editorial notes that Wikisource appends after the text. */
function dropTrailingNotes(text) {
  const close = text.lastIndexOf('</poem>');
  let body = text;
  let tail = '';
  if (close >= 0) { body = text.slice(0, close); tail = text.slice(close + 7); }
  const keptTail = tail.split('\n').map((l) => unbold(l).trim()).filter((l) => l && l.length < 60 && /\d{4}/.test(l) && !/^\(.*\)$/.test(l));
  body = body.replace(/<\/?poem[^>]*>/g, '');
  body = body.split('\n').filter((l) => !/რედაქცია|რედ\.\s*$/.test(l)).join('\n');
  return body + '\n\n' + keptTail.join('\n');
}

export function parseWikisource(book, raw) {
  const mode = book.parse.mode ?? 'lines';
  const text = dropTrailingNotes(cleanWikitext(raw));
  const lines = text.split('\n').map((l) => l.replace(/\s+$/, ''));
  const blocks = [];
  const notes = [];
  let seenContent = false;
  let epigraph = [];
  let stanza = [];
  let para = null; // for 'wrapped' mode

  const flushStanza = () => { if (stanza.length) { blocks.push({ type: 'verse', lines: stanza }); stanza = []; } };
  const flushPara = () => { if (para) { blocks.push({ type: 'p', text: tidy(para) }); para = null; } };
  const flushEpigraph = () => {
    if (epigraph.length) { blocks.push({ type: 'epigraph', lines: epigraph.map(tidy) }); epigraph = []; }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = unbold(rawLine.replace(/^:+/, '')).trim();

    if (!line) {
      if (mode === 'verse') flushStanza();
      if (mode === 'wrapped') flushPara();
      continue;
    }
    // The book title repeated at the top of the page.
    if (!seenContent && line.replace(/[„“”"]/g, '') === book.title.replace(/[„“”"]/g, '')) continue;

    // Headings
    if (PART_RE.test(line)) {
      flushStanza(); flushPara(); flushEpigraph();
      blocks.push({ type: 'part', title: line.replace(/[()]/g, '') });
      seenContent = true;
      continue;
    }
    if (ROMAN_RE.test(line) || CHAPTER_WORD_RE.test(line)) {
      flushStanza(); flushPara(); flushEpigraph();
      let title = '';
      // A bold line right after the number is the chapter title (ოთარაანთ ქვრივი).
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      if (j < lines.length && isBoldLine(lines[j].replace(/^:+/, '')) && unbold(lines[j]).trim().length < 100) {
        title = tidy(lines[j]);
        i = j;
      }
      blocks.push({ type: 'chapter', label: line.replace(/\.$/, ''), title });
      seenContent = true;
      continue;
    }

    // Leading bold lines before any content form the epigraph; so does a lone ''(subtitle)''.
    if (!seenContent && (isBoldLine(rawLine.replace(/^:+/, '')) || /^''\(.*\)''$/.test(rawLine.trim()) || /^\(.*\)$/.test(line))) {
      epigraph.push(rawLine);
      continue;
    }
    if (!seenContent && epigraph.length && line.length < 60 && /[.!?…]$/.test(line) && i < 12) {
      // attribution line under an epigraph, e.g. "გონიერი ანდაზა."
      epigraph.push(rawLine);
      continue;
    }

    // Footnotes such as "* არის ამისთანა ამაოთმორწმუნება..." go to the end of the book.
    if (/^\*\s+\S/.test(line) && mode !== 'verse') {
      notes.push(tidy(line.replace(/^\*\s+/, '')));
      continue;
    }

    flushEpigraph();
    seenContent = true;

    if (mode === 'verse') {
      stanza.push(tidy(line));
    } else if (mode === 'wrapped') {
      const startsParagraph = /^\s{2,}\S/.test(rawLine) || /^[-–—]/.test(line) || para === null;
      if (startsParagraph) { flushPara(); para = line; } else { para += ' ' + line; }
    } else {
      const t = tidy(line);
      if (YEAR_LINE_RE.test(t) && i > lines.length - 12) blocks.push({ type: 'p', text: t, align: 'right', italic: true });
      else blocks.push({ type: 'p', text: t });
    }
  }
  flushStanza(); flushPara(); flushEpigraph();

  if (notes.length) {
    blocks.push({ type: 'chapter', label: '', title: 'შენიშვნები' });
    for (const n of notes) blocks.push({ type: 'p', text: '* ' + n, small: true });
  }
  return blocks;
}

/** ვეფხისტყაოსანი: one wiki page per chapter, stanzas numbered "1", "2"… inside {{poemx}}. */
export function parseWikisourceIndex(book, json) {
  const parts = JSON.parse(json);
  const blocks = [];
  for (const part of parts) {
    const inner = extractPoemx(part.text) ?? cleanWikitext(part.text);
    blocks.push({ type: 'chapter', label: '', title: part.title });
    let stanza = [];
    let number = null;
    const flush = () => {
      if (stanza.length) blocks.push({ type: 'verse', number, lines: stanza });
      stanza = []; number = null;
    };
    for (const rawLine of cleanWikitext(inner).split('\n')) {
      const line = tidy(rawLine);
      if (!line) { flush(); continue; }
      if (/^\d{1,4}$/.test(line)) { flush(); number = line; continue; }
      stanza.push(line);
    }
    flush();
  }
  return blocks;
}

function extractPoemx(text) {
  const start = text.indexOf('{{poemx');
  if (start < 0) return null;
  // content starts after the last "|" of the template header line(s) that precede the first stanza number
  const header = text.slice(start).match(/^\{\{poemx\|[^|]*\|(?:mode=[^|]*\|)?/);
  if (!header) return null;
  let depth = 0;
  let i = start;
  for (; i < text.length; i++) {
    if (text[i] === '{' && text[i + 1] === '{') { depth++; i++; continue; }
    if (text[i] === '}' && text[i + 1] === '}') { depth--; i++; if (depth === 0) break; }
  }
  return text.slice(start + header[0].length, i - 1);
}
