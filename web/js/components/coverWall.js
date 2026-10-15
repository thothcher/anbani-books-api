// A slowly drifting wall of covers — the background of the home stage and the sign-in page.
import { html, render } from '../core/dom.js';
import { get } from '../core/api.js';

/** Rows of covers; every row repeats its covers three times so the CSS loop is seamless. */
export function wallRows(books, rows = 4) {
  return [...Array(rows).keys()].map((r) => {
    const row = books.filter((_, i) => i % rows === r);
    return html`<div class="hero__row" style="--dur:${90 + r * 18}s;--dir:${r % 2 ? 'reverse' : 'normal'}">
      ${[...row, ...row, ...row].map((b) => html`<img src="${b.coverUrl}" alt="" width="160" height="240" loading="${r < 2 ? 'eager' : 'lazy'}">`)}
    </div>`;
  });
}

let cached = null;
/** Fills an element with the wall (loads the covers once per visit). */
export async function fillWall(el, rows = 4) {
  try {
    cached ??= (await get('/api/books', { query: { sort: 'popular', pageSize: 24 } })).items;
    if (el?.isConnected) render(el, wallRows(cached, rows));
  } catch { /* decoration only */ }
}
