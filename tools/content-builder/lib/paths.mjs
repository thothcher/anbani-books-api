import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const CACHE = join(ROOT, 'cache');
export const FONTS = join(ROOT, 'fonts');
/** Where the API reads its seed data from. */
export const SEED_DIR = join(ROOT, '..', '..', 'src', 'BooksApi', 'SeedData');
export const SEED_BOOKS_DIR = join(SEED_DIR, 'books');

export const cacheFile = (book) =>
  book.source.type === 'gutenberg'
    ? join(CACHE, 'gutenberg', `${book.source.id}.txt`)
    : book.source.type === 'original'
      ? join(ROOT, book.source.file)
      : join(CACHE, 'wikisource', `${book.slug}.txt`);
