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

const reduced = () =>
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Pattern A - assemble. Children of `host` fade up 12pt with a per-row delay.
 * 40ms matches the measured stagger; capped so long lists do not crawl.
 */
export function stagger(host, step = 40, max = 10) {
  if (reduced()) return;
  host.classList.add('stagger');
  const kids = Array.from(host.children);
  kids.forEach((child, i) => {
    child.style.animationDelay = Math.min(i, max) * step + 'ms';
  });

  // Swept up once the arrival is over.
  //
  // The class and the per-row delays used to be left on the host for good. The
  // rows are patched rather than rebuilt now, and a patch rewrites the style
  // attribute of any row whose content moved - which, with a delay still on it
  // and `.stagger` still on the host, restarted the fade-up. Every filter tap
  // and every keystroke in the search field made the list flicker back in.
  clearTimeout(host.__stagger);
  // The last row starts at max*step and runs for --dur-short (320ms); the rest
  // is slack for a frame that arrived late.
  host.__stagger = setTimeout(() => {
    host.classList.remove('stagger');
    for (const child of host.children) child.style.animationDelay = '';
  }, max * step + 320 + 200);
}

/**
 * Pattern B - push. The whole surface travels in lockstep; only the direction
 * of travel changes with which way you moved through the tab order.
 */
export function pushIn(host, direction) {
  if (reduced()) return;
  host.classList.remove('screen--in-right', 'screen--in-left');
  void host.offsetWidth; // restart the animation
  const cls = direction < 0 ? 'screen--in-left' : 'screen--in-right';
  host.classList.add(cls);
  // Taken off again when it lands, so the class is a record of a move that is
  // happening rather than one that happened. Left on, its `both` fill keeps
  // holding the surface at the end of a travel it already finished, and the
  // next thing to touch the host restarts it.
  clearTimeout(host.__push);
  // --dur-screen is 600ms; the rest is slack for a frame that arrived late.
  host.__push = setTimeout(() => host.classList.remove(cls), 800);
}

/**
 * Pattern B, across grains rather than along one. The date picker's panes hold
 * the same moment at three magnifications, so moving between them is a change
 * of distance, not of place: going up to a coarser grain the arriving pane
 * starts oversized and pulls back, coming down it starts small and settles in.
 * A sideways push would say the months are next to the days, which they are
 * not - they are the same days, further away.
 */
export function zoomIn(host, depth) {
  if (reduced()) return;
  host.classList.remove('pane--wider', 'pane--closer');
  void host.offsetWidth; // restart the animation
  const cls = depth > 0 ? 'pane--wider' : 'pane--closer';
  host.classList.add(cls);
  // Taken off again when it lands, for the same reason pushIn does: a class
  // left on is a move that never finishes, and the next thing to touch the
  // host restarts it.
  clearTimeout(host.__zoom);
  // --dur-short is 320ms; the rest is slack for a frame that arrived late.
  host.__zoom = setTimeout(() => host.classList.remove(cls), 520);
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
