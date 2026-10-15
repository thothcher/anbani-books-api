// Small text helpers shared by the parsers.

const SMALL = new Set(['a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'and', 'or', 'for', 'with', 'by', 'from', 'as', 'but', 'nor', 'into']);

/** "JONATHAN HARKER’S JOURNAL" -> "Jonathan Harker’s Journal" */
export function titleCase(s) {
  return s
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((w, i) => {
      if (/^\s+$|^-$/.test(w)) return w;
      const bare = w.replace(/^[^a-z]+/, '');
      if (i > 0 && SMALL.has(bare)) return w;
      if (/^[ivxlc]+[.:]?$/.test(w)) return w.toUpperCase(); // roman numerals
      return w.replace(/[a-z]/, (c) => c.toUpperCase());
    })
    .join('')
    .replace(/\bMr\b/g, 'Mr').replace(/\bDr\b/g, 'Dr');
}

/** Typographic clean-up: dashes, ellipses, straight quotes -> curly quotes. */
export function typography(s) {
  return s
    .replace(/\s*--\s*/g, '—')
    .replace(/\.{3}/g, '…')
    .replace(/(^|[\s(\[—-])"/g, '$1“')
    .replace(/"/g, '”')
    .replace(/(^|[\s(\[—-])'/g, '$1‘')
    .replace(/'/g, '’')
    .replace(/ {2,}/g, ' ');
}
