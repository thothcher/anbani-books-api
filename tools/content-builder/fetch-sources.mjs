// Downloads the raw public-domain texts into ./cache (only what is missing).
//   node fetch-sources.mjs            -> fetch everything
//   node fetch-sources.mjs dracula    -> fetch one book by slug
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { books } from './sources.mjs';
import { CACHE, cacheFile } from './lib/paths.mjs';

const UA = 'AnbaniContentBuilder/1.0 (educational demo library; STEP IT Academy Georgia)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(join(CACHE, 'gutenberg'), { recursive: true });
mkdirSync(join(CACHE, 'wikisource'), { recursive: true });

async function get(url, { json = false } = {}) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.status === 429 || res.status >= 500) {
      const wait = 4000 * attempt;
      console.log(`  ${res.status} — retrying in ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return json ? res.json() : res.text();
  }
  throw new Error(`Gave up on ${url}`);
}

/** Wikisource page -> raw wikitext (follows redirects). */
async function wikitext(title) {
  const url = new URL('https://ka.wikisource.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', prop: 'revisions',
    rvprop: 'content', rvslots: 'main', titles: title, redirects: '1',
  });
  const data = await get(url, { json: true });
  const page = data.query.pages[0];
  if (page.missing) throw new Error(`Wikisource page not found: ${title}`);
  return page.revisions[0].slots.main.content;
}

const only = process.argv[2];
for (const book of books) {
  if (only && book.slug !== only) continue;
  if (book.source.type === 'original') continue; // written for this project, nothing to download
  const file = cacheFile(book);
  if (existsSync(file)) { console.log(`✓ ${book.slug} (cached)`); continue; }
  console.log(`↓ ${book.slug}`);

  if (book.source.type === 'gutenberg') {
    const id = book.source.id;
    const text = await get(`https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`);
    writeFileSync(file, text, 'utf8');
    await sleep(1500);
  } else if (book.source.type === 'wikisource') {
    writeFileSync(file, await wikitext(book.source.page), 'utf8');
    await sleep(3500);
  } else if (book.source.type === 'wikisource-index') {
    // The index page lists chapters as "*[[Index/Chapter|Chapter]]" lines, in reading order.
    const index = await wikitext(book.source.index);
    const chapters = [...index.matchAll(/^\*\s*\[\[([^|\]]+)(?:\|[^\]]*)?\]\]/gm)].map((m) => m[1].trim());
    console.log(`  ${chapters.length} chapters`);
    const partsDir = join(CACHE, 'wikisource', book.slug);
    mkdirSync(partsDir, { recursive: true });
    const parts = [];
    for (const [i, title] of chapters.entries()) {
      const partFile = join(partsDir, `${String(i + 1).padStart(3, '0')}.txt`);
      if (existsSync(partFile)) {
        parts.push({ title: title.split('/').pop(), text: readFileSync(partFile, 'utf8') });
        continue;
      }
      await sleep(3500);
      try {
        const text = await wikitext(title);
        writeFileSync(partFile, text, 'utf8');
        parts.push({ title: title.split('/').pop(), text });
      } catch (err) {
        console.log(`  ! skipped "${title}": ${err.message}`);
      }
      process.stdout.write(`  ${i + 1}/${chapters.length}\r`);
    }
    writeFileSync(file, JSON.stringify(parts), 'utf8');
    console.log('');
  }
}
console.log('Done.');
