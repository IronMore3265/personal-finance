// Pull a sheet down to close it.
//
// Until now a sheet could only be dismissed by tapping the scrim or pressing
// Android back, neither of which is what a thumb reaches for. This adds the
// gesture the shape of the thing already implies.
//
// Bound per render, in app.js, on the node it is given - the sheet is rebuilt
// on every store change, so the listeners die with the node they were attached
// to and there is nothing to tear down.

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
 * @param {HTMLElement} sheet    the sheet node, already in the document
 * @param {() => void}  onDismiss called once, when the drag closes the sheet
 */
export function bindSheetDrag(sheet, onDismiss) {
  const body = sheet.querySelector('[data-testid="sheet-body"]');

  let dragging = false;
  let startY = 0;
  let startedAt = 0;
  let dy = 0;
  let moved = false;

  const reset = () => {
    sheet.style.transition = '';
    sheet.style.transform = '';
  };

  sheet.addEventListener('pointerdown', (e) => {
    if (e.button) return;
    if (!startsDrag(e.target, body)) return;
    dragging = true;
    moved = false;
    dy = 0;
    startY = e.clientY;
    startedAt = performance.now();
    // No transition while a finger is on it; the sheet should track exactly.
    sheet.style.transition = 'none';
  });

  sheet.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    dy = Math.max(0, e.clientY - startY);
    if (dy > SLOP) {
      moved = true;
      // Capture only once the gesture has committed, so a tap that drifts a
      // pixel still reaches the control underneath.
      if (sheet.setPointerCapture && e.pointerId !== undefined) {
        try { sheet.setPointerCapture(e.pointerId); } catch { /* already gone */ }
      }
      sheet.style.transform = 'translateY(' + dy + 'px)';
    }
  });

  const finish = () => {
    if (!dragging) return;
    dragging = false;

    const speed = dy / Math.max(1, performance.now() - startedAt);
    if (dy > DISTANCE || speed > VELOCITY) {
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

  sheet.addEventListener('pointerup', finish);
  sheet.addEventListener('pointercancel', () => { dragging = false; reset(); });

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
