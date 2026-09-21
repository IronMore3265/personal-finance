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
  if (reducedMotion()) return;
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
  if (reducedMotion()) return;
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

/** How long the arriving filter takes to land, at the pace a screen does. */
const SLIDE_LAND = 280;

/**
 * Pattern B again, at the size of a list rather than a screen.
 *
 * Crossing the Activity filters moves the way crossing a tab does: the list you
 * asked for comes in from the side and the one you left goes out after it.
 *
 * It goes straight there. An earlier version slid through every chip in
 * between, one 130ms step each, so that how far along the strip you had jumped
 * was something you watched rather than worked out - but a jump of three took
 * over half a second to show you a list you had already asked for, and in the
 * hand that reads as lag rather than as information. The direction still says
 * which way you went; the distance is not worth the wait.
 *
 * The pane is built whole before it moves. The first version patched the rows
 * in place instead, and a patch is a redraw: you could watch the list being
 * rewritten under you a row at a time, which is precisely the thing a slide is
 * there to replace.
 *
 * @param {HTMLElement} view  the frame the panes move inside; it keeps its box
 * @param {HTMLElement} next  the ready-built pane arriving
 * @param {number} direction  which way along the strip the tap went
 */
export function slideThrough(view, next, direction) {
  if (!next) return;

  if (reducedMotion()) {
    view.replaceChildren(next);
    return;
  }

  // A tap part way through an earlier slide takes over from it: its timers are
  // dropped, and whatever pane it had reached is the one this slide leaves.
  clearTimeout(view.__slide);
  const held = view.firstElementChild;
  if (!held) { view.replaceChildren(next); return; }
  view.replaceChildren(held);

  view.classList.add('slide-view');
  view.style.height = view.offsetHeight + 'px';

  const park = (n, at) => {
    n.style.position = 'absolute';
    n.style.top = '0';
    n.style.left = '0';
    n.style.width = '100%';
    n.style.transition = 'none';
    n.style.transform = 'translateX(' + at + ')';
  };

  const unpark = (n) => {
    for (const k of ['position', 'top', 'left', 'width', 'transition', 'transform']) {
      n.style.removeProperty(k);
    }
  };

  park(held, '0%');

  // Parked a full width out on the side it comes from, and measured there:
  // absolute at full width, so the height it reports is the height it will take
  // up once it has arrived.
  view.appendChild(next);
  park(next, direction > 0 ? '100%' : '-100%');
  const rise = next.offsetHeight;

  void view.offsetWidth; // both panes settled where they start
  const glide = 'transform ' + SLIDE_LAND + 'ms var(--ease-enter)';
  held.style.transition = glide;
  held.style.transform = 'translateX(' + (direction > 0 ? '-100%' : '100%') + ')';
  next.style.transition = glide;
  next.style.transform = 'translateX(0)';
  // The frame follows the pane arriving in it rather than snapping at the end,
  // so a short filter and a long one hand over without the page jumping.
  view.style.transition = 'height ' + SLIDE_LAND + 'ms var(--ease-enter)';
  view.style.height = rise + 'px';

  view.__slide = setTimeout(() => {
    held.remove();

    // Back into the flow: the list is a plain block again, and the frame stops
    // holding a height that would go stale the moment anything else - a
    // keystroke in the search box, a transaction saved - changes the list.
    unpark(next);
    view.classList.remove('slide-view');
    view.style.removeProperty('height');
    view.style.removeProperty('transition');
  }, SLIDE_LAND);
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
