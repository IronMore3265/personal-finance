// Motion, per DESIGN.md section 7.
//
// Rules carried over from the reel:
//   - One hero move per transition; everything else is a fade or small translate.
//   - Nothing bounces. Every arrival decelerates cleanly to rest.
//   - Stagger arrivals, synchronise departures.
//   - Charts always animate their data; bars grow from the baseline.
//   - Every tap is acknowledged with a ripple before anything else moves.
//
// Camera dollies and device slides from the reel are deliberately absent -
// section 7.7 marks those as presentation, not app behaviour.

const reduced = () =>
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Circular ripple expanding from the touch point, ~0.28s. */
export function ripple(event, host) {
  if (reduced()) return;
  const node = host || event.currentTarget;
  if (!node || !node.classList.contains('tappable')) return;

  const r = node.getBoundingClientRect();
  const size = Math.max(r.width, r.height) * 2;
  const x = (event.clientX ?? r.left + r.width / 2) - r.left;
  const y = (event.clientY ?? r.top + r.height / 2) - r.top;

  const dot = document.createElement('span');
  dot.className = 'ripple';
  dot.style.width = dot.style.height = size + 'px';
  dot.style.left = x - size / 2 + 'px';
  dot.style.top = y - size / 2 + 'px';
  node.appendChild(dot);
  dot.addEventListener('animationend', () => dot.remove());
}

/** Wire ripples for every .tappable inside a subtree. */
export function bindRipples(root) {
  root.addEventListener('pointerdown', (e) => {
    const target = e.target.closest && e.target.closest('.tappable');
    if (target && root.contains(target)) ripple(e, target);
  });
}

/**
 * Pattern A - assemble. Children of `host` fade up 12pt with a per-row delay.
 * 40ms matches the measured stagger; capped so long lists do not crawl.
 */
export function stagger(host, step = 40, max = 10) {
  if (reduced()) return;
  host.classList.add('stagger');
  Array.from(host.children).forEach((child, i) => {
    child.style.animationDelay = Math.min(i, max) * step + 'ms';
  });
}

/**
 * Pattern B - push. The whole surface travels in lockstep; only the direction
 * of travel changes with which way you moved through the tab order.
 */
export function pushIn(host, direction) {
  if (reduced()) return;
  host.classList.remove('screen--in-right', 'screen--in-left');
  void host.offsetWidth; // restart the animation
  host.classList.add(direction < 0 ? 'screen--in-left' : 'screen--in-right');
}

/**
 * Charts animate their data. Bars are laid out at zero, then grown on the next
 * frame so the transition actually runs.
 */
export function grow(node, prop, value) {
  if (reduced()) { node.style[prop] = value; return; }
  requestAnimationFrame(() => requestAnimationFrame(() => { node.style[prop] = value; }));
}
