// Dev helper: shows how the chapter patterns from sources.mjs match each cached text.
//   node inspect.mjs [slug]
import { existsSync, readFileSync } from 'node:fs';
import { books } from './sources.mjs';
import { cacheFile } from './lib/paths.mjs';
import { extractGutenbergBody } from './lib/gutenberg.mjs';

const only = process.argv[2];
for (const book of books) {
  if (only && book.slug !== only) continue;
  if (book.source.type !== 'gutenberg') continue;
  const file = cacheFile(book);
  if (!existsSync(file)) { console.log(`✗ ${book.slug}: not cached`); continue; }
  const body = extractGutenbergBody(readFileSync(file, 'utf8'));
  const startIdx = body.search(book.parse.start);
  const lines = body.slice(Math.max(0, startIdx)).split('\n');
  const hits = lines.map((l, i) => [i, l.trim()]).filter(([, l]) => book.parse.chapter.test(l));
  console.log(`\n■ ${book.slug}  start=${startIdx}  chapters=${hits.length}`);
  for (const [i, l] of hits.slice(0, 4)) console.log(`   ${String(i).padStart(6)}  ${l}  ⟶  ${(lines[i + 1] || '').trim() || (lines[i + 2] || '').trim()}`);
  if (hits.length > 4) console.log(`   …  last: ${hits.at(-1)[1]}`);
}
