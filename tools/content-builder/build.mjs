// Builds the demo library: parses every cached text, typesets the full edition and
// a short preview, and writes src/BooksApi/SeedData/catalog.json for the API seed.
//   node build.mjs              -> all books
//   node build.mjs dracula      -> one book (catalog.json is updated in place)
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { books, categories } from './sources.mjs';
import { cacheFile, SEED_BOOKS_DIR, SEED_DIR } from './lib/paths.mjs';
import { parseGutenberg } from './lib/gutenberg.mjs';
import { parseWikisource, parseWikisourceIndex } from './lib/wikisource.mjs';
import { parseOriginal } from './lib/original.mjs';
import { typesetBook, yearLabel } from './lib/typeset.mjs';
import { renderCover } from './lib/covers.mjs';

const SEED_COVERS_DIR = join(SEED_DIR, 'covers');
mkdirSync(SEED_BOOKS_DIR, { recursive: true });
mkdirSync(SEED_COVERS_DIR, { recursive: true });

// `node build.mjs --covers` only regenerates the SVG covers (fast, for design work).
if (process.argv.includes('--covers')) {
  for (const book of books) writeFileSync(join(SEED_COVERS_DIR, `${book.slug}.svg`), renderCover(book), 'utf8');
  console.log(`${books.length} covers written to ${SEED_COVERS_DIR}`);
  process.exit(0);
}
const only = process.argv[2];
const catalogFile = join(SEED_DIR, 'catalog.json');
const previous = existsSync(catalogFile) ? JSON.parse(readFileSync(catalogFile, 'utf8')) : { books: [] };
const results = new Map(previous.books.map((b) => [b.slug, b]));

function parse(book) {
  const raw = readFileSync(cacheFile(book), 'utf8');
  switch (book.source.type) {
    case 'gutenberg': return parseGutenberg(book, raw);
    case 'wikisource': return parseWikisource(book, raw);
    case 'wikisource-index': return parseWikisourceIndex(book, raw);
    case 'original': return parseOriginal(book, raw);
    default: throw new Error(`Unknown source type ${book.source.type}`);
  }
}

const countWords = (blocks) => blocks.reduce((n, b) => {
  const text = b.text ?? (b.lines ?? []).join(' ') ?? '';
  return n + (text ? text.split(/\s+/).filter(Boolean).length : 0);
}, 0);

for (const book of books) {
  if (only && book.slug !== only) continue;
  if (!existsSync(cacheFile(book))) { console.log(`✗ ${book.slug}: source missing (run fetch first)`); continue; }
  const started = Date.now();
  const blocks = parse(book);
  const words = countWords(blocks);

  const fullFile = join(SEED_BOOKS_DIR, `${book.slug}.pdf`);
  const full = await typesetBook(book, blocks, { out: fullFile });

  // Preview: front matter + ~8% of the text (3–12 pages), then a "preview ends here" page.
  const firstBodyPage = full.chapters[0]?.page ?? 3;
  const textPages = Math.min(12, Math.max(3, Math.round((full.pages - firstBodyPage) * 0.08)));
  const keep = Math.min(full.pages - 1, firstBodyPage - 1 + textPages);
  const previewFile = join(SEED_BOOKS_DIR, `${book.slug}.preview.pdf`);
  const preview = await typesetBook(book, blocks, { out: previewFile, stopAfter: keep, tocFrom: full.chapters });
  writeFileSync(join(SEED_COVERS_DIR, `${book.slug}.svg`), renderCover(book), 'utf8');

  const wpm = book.language === 'ka' ? 170 : 230;
  results.set(book.slug, {
    slug: book.slug,
    title: book.title,
    author: book.author,
    translator: book.translator ?? null,
    year: book.year,
    yearLabel: { ka: yearLabel(book, 'ka'), en: yearLabel(book, 'en') },
    language: book.language,
    category: book.category,
    isFree: !!book.isFree,
    tags: book.tags ?? [],
    description: book.description,
    rating: book.rating,
    ratingCount: book.ratingCount,
    readers: book.readers,
    pages: full.pages,
    previewPages: preview.pages,
    words,
    readingMinutes: Math.max(5, Math.round(words / wpm)),
    chapters: full.chapters,
    file: `${book.slug}.pdf`,
    previewFile: `${book.slug}.preview.pdf`,
    fileSize: statSync(fullFile).size,
    previewFileSize: statSync(previewFile).size,
    source: book.source.type === 'gutenberg'
      ? { name: 'Project Gutenberg', url: `https://www.gutenberg.org/ebooks/${book.source.id}` }
      : book.source.type === 'original'
        ? { name: 'Anbani', url: null }
        : { name: 'ვიკიწყარო', url: `https://ka.wikisource.org/wiki/${encodeURIComponent(book.source.page ?? book.source.index)}` },
  });
  const kb = (n) => `${Math.round(n / 1024)} KB`;
  console.log(`✓ ${book.slug.padEnd(34)} ${String(full.pages).padStart(4)} pp  ${String(full.chapters.length).padStart(3)} ch  ${String(words).padStart(7)} words  ${kb(statSync(fullFile).size).padStart(8)}  preview ${preview.pages} pp  ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

const ordered = books.map((b) => results.get(b.slug)).filter(Boolean);
writeFileSync(catalogFile, JSON.stringify({ generatedAt: new Date().toISOString(), categories, books: ordered }, null, 2), 'utf8');
console.log(`\ncatalog.json: ${ordered.length} books, ${categories.length} categories`);
