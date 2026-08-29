// The app's own date picker: a month grid you tap.
//
// It replaces two things that disagreed with each other. The add sheet had a
// scroll wheel, which is a good iOS control but a poor answer to "the 3rd" -
// you cannot aim at a date you can see, you have to spin past it. The debt and
// recurring sheets had <input type="date">, which opens the platform's Material
// dialog: a teal card in the middle of a lime-and-ink app, in the OS's shape
// rather than this one's. Now all three open this.
//
// Motion follows the app's own patterns rather than inventing new ones: the
// grid pushes in from the direction of travel with pushIn(), the same helper
// the screens use, so stepping through months reads like stepping through
// tabs.

import { el } from '../core/dom.js';
import { pushIn } from '../core/motion.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
// Monday-first: the week people here plan around, and it keeps the weekend pair
// together at the end where it reads as one block.
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

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

/*
 * A fixed row height, not aspect-square. Square cells at this width come out
 * 49px, which makes six rows plus a header 343px - taller than the panel, so
 * the last week ran off the bottom of the screen.
 */
const CELL = 'h-8 grid place-items-center rounded-chip font-ui font-semibold '
  + 'text-[13px] normal-nums cursor-pointer transition-colors duration-[180ms] ease-move';

const NAV = 'flex-none w-8 h-8 rounded-full bg-soft text-ink grid place-items-center '
  + 'cursor-pointer';

/**
 * A month grid. `onPick` fires with an ISO date every time a day is tapped.
 *
 * @param {string} value    the selected date, 'YYYY-MM-DD'
 * @param {string} today    today's date, for the outline
 * @param {(iso: string) => void} onPick
 */
export function datePicker(value, today, onPick) {
  const selected = parts(value);
  // What the grid is showing, which is not the selection once you page away.
  let view = { y: selected.y, m: selected.m };

  const root = el('div', { dataset: { testid: 'datepicker' } });
  const head = el('div', { class: 'flex items-center justify-between mb-2' });
  const grid = el('div', {});

  const step = (by) => {
    const next = view.m + by;
    view = { y: view.y + Math.floor(next / 12), m: ((next % 12) + 12) % 12 };
    draw(by);
  };

  function drawHead() {
    head.replaceChildren(
      el('div', {
        class: NAV,
        dataset: { testid: 'cal-prev' },
        onClick: () => step(-1)
      }, [chevron(true)]),
      el('div', {
        class: 'font-ui font-bold text-[13px] text-ink normal-nums',
        dataset: { testid: 'cal-month' },
        text: MONTHS_LONG[view.m] + ' ' + view.y
      }),
      el('div', {
        class: NAV,
        dataset: { testid: 'cal-next' },
        onClick: () => step(1)
      }, [chevron(false)])
    );
  }

  function drawGrid(direction) {
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
      const isToday = iso === today;

      cells.push(el('div', {
        class: CELL
          + (isSelected ? ' bg-accent text-accent-ink' : ' text-ink hover:bg-soft')
          // Today is an outline, never a fill: a fill would compete with the
          // selection for the same meaning.
          + (isToday && !isSelected ? ' shadow-[inset_0_0_0_1.5px_var(--ink)]' : ''),
        dataset: { testid: 'cal-day', day: String(d), on: isSelected ? '1' : '0' },
        text: String(d),
        onClick: () => {
          selected.y = view.y;
          selected.m = view.m;
          selected.d = d;
          draw(0);
          onPick(iso);
        }
      }));
    }

    const body = el('div', { class: 'grid grid-cols-7 gap-1' }, cells);
    grid.replaceChildren(body);
    if (direction) pushIn(body, direction);
  }

  function draw(direction) {
    drawHead();
    drawGrid(direction);
  }

  draw(0);
  root.appendChild(head);
  root.appendChild(grid);
  return root;
}

/** A chevron drawn here rather than pulled from the icon set, at nav size. */
function chevron(left) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', 15);
  svg.setAttribute('height', 15);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', left ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', 2.2);
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  return svg;
}
