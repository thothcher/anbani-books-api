// Scroll reveals and a gentle parallax.
//   <div data-reveal>…</div>              fades up when it scrolls into view ( --d: 2 delays it)
//   <img data-parallax="0.12">            drifts against the scroll (CSS reads --py)
// Nothing here is required: without JavaScript, or with "reduce motion", everything is simply visible.
let io = null;
const drifting = new Set();
let ticking = false;

function update() {
  ticking = false;
  const vh = window.innerHeight;
  for (const el of drifting) {
    if (!el.isConnected) { drifting.delete(el); continue; }
    const r = el.getBoundingClientRect();
    if (r.bottom < -300 || r.top > vh + 300) continue;
    const speed = parseFloat(el.dataset.parallax) || 0.1;
    el.style.setProperty('--py', `${((r.top + r.height / 2 - vh / 2) * -speed).toFixed(1)}px`);
  }
}
const onScroll = () => {
  if (!ticking) { ticking = true; requestAnimationFrame(update); }
};

function scan(root) {
  if (root.matches?.('[data-reveal]')) io.observe(root);
  root.querySelectorAll?.('[data-reveal]:not(.is-in)').forEach((el) => io.observe(el));
  if (root.matches?.('[data-parallax]')) drifting.add(root);
  root.querySelectorAll?.('[data-parallax]').forEach((el) => drifting.add(el));
}

export function initMotion() {
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
  document.documentElement.classList.add('has-motion');
  new MutationObserver((records) => {
    for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1) scan(n);
    onScroll();
  }).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  scan(document.body);
  onScroll();
}
