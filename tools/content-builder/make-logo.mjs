// Generates the logo marks as pure SVG paths (no font needed in the browser):
//   mark.svg / favicon.svg — the round cinnabar seal with the Georgian letter "ა"
//   seal.svg               — the same seal with an inner ring, used in the middle of the header pill
import { openSync } from 'fontkit';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FONTS, ROOT } from './lib/paths.mjs';

const CINNABAR = '#c42d1c';
const CREAM = '#fcefe4';

const font = openSync(join(FONTS, 'NotoSerifGeorgian-Bold.ttf'));
const glyph = font.layout('ა').glyphs[0];
const bb = glyph.bbox; // font units

/** The letter as a path, scaled to `height` and centred in a `size` × `size` box. */
function letterPath(size, height, dy = 0) {
  const scale = height / (bb.maxY - bb.minY);
  const w = (bb.maxX - bb.minX) * scale;
  const ox = (size - w) / 2 - bb.minX * scale;
  const oy = (size - height) / 2 + bb.maxY * scale + dy;
  return glyph.path.commands.map((c) => {
    const pts = [];
    for (let i = 0; i < c.args.length; i += 2) pts.push(`${(ox + c.args[i] * scale).toFixed(2)} ${(oy - c.args[i + 1] * scale).toFixed(2)}`);
    return ({ moveTo: 'M', lineTo: 'L', quadraticCurveTo: 'Q', bezierCurveTo: 'C', closePath: 'Z' })[c.command] + pts.join(' ');
  }).join('');
}

const mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="${CINNABAR}"/><path fill="${CREAM}" d="${letterPath(64, 36, 1)}"/></svg>\n`;
const seal = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">`
  + `<circle cx="48" cy="48" r="48" fill="${CINNABAR}"/>`
  + `<circle cx="48" cy="48" r="41" fill="none" stroke="${CREAM}" stroke-opacity=".55" stroke-width="1.2"/>`
  + `<circle cx="48" cy="48" r="37.5" fill="none" stroke="${CREAM}" stroke-opacity=".3" stroke-width=".8" stroke-dasharray="1.5 3"/>`
  + `<path fill="${CREAM}" d="${letterPath(96, 46, 1.5)}"/></svg>\n`;

const web = join(ROOT, '..', '..', 'web', 'assets');
writeFileSync(join(web, 'favicon.svg'), mark);
writeFileSync(join(web, 'mark.svg'), mark);
writeFileSync(join(web, 'seal.svg'), seal);
console.log('mark.svg, favicon.svg, seal.svg written');
