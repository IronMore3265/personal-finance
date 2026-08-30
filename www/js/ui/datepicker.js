// The app's own date picker: a floating dialog you tap through.
//
// It replaces two things that disagreed with each other. The add sheet had a
// scroll wheel, which is a good iOS control but a poor answer to "the 3rd" -
// you cannot aim at a date you can see, you have to spin past it. The debt and
// recurring sheets had <input type="date">, which opens the platform's Material
// dialog: a teal card in the middle of a lime-and-ink app, in the OS's shape
// rather than this one's. Now all three open this.
//
// It floats over the sheet rather than sitting in its footer. A footer panel
// took the sheet's whole bottom third for as long as it was open, so the save
// button and the fields under it were unreachable until you found the Done bar;
// a dialog is dismissed by tapping anywhere beside it, which is the gesture
// people already try first. There is no Done: a date is one tap, and the tap
// that picks it is the tap that finishes.
//
// Three panes, coarsening as you go up: days -> months -> years. The title in
// the head is the way up; picking a cell is the way back down.
//
// Motion follows the app's own patterns rather than inventing new ones. Steps
// along one grain - month to month, year to year - push in from the direction
// of travel with pushIn(), the same helper the screens use. Changes of grain
// zoom with zoomIn(): going up pulls back from a pane that starts oversized,
// coming down settles in from one that starts small, so the two directions
// never read as the same move.

import { el } from '../core/dom.js';
import { pushIn, zoomIn } from '../core/motion.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
// Monday-first: the week people here plan around, and it keeps the weekend pair
// together at the end where it reads as one block.
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** How many years one page of the year grid holds: 3 columns by 4 rows. */
const YEAR_PAGE = 12;

const pad2 = (n) => String(n).padStart(2, '0');

export const isoDate = (y, m, d) => y + '-' + pad2(m + 1) + '-' + pad2(d);

/** Days in a given month, so February stops at 28 or 29. */
export const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();

/** Parse 'YYYY-MM-DD' into the three numbers the grid runs on. */
function parts(value) {
  const [y, m, d] = String(value).split('-').map(Number);
  return { y, m: m - 1, d };
}

/** '28 Aug 2026', for the chip that opens the picker. */
export function dateLabel(value) {
  const { y, m, d } = parts(value);
  return d + ' ' + MONTHS[m] + ' ' + y;
}

/** Monday-first index of the 1st of a month: 0 for Monday, 6 for Sunday. */
function leadingBlanks(y, m) {
  return (new Date(y, m, 1).getDay() + 6) % 7;
}

/** The first year of the page a given year falls on. */
const yearPageOf = (y) => Math.floor(y / YEAR_PAGE) * YEAR_PAGE;

/*
 * A fixed row height, not aspect-square. Square cells at this width come out
 * 49px, which makes six rows plus a header 343px - taller than the card has any
 * business being, so the last week ran off the bottom of it.
 */
const DAY = 'h-9 grid place-items-center rounded-chip font-ui font-semibold '
  + 'text-[13px] normal-nums cursor-pointer transition-colors duration-[180ms] ease-move';

/* Months and years get twelve cells rather than forty-two, so they can be taller. */
const BLOCK = 'h-11 grid place-items-center rounded-pill font-ui font-semibold '
  + 'text-[13px] normal-nums cursor-pointer transition-colors duration-[180ms] ease-move';

const NAV = 'flex-none w-9 h-9 rounded-full bg-soft text-ink grid place-items-center '
  + 'cursor-pointer transition-transform duration-[180ms] ease-move active:scale-[.9]';

/* The floating card, and the layer that dims what is behind it. */
const LAYER = 'absolute inset-0 z-[13] flex items-center justify-center px-6';
const SCRIM = 'absolute inset-0 bg-black/45';
const CARD = 'relative w-full max-w-[322px] bg-surface rounded-sheet '
  + 'shadow-[var(--sh-dialog)] pt-[18px] px-[18px] pb-5 z-[1]';

/**
 * A month grid that can zoom out to months and years.
 *
 * `onPick` fires with an ISO date when a day is tapped, and nothing else fires
 * at all - months and years only move the view.
 *
 * @param {string} value    the selected date, 'YYYY-MM-DD'
 * @param {string} today    today's date, for the outline
 * @param {(iso: string) => void} onPick
 */
export function datePicker(value, today, onPick) {
  const selected = parts(value);
  // What the grid is showing, which is not the selection once you page away.
  const view = { y: selected.y, m: selected.m };
  // Which grain is on show, and which page of years is under the year grid.
  let pane = 'days';
  let yearPage = yearPageOf(view.y);

  const root = el('div', { dataset: { testid: 'datepicker' } });
  const head = el('div', { class: 'flex items-center justify-between gap-2 mb-3' });
  /*
   * A fixed height, and the pane centred in it.
   *
   * The three panes are different sizes - six rows of days against four of
   * months - and so are two months of days, February against a March that
   * starts on a Sunday. Left to size itself the card grew and shrank under the
   * zoom, which read as the dialog flinching rather than as a change of grain.
   * 264px is the tallest case: a day header and six week rows with their gaps.
   */
  const body = el('div', {
    class: 'overflow-hidden min-h-[264px] flex flex-col justify-center'
  });

  /** Step along the grain on show: a month, a year, or a page of years. */
  const step = (by) => {
    if (pane === 'days') {
      const next = view.m + by;
      view.y += Math.floor(next / 12);
      view.m = ((next % 12) + 12) % 12;
    } else if (pane === 'months') {
      view.y += by;
    } else {
      yearPage += by * YEAR_PAGE;
    }
    draw({ push: by });
  };

  /** The title is the way up a grain, and back down from the top one. */
  const climb = () => {
    if (pane === 'days') {
      pane = 'months';
      draw({ zoom: 1 });
    } else if (pane === 'months') {
      yearPage = yearPageOf(view.y);
      pane = 'years';
      draw({ zoom: 1 });
    } else {
      pane = 'months';
      draw({ zoom: -1 });
    }
  };

  function headLabel() {
    if (pane === 'days') return MONTHS_LONG[view.m] + ' ' + view.y;
    if (pane === 'months') return String(view.y);
    return yearPage + ' – ' + (yearPage + YEAR_PAGE - 1);
  }

  function drawHead() {
    head.replaceChildren(
      el('div', {
        class: NAV,
        dataset: { testid: 'cal-prev' },
        onClick: () => step(-1)
      }, [chevron(true)]),
      el('div', {
        class: 'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-pill '
          + 'font-ui font-bold text-[14px] text-ink normal-nums cursor-pointer '
          + 'transition-colors duration-[180ms] ease-move hover:bg-soft',
        dataset: { testid: 'cal-month', pane },
        onClick: climb
      }, [
        el('span', { text: headLabel() }),
        // Points up while there is a coarser grain to climb to, down from the
        // top one - the same glyph saying which way the tap goes.
        caret(pane !== 'years')
      ]),
      el('div', {
        class: NAV,
        dataset: { testid: 'cal-next' },
        onClick: () => step(1)
      }, [chevron(false)])
    );
  }

  /** A cell's colours: the selection is a fill, today an outline, never both. */
  const tone = (isSelected, isToday) =>
    (isSelected ? ' bg-accent text-accent-ink' : ' text-ink hover:bg-soft')
    + (isToday && !isSelected ? ' shadow-[inset_0_0_0_1.5px_var(--ink)]' : '');

  function daysPane() {
    const cells = [];

    for (const d of DOW) {
      cells.push(el('div', {
        class: 'grid place-items-center font-ui font-bold text-[10px] text-ink3 '
          + 'uppercase tracking-[.08em] normal-nums h-6',
        text: d
      }));
    }

    for (let i = 0; i < leadingBlanks(view.y, view.m); i++) {
      cells.push(el('div', {}));
    }

    const max = daysIn(view.y, view.m);
    for (let d = 1; d <= max; d++) {
      const iso = isoDate(view.y, view.m, d);
      const isSelected = iso === isoDate(selected.y, selected.m, selected.d);

      cells.push(el('div', {
        class: DAY + tone(isSelected, iso === today),
        dataset: { testid: 'cal-day', day: String(d), on: isSelected ? '1' : '0' },
        text: String(d),
        // One tap and it is done: the date is written and the caller takes the
        // dialog away. There is nothing left here to confirm.
        onClick: () => onPick(iso)
      }));
    }

    return el('div', { class: 'grid grid-cols-7 gap-1' }, cells);
  }

  function monthsPane() {
    const now = parts(today);
    return el('div', { class: 'grid grid-cols-3 gap-1.5' }, MONTHS.map((name, m) => {
      const isSelected = view.y === selected.y && m === selected.m;
      return el('div', {
        class: BLOCK + tone(isSelected, view.y === now.y && m === now.m),
        dataset: { testid: 'cal-monthcell', month: String(m + 1), on: isSelected ? '1' : '0' },
        text: name,
        onClick: () => { view.m = m; pane = 'days'; draw({ zoom: -1 }); }
      });
    }));
  }

  function yearsPane() {
    const now = parts(today);
    const years = Array.from({ length: YEAR_PAGE }, (_, i) => yearPage + i);
    return el('div', { class: 'grid grid-cols-3 gap-1.5' }, years.map(y => {
      const isSelected = y === selected.y;
      return el('div', {
        class: BLOCK + tone(isSelected, y === now.y),
        dataset: { testid: 'cal-yearcell', year: String(y), on: isSelected ? '1' : '0' },
        text: String(y),
        onClick: () => { view.y = y; pane = 'months'; draw({ zoom: -1 }); }
      });
    }));
  }

  /**
   * Redraw the head and swap the pane in.
   *
   * `push` is a step along the grain already on show; `zoom` is a change of
   * grain, positive going up to a coarser one. At most one of them is ever set
   * - nothing in the picker does both at once.
   */
  function draw({ push = 0, zoom = 0 } = {}) {
    drawHead();
    const next = pane === 'days' ? daysPane()
      : pane === 'months' ? monthsPane()
        : yearsPane();
    next.dataset.pane = pane;
    body.replaceChildren(next);
    if (push) pushIn(next, push);
    else if (zoom) zoomIn(next, zoom);
  }

  draw();
  root.appendChild(head);
  root.appendChild(body);
  return root;
}

/**
 * The picker, floating, over a scrim that dismisses it.
 *
 * `keep` tells the reconciler to leave this subtree alone. The pane on show
 * and the month behind it are state that lives in the live node's closures and
 * nowhere else, so a pass that rebuilt the dialog would page it back to the
 * selected month - and hand the live grid handlers belonging to a copy that is
 * not in the document. It sits on the layer rather than on the picker inside
 * it, so the whole dialog is one thing a render pass steps over. `key` is part
 * of the value, so the dialog in one sheet is never mistaken for another's.
 *
 * @param {object}   spec
 * @param {string}   spec.key      which sheet opened it
 * @param {string}   spec.title    the field being filled in
 * @param {string}   spec.value    the date currently held
 * @param {string}   spec.today
 * @param {(iso: string) => void} spec.onPick
 * @param {() => void} spec.onClose
 */
export function dateDialog({ key, title, value, today, onPick, onClose }) {
  const card = el('div', { class: CARD, dataset: { testid: 'datedialog-card' } }, [
    el('div', {
      class: 'font-ui font-semibold text-[10px] tracking-[.12em] uppercase '
        + 'text-ink3 normal-nums mb-2.5',
      text: title
    }),
    datePicker(value, today, (iso) => { onPick(iso); onClose(); })
  ]);

  return el('div', {
    class: LAYER,
    dataset: { testid: 'datedialog', keep: 'datedialog-' + key }
  }, [
    // Tapping beside the card puts it away. Nothing is lost by that: a day tap
    // has already written itself, and anything else was only a change of view.
    el('div', { class: SCRIM, dataset: { testid: 'date-scrim' }, onClick: onClose }),
    card
  ]);
}

/** A chevron drawn here rather than pulled from the icon set, at nav size. */
function chevron(left) {
  return glyph(left ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6', 15);
}

/** The head's up/down caret, at label size. */
function caret(up) {
  return glyph(up ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6', 13);
}

function glyph(d, size) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', d);
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', 2.2);
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  return svg;
}
