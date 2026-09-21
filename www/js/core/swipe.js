// Swipe sideways to move between tabs.
//
// The nav bar is four targets at the very bottom of a 852pt screen; a thumb
// already resting on the list should not have to travel there to change tab.
// This binds the gesture the tab order already implies - left for the next
// tab, right for the previous one.
//
// The screen you are moving to travels in under the finger. A gesture that
// only nudged the current screen and then cut to the next one is three
// separate events - a nudge, a cut, an arrival - and reads as three; the point
// of a swipe is that it is one continuous thing you are steering, and that you
// can see where you are going before you commit to it. So the surface follows
// the finger one to one, the neighbour is drawn and dragged in beside it, and
// the release only finishes a move that is already most of the way done.
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
/** How far the surface travels where there is nothing on that side to go to. */
const RUBBER = 0.08;
/** The same, for the shell that has no second pane to show. */
const FOLLOW = 0.3;

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
 * @param {object} [opts.page] the two-pane shell, when there is one: open(dir)
 *   draws the neighbour on that side, track(offset, dir) places both panes
 *   and the chrome above and below them,
 *   cancel() takes the neighbour away again, and release(dir, committed) lands
 *   them and navigates if it committed. Without a pager - or under reduced
 *   motion - the gesture falls back to nudging the surface and calling onSwipe.
 */
export function bindSwipe(node, {
  onSwipe, canSwipe = () => true, enabled = () => true, page = null
}) {
  let tracking = false;   // a pointer is down somewhere a swipe may start
  let axis = '';          // '' until the gesture commits, then 'x' or 'y'
  let pointer = null;
  let startX = 0;
  let startY = 0;
  let startedAt = 0;
  let dx = 0;
  // Which side the shell currently has a neighbour drawn on, 0 for none.
  let opened = 0;
  // A swipe that began on a transaction row must not also open that row.
  let swallowClick = false;

  // Someone who has asked for less movement is not asking to watch the next
  // screen dragged across; they still get the tab change, just not the travel.
  const paging = () => !!page && !reducedMotion();

  const settle = () => {
    node.style.transition = 'transform var(--dur-short) var(--ease-exit)';
    node.style.transform = '';
  };

  node.addEventListener('pointerdown', (e) => {
    swallowClick = false;
    tracking = false;
    axis = '';
    opened = 0;
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
    const dir = dx < 0 ? 1 : -1;
    const reachable = canSwipe(dir);

    if (!paging()) {
      const reach = reachable ? FOLLOW : RUBBER;
      node.style.transform = 'translateX(' + (dx * reach).toFixed(1) + 'px)';
      return;
    }

    // Drawn the first time this side is asked for, and again if the finger
    // changes its mind and crosses back over zero - the neighbour it was
    // showing is parked on what has become the wrong edge.
    if (reachable && opened !== dir) {
      opened = dir;
      page.open(dir);
    } else if (!reachable && opened) {
      opened = 0;
      page.cancel();
    }

    // One to one where there is somewhere to go; damped hard where there is
    // not, so the end of the bar resists rather than opening onto nothing.
    page.track(reachable ? dx : dx * RUBBER, reachable ? dir : 0);
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
    const committed = (travel > COMMIT || speed > VELOCITY) && canSwipe(dir);

    if (paging()) {
      // The panes are already most of the way across; the shell carries them
      // the rest of the way and navigates when they land. A commit is only
      // real if the neighbour it would land on is the one actually drawn.
      const side = opened;
      opened = 0;
      page.release(side || dir, committed && side === dir);
      return;
    }

    if (committed) {
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
    const side = opened;
    const wasX = axis === 'x';
    tracking = false;
    axis = '';
    opened = 0;
    if (paging() && wasX) { page.release(side || 1, false); return; }
    settle();
  });

  node.addEventListener('click', (e) => {
    if (!swallowClick) return;
    swallowClick = false;
    e.stopPropagation();
    e.preventDefault();
  }, true);
}
