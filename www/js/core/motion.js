// Motion, per DESIGN.md section 7.
//
// Rules carried over from the reel:
//   - One hero move per transition; everything else is a fade or small translate.
//   - Nothing bounces. Every arrival decelerates cleanly to rest.
//   - Stagger arrivals, synchronise departures.
//   - Charts always animate their data; bars grow from the baseline.
//   - Every tap is acknowledged, but quietly: a small press-shrink, no ripple.
//     The expanding circle read as a grey blob over ink-coloured rows, so it
//     was removed; `active:scale-[.985]` in the TAP recipe is what is left.
//
// Camera dollies and device slides from the reel are deliberately absent -
// section 7.7 marks those as presentation, not app behaviour.

/**
 * Whether the user has asked for less movement.
 *
 * Exported because the swipe gesture needs the same answer: with reduced
 * motion the surface must not track the finger either, only commit.
 */
export const reducedMotion = () =>
  !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

/**
 * Pattern A - assemble. Children of `host` fade up 12pt with a per-row delay.
 * 40ms matches the measured stagger; capped so long lists do not crawl.
 */
export function stagger(host, step = 40, max = 10) {
  if (reducedMotion()) return;
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
  if (reducedMotion()) return;
  host.classList.remove('screen--in-right', 'screen--in-left');
  void host.offsetWidth; // restart the animation
  host.classList.add(direction < 0 ? 'screen--in-left' : 'screen--in-right');
}

/**
 * Charts animate their data: bars grow from the baseline.
 *
 * The value is published as a custom property, and CSS both rests at it and
 * animates up to it. That keeps the final size a matter of style rather than of
 * JS timing - if the animation never runs (reduced motion, a throttled
 * background tab, a frame that is never produced) the bar is still the right
 * size, instead of stuck at zero.
 */
export function setTarget(node, value) {
  node.style.setProperty('--target', value);
}
