// Small dependency-free SVG charts for the admin dashboard and the library page.
import { html, raw } from '../core/dom.js';
import { escapeHtml } from '../core/dom.js';

/** Bar chart. points: [{ label, value }] */
export function barChart(points, { format = (v) => v, alt = false, height = 190 } = {}) {
  const W = 560;
  const H = height;
  const pad = { l: 34, r: 8, t: 12, b: 26 };
  const max = Math.max(1, ...points.map((p) => p.value));
  const nice = niceMax(max);
  const bw = (W - pad.l - pad.r) / points.length;
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img">`;
  // 4 or 5 grid steps, whichever divides the scale into whole numbers
  const steps = nice % 4 === 0 ? 4 : nice % 5 === 0 ? 5 : 4;
  for (let i = 0; i <= steps; i++) {
    const y = pad.t + ((H - pad.t - pad.b) * i) / steps;
    const v = nice - (nice * i) / steps;
    s += `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y}" y2="${y}"/>`;
    s += `<text x="${pad.l - 6}" y="${y + 3}" text-anchor="end">${escapeHtml(format(Math.round(v)))}</text>`;
  }
  points.forEach((p, i) => {
    const h = ((H - pad.t - pad.b) * p.value) / nice;
    const x = pad.l + i * bw + bw * 0.18;
    const y = H - pad.b - h;
    s += `<rect class="bar ${alt ? 'bar--alt' : ''}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${Math.max(h, p.value ? 2 : 0).toFixed(1)}" rx="3"><title>${escapeHtml(p.label)}: ${escapeHtml(format(p.value))}</title></rect>`;
    if (i % Math.ceil(points.length / 7) === 0) s += `<text x="${(pad.l + i * bw + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${escapeHtml(p.label)}</text>`;
  });
  return raw(s + '</svg>');
}

function niceMax(v) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return v;
}

/** Donut chart. segments: [{ label, value, color }] */
export function donut(segments, { size = 150, center = '' } = {}) {
  const total = segments.reduce((n, s) => n + s.value, 0) || 1;
  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;
  let s = `<svg viewBox="0 0 140 140" width="${size}" height="${size}" role="img"><circle cx="70" cy="70" r="${r}" fill="none" stroke="var(--paper-3)" stroke-width="18"/>`;
  for (const seg of segments) {
    const len = (seg.value / total) * c;
    if (len > 0) s += `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${seg.color}" stroke-width="18" stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 70 70)"><title>${escapeHtml(seg.label)}: ${seg.value}</title></circle>`;
    offset += len;
  }
  s += `<text x="70" y="76" text-anchor="middle" style="font: 600 22px var(--font-display); fill: var(--ink)">${escapeHtml(center)}</text></svg>`;
  return raw(s);
}

export const legend = (segments) => html`<ul class="legend">${segments.map((s) => html`<li><i style="background:${s.color}"></i>${s.label}<b>${s.value}</b></li>`)}</ul>`;

/** GitHub-style activity calendar. days: [{ date, pages }] (oldest first, multiple of 7) */
export function heatmap(days) {
  const max = Math.max(1, ...days.map((d) => d.pages));
  const level = (p) => (p === 0 ? 0 : Math.min(4, Math.ceil((p / max) * 4)));
  return html`<div class="heatmap">${days.map((d) => html`<span data-l="${level(d.pages)}" title="${d.date}: ${d.pages}"></span>`)}</div>`;
}
