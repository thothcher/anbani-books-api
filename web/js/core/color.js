// Reads the background colour of a cover image (for the coloured stage on the book page).
// The cover is drawn into a tiny canvas and the top edge and the left edge are averaged —
// that is where the background is, not the artwork. Covers come from the API with
// CORS headers, so the canvas is not "tainted" and getImageData() is allowed.
const cache = new Map();

export function coverColor(url) {
  if (!url) return Promise.resolve(null);
  if (!cache.has(url)) {
    cache.set(url, new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const w = 20, h = 30;
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0, w, h);
          const d = ctx.getImageData(0, 0, w, h).data;
          let r = 0, g = 0, b = 0, n = 0;
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              if (y > 1 && x > 0) continue; // the top two rows and the left column
              const i = (y * w + x) * 4;
              r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
            }
          }
          resolve(toHex(r / n, g / n, b / n));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    }));
  }
  return cache.get(url);
}

const toHex = (...rgb) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/** Relative luminance (0 = black, 1 = white) — decides light or dark text on that colour. */
export function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Mixes a colour with black (amount < 0) or white (amount > 0). */
export function shade(hex, amount) {
  const target = amount < 0 ? 0 : 255;
  const a = Math.abs(amount);
  return toHex(...[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).map((c) => c + (target - c) * a));
}
