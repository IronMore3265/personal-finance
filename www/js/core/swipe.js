// Swipe sideways to move between tabs.
//
// The nav bar is four targets at the very bottom of a 852pt screen; a thumb
// already resting on the list should not have to travel there to change tab.
// This binds the gesture the tab order already implies - left for the next
// tab, right for the previous one - and the same gesture walks the sub-tabs
// of a screen that has them before it leaves that screen at all.
//
// Bound once, at boot, on the scroll region. That node outlives every render,
// so unlike the sheet drag there is nothing to rebind and nothing to tear down.

import { reducedMotion } from './motion.js';

/** Past this far, or this fast, the release commits rather than springs back. */
const COMMIT = 56;
const VELOCITY = 0.45;      // px per ms
/** Travel under this is a tap that wobbled, not a swipe. */
const SLOP = 12;
/** Sideways has to beat vertical by this much, or the finger is scrolling. */
const AXIS = 1.4;
/** How far the surface travels with the finger: enough to answer, not to drag. */
const FOLLOW = 0.3;
/** The same, where there is nothing on that side to move to. */
const RUBBER = 0.08;

/**
 * Anything that scrolls sideways of its own accord - the filter chips, the
 * Reports range strip - keeps its gesture. Matched on the actual overflow
 * rather than on a class, so a row that happens to fit is still swipeable.
 */
function inSideScroller(target, root) {
  for (let n = target; n && n !== root; n = n.parentElement) {
    if (n.scrollWidth <= n.clientWidth + 1) continue;
    const overflow = getComputedStyle(n).overflowX;
    if (overflow === 'auto' || overflow === 'scroll') return true;
  }
  return false;
}

/** Where a swipe is allowed to start. */
function startsSwipe(target, root) {
  if (!target || !target.closest) return false;
  // A sideways drag in a text field is selecting, not navigating.
  if (target.closest('input, textarea')) return false;
  return !inSideScroller(target, root);
}

/**
 * @param {HTMLElement} node             the surface the finger moves
 * @param {object}      opts
 * @param {(dir: number) => void} opts.onSwipe   called with 1 (next) or -1 (previous)
 * @param {(dir: number) => boolean} [opts.canSwipe] is there anything that way
 * @param {() => boolean} [opts.enabled] false while something else owns the screen
 */
export function bindSwipe(node, { onSwipe, canSwipe = () => true, enabled = () => true }) {
  let tracking = false;   // a pointer is down somewhere a swipe may start
  let axis = '';          // '' until the gesture commits, then 'x' or 'y'
  let pointer = null;
  let startX = 0;
  let startY = 0;
  let startedAt = 0;
  let dx = 0;
  // A swipe that began on a transaction row must not also open that row.
  let swallowClick = false;

  const settle = () => {
    node.style.transition = 'transform var(--dur-short) var(--ease-exit)';
    node.style.transform = '';
  };

  node.addEventListener('pointerdown', (e) => {
    swallowClick = false;
    tracking = false;
    axis = '';
    dx = 0;
    if (e.button || !e.isPrimary) return;
    if (!enabled() || !startsSwipe(e.target, node)) return;
    tracking = true;
    pointer = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    startedAt = performance.now();
  });

  node.addEventListener('pointermove', (e) => {
    if (!tracking || e.pointerId !== pointer) return;
    dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!axis) {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      // Vertical wins ties: the list scrolling is the commoner intent, and a
      // gesture judged vertical is dropped for good rather than re-judged.
      if (Math.abs(dx) <= Math.abs(dy) * AXIS) { tracking = false; return; }
      axis = 'x';
      // Captured only once the gesture has committed, so a tap that drifts a
      // pixel still reaches the control underneath.
      if (node.setPointerCapture && e.pointerId !== undefined) {
        try { node.setPointerCapture(e.pointerId); } catch { /* already gone */ }
      }
      node.style.transition = 'none';
    }

    if (reducedMotion()) return;
    // Damped, and damped much harder at an edge - the surface answers the
    // finger without pretending the next screen is already under it.
    const reach = canSwipe(dx < 0 ? 1 : -1) ? FOLLOW : RUBBER;
    node.style.transform = 'translateX(' + (dx * reach).toFixed(1) + 'px)';
  });

  const finish = () => {
    if (!tracking) return;
    tracking = false;
    if (axis !== 'x') return;
    axis = '';
    swallowClick = true;

    const travel = Math.abs(dx);
    const speed = travel / Math.max(1, performance.now() - startedAt);
    const dir = dx < 0 ? 1 : -1;

    if ((travel > COMMIT || speed > VELOCITY) && canSwipe(dir)) {
      // Cleared without a transition so the push animation starts from a clean
      // node: the offset the finger left behind is dropped, not eased out.
      node.style.transition = '';
      node.style.transform = '';
      onSwipe(dir);
      return;
    }
    settle();
  };

  node.addEventListener('pointerup', finish);
  node.addEventListener('pointercancel', () => {
    if (!tracking) return;
    tracking = false;
    axis = '';
    settle();
  });

  node.addEventListener('click', (e) => {
    if (!swallowClick) return;
    swallowClick = false;
    e.stopPropagation();
    e.preventDefault();
  }, true);
}
