// Project Gutenberg plain text -> book blocks.
//
// Block model shared by every source (see typeset.mjs):
//   { type: 'part', title }                 part heading, starts a new page
//   { type: 'chapter', label, title }       chapter heading, starts a new page
//   { type: 'p', text, italic?, center? }   prose paragraph
//   { type: 'verse', lines: string[] }      stanza (line breaks preserved)
//   { type: 'break' }                       scene break
import { titleCase, typography } from './text.mjs';

export function extractGutenbergBody(raw) {
  const text = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const start = text.search(/^\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG E(BOOK|TEXT)[^\n]*$/m);
  const end = text.search(/^\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG E(BOOK|TEXT)/m);
  const from = start >= 0 ? text.indexOf('\n', start) + 1 : 0;
  return text.slice(from, end >= 0 ? end : undefined);
}

const SKIP = [
  /^\[Illustration[^\]]*\]$/is,
  /^\[?Transcriber’?'?s? [Nn]ote/,
  /^(Contents|CONTENTS)$/,
];

const isBreak = (s) => /^(\*\s*){3,}$|^\s*\*\s+\*\s+\*\s*$|^[-—_\s]{5,}$|^☙|^❧/.test(s.trim());

export function parseGutenberg(book, raw) {
  const p = book.parse;
  let body = extractGutenbergBody(raw);
  const startIdx = body.search(p.start);
  if (startIdx < 0) throw new Error(`${book.slug}: start pattern not found`);
  body = body.slice(startIdx);
  if (p.end) {
    const endIdx = body.search(p.end);
    if (endIdx > 0) body = body.slice(0, endIdx);
  }

  const chunks = body.split(/\n[ \t]*\n/).map((c) => c.replace(/^\n+|\n+$/g, '')).filter((c) => c.trim());
  const blocks = [];

  for (let i = 0; i < chunks.length; i++) {
    let chunk = chunks[i];
    if (SKIP.some((re) => re.test(chunk.trim()))) continue;
    if (p.stripBracketNotes && /^\[.*\]$/s.test(chunk.trim())) continue;
    if (p.footnotes) {
      if (/^\s*\[\d+\]/.test(chunk)) continue; // the footnote itself
      chunk = chunk.replace(/\[\d+\]/g, ''); // the reference mark in the text
    }
    const lines = chunk.split('\n');
    const first = lines[0].trim();

    if (p.chapter.test(first)) {
      const isPart = p.part && p.part.test(first);
      let { label, title } = splitHeading(first);
      if (lines.length > 1) title = [title, ...lines.slice(1).map((l) => l.trim())].filter(Boolean).join(' ');
      else if (p.titleCaseNextLine && chunks[i + 1] && !p.chapter.test(chunks[i + 1].split('\n')[0].trim()) && looksLikeTitle(chunks[i + 1])) {
        title = chunks[i + 1].split('\n').map((l) => l.trim()).join(' ');
        i++;
      }
      if (isPart) {
        blocks.push({ type: 'part', title: tidyTitle([label, title].filter(Boolean).join(' — ')) });
      } else {
        blocks.push({ type: 'chapter', label: tidyLabel(label), title: title ? tidyTitle(title) : '' });
      }
      continue;
    }

    if (isBreak(chunk)) { blocks.push({ type: 'break' }); continue; }

    // Indented multi-line chunks in Gutenberg are verse, letters or quotations: keep their lines.
    const indented = lines.length >= 2 && lines.every((l) => /^\s{2,}\S/.test(l) || !l.trim());
    if (book.parse.mode === 'verse' || indented) {
      blocks.push({ type: 'verse', lines: lines.map((l) => typography(stripItalics(l.trim()))).filter(Boolean) });
      continue;
    }

    const joined = lines.map((l) => l.trim()).join(' ').replace(/\s+/g, ' ').trim();
    const italic = /^_[^_]+_$/.test(joined);
    blocks.push({ type: 'p', text: typography(stripItalics(joined)), italic: italic || undefined });
  }
  return blocks;
}

function stripItalics(s) {
  return s.replace(/(^|[\s(“"‘'—-])_(?=\S)/g, '$1').replace(/(?<=\S)_(?=$|[\s.,;:!?)”"’'—-])/g, '');
}

function splitHeading(line) {
  // "I. LAYING PLANS" | "CHAPTER IV. THE RABBIT" | "Chapter 3." | "Letter 1" | "THE FIRST BOOK"
  let m = line.match(/^((?:CHAPTER|Chapter|LETTER|Letter|STAVE|Stave|BOOK|Book)\s+[\wIVXLC]+\.?)\s*(.*)$/);
  if (m) return { label: m[1], title: m[2] };
  m = line.match(/^([IVXLC]+\.)\s+(.+)$/);
  if (m) return { label: m[1], title: m[2] };
  m = line.match(/^([IVXLC]+\.?|\d+\.?)$/);
  if (m) return { label: m[1], title: '' };
  return { label: '', title: line };
}

function looksLikeTitle(chunk) {
  const s = chunk.trim();
  const caps = s === s.toUpperCase();
  if (s.split('\n').length > (caps ? 3 : 2)) return false;
  if (s.length > (caps ? 170 : 90)) return false;
  if (/^\(.*\)$/.test(s)) return false;
  // all caps, or Title Case without a sentence ending
  return s === s.toUpperCase() || !/[.!?]["”’]?$/.test(s) || /^[A-Z][^.!?]{0,60}\.$/.test(s);
}

function tidyLabel(label) {
  return label.replace(/\.$/, '').replace(/^(CHAPTER|LETTER|STAVE|BOOK)\b/, (w) => w[0] + w.slice(1).toLowerCase());
}

function tidyTitle(title) {
  const t = title.replace(/\.$/, '').replace(/\s+/g, ' ').trim();
  return typography(t === t.toUpperCase() ? titleCase(t) : t);
}
