// Pull a sheet down to close it.
//
// Until now a sheet could only be dismissed by tapping the scrim or pressing
// Android back, neither of which is what a thumb reaches for. This adds the
// gesture the shape of the thing already implies.
//
// Bound in app.js, on the node it is given. A sheet is only built from scratch
// when a different one opens, and it is that node the listeners go on; they
// die with it when it is dropped, so there is nothing to tear down. The passes
// in between patch the same node, and re-binding it is a no-op.
//
// Two input paths, deliberately:
//
//   Touch  - `touchstart/move/end`. Pointer events looked tidier but do not
//            survive a real finger: as soon as Chrome decides a vertical swipe
//            belongs to a scroller it fires `pointercancel` and the drag dies
//            before it starts. Touch events keep firing through that (they only
//            stop being cancelable), so the sheet can still follow the finger.
//   Mouse  - `pointerdown/move/up`, filtered to non-touch pointers so a phone
//            never runs both paths for one gesture.

/** Past this far, or this fast, the release closes rather than springs back. */
const DISTANCE = 110;
const VELOCITY = 0.6;   // px per ms
/** Movement under this is a tap that wobbled, not a drag. */
const SLOP = 6;

/**
 * Where a drag is allowed to start.
 *
 * The head and the grabber always. The body only when it is already scrolled
 * to the top, so pulling down inside a long sheet scrolls it rather than
 * dragging the whole panel. Never the footer: the keypad and the date panel
 * own their own gestures, and a stray downward swipe there would throw away a
 * half-entered amount.
 */
function startsDrag(target, body) {
  if (!target || !target.closest) return false;
  if (target.closest('[data-testid="sheet-foot"]')) return false;
  if (target.closest('[data-testid="sheet-body"]')) return !body || body.scrollTop <= 0;
  return true;
}

/**
 * Take the vertical swipe away from the browser on the parts of the sheet that
 * are drag handles.
 *
 * `touch-action` is read when the finger lands and cannot be changed from
 * `touchstart`, so it has to be on the element beforehand. It goes on the
 * sheet's children rather than on the sheet itself: the value that applies to
 * a touch is the intersection of the whole ancestor chain, so a `none` on the
 * root would take scrolling away from the body inside it. The body keeps its
 * own scrolling and is handled by `preventDefault` instead, once the gesture
 * has proved itself a downward pull.
 */
function claimHandles(sheet, body) {
  for (const part of sheet.children) {
    if (part === body) continue;
    if (part.dataset && part.dataset.testid === 'sheet-foot') continue;
    part.style.touchAction = 'none';
  }
}

/**
 * @param {HTMLElement} sheet    the sheet node, already in the document
 * @param {() => void}  onDismiss called once, when the drag closes the sheet
 */
export function bindSheetDrag(sheet, onDismiss) {
  // The body is looked up per gesture, not captured once: the sheet is patched
  // in place rather than rebuilt, and a patch that swapped the body out from
  // under a captured reference would leave the drag testing a detached node.
  const bodyOf = () => sheet.querySelector('[data-testid="sheet-body"]');
  claimHandles(sheet, bodyOf());

  // Binding is idempotent. A patched sheet is the same node it was last pass,
  // so its listeners are still on it and adding a second set would run every
  // handler twice; all it needs is the touch-action the patch cleared off its
  // children. Only a sheet built from scratch gets wired.
  if (sheet.__dragBound) return;
  sheet.__dragBound = true;

  let dragging = false;
  let fromBody = false;
  let startX = 0;
  let startY = 0;
  let startedAt = 0;
  let dy = 0;
  let moved = false;

  const reset = () => {
    sheet.style.transition = '';
    sheet.style.transform = '';
  };

  const abort = () => {
    dragging = false;
    moved = false;
    reset();
  };

  const begin = (target, x, y) => {
    const body = bodyOf();
    if (!startsDrag(target, body)) return false;
    dragging = true;
    fromBody = !!(body && target.closest && target.closest('[data-testid="sheet-body"]'));
    moved = false;
    dy = 0;
    startX = x;
    startY = y;
    startedAt = performance.now();
    // No transition while a finger is on it; the sheet should track exactly.
    sheet.style.transition = 'none';
    return true;
  };

  /**
   * Follow the finger. Returns true once the gesture has committed, which is
   * the caller's cue to stop the browser doing anything else with it.
   *
   * The horizontal test is why this is not just `dy > SLOP`: the add sheet's
   * body holds sideways-scrolling chip rows, and swallowing a swipe across one
   * of those would trade a scroll for a drag that never happens.
   */
  const step = (x, y) => {
    if (!moved) {
      const dx = x - startX;
      const raw = y - startY;
      if (Math.abs(dx) > SLOP && Math.abs(dx) > Math.abs(raw)) { abort(); return false; }
      if (raw <= SLOP) return false;
      moved = true;
    }
    dy = Math.max(0, y - startY);
    sheet.style.transform = 'translateY(' + dy + 'px)';
    return true;
  };

  const finish = () => {
    if (!dragging) return;
    dragging = false;

    const speed = dy / Math.max(1, performance.now() - startedAt);
    if (moved && (dy > DISTANCE || speed > VELOCITY)) {
      sheet.style.transition = 'transform var(--dur-sheet) var(--ease-exit)';
      sheet.style.transform = 'translateY(100%)';
      // The store drops the sheet from the tree; this only covers the travel.
      setTimeout(onDismiss, 180);
      return;
    }
    // Not far enough: settle back where it was.
    sheet.style.transition = 'transform var(--dur-sheet) var(--ease-sheet)';
    sheet.style.transform = '';
  };

  /* ---------------- touch ---------------- */

  sheet.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { abort(); return; }
    begin(e.target, e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });

  sheet.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    // A second finger means a pinch, not a pull.
    if (e.touches.length !== 1) { abort(); return; }
    const t = e.touches[0];
    // Scrolled off the top mid-gesture: the list owns the rest of this swipe.
    const body = bodyOf();
    if (fromBody && !moved && body && body.scrollTop > 0) { abort(); return; }
    if (!step(t.clientX, t.clientY)) return;
    // Committed. Stop the scroll or the overscroll bounce underneath it.
    if (e.cancelable) e.preventDefault();
  }, { passive: false });

  sheet.addEventListener('touchend', finish);
  sheet.addEventListener('touchcancel', abort);

  /* ---------------- mouse ---------------- */

  sheet.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' || e.button) return;
    begin(e.target, e.clientX, e.clientY);
  });

  sheet.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerType === 'touch') return;
    if (!step(e.clientX, e.clientY)) return;
    // Capture only once the gesture has committed, so a tap that drifts a
    // pixel still reaches the control underneath.
    if (sheet.setPointerCapture && e.pointerId !== undefined) {
      try { sheet.setPointerCapture(e.pointerId); } catch { /* already gone */ }
    }
  });

  sheet.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'touch') return;
    finish();
  });

  sheet.addEventListener('pointercancel', (e) => {
    if (e.pointerType === 'touch') return;   // the touch path handles its own
    abort();
  });

  /*
   * A drag that began on a row must not also activate that row on release.
   * Captured so it runs before the row's own handler, and only swallows the
   * one click the gesture produced.
   */
  sheet.addEventListener('click', (e) => {
    if (!moved) return;
    moved = false;
    e.stopPropagation();
    e.preventDefault();
  }, true);
}
