// Date picker: a centered modal dialog with a month grid.
//
// Opens as a popup over everything. Tapping a day fires the callback and
// auto-closes. Tapping the month-year label switches to a 4×3 month grid
// with year navigation; picking a month returns to the day grid.

import { el } from '../core/dom.js';
import { pushIn } from '../core/motion.js';
import { TAP } from './styles.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const pad2 = (n) => String(n).padStart(2, '0');

export const isoDate = (y, m, d) => y + '-' + pad2(m + 1) + '-' + pad2(d);
export const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();

function parts(value) {
  const [y, m, d] = String(value).split('-').map(Number);
  return { y, m: m - 1, d };
}

export function dateLabel(value) {
  const { y, m, d } = parts(value);
  return d + ' ' + MONTHS[m] + ' ' + y;
}

function leadingBlanks(y, m) {
  return (new Date(y, m, 1).getDay() + 6) % 7;
}

const CELL = 'h-8 grid place-items-center rounded-chip font-ui font-semibold '
  + 'text-[13px] normal-nums cursor-pointer transition-colors duration-[180ms] ease-move';

const MONTH_CELL = 'h-10 grid place-items-center rounded-chip font-ui font-semibold '
  + 'text-[13px] normal-nums cursor-pointer transition-colors duration-[180ms] ease-move';

const NAV_BTN = 'flex-none w-8 h-8 rounded-full bg-soft text-ink grid place-items-center '
  + 'cursor-pointer';

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

/**
 * Opens a date picker as a centered modal dialog.
 * Selecting a day fires `onPick(iso)` and auto-closes.
 * Tapping the backdrop also closes (without picking).
 */
export function openDatePicker(value, today, onPick) {
  const selected = parts(value);
  let view = { y: selected.y, m: selected.m };
  let mode = 'days'; // 'days' or 'months'

  const head = el('div', { class: 'flex items-center justify-between mb-2' });
  const body = el('div', {});

  const card = el('div', {
    class: 'bg-surface rounded-card p-5 w-[310px] max-w-[90vw] shadow-[var(--sh-sheet)]',
    dataset: { testid: 'datepicker' },
    onClick: (e) => e.stopPropagation()
  }, [head, body]);

  const backdrop = el('div', {
    class: 'absolute inset-0 z-50 flex items-center justify-center',
    style: { background: 'rgba(0,0,0,.35)' },
    onClick: close
  }, [card]);

  const app = document.getElementById('app');
  app.appendChild(backdrop);

  function close() {
    backdrop.remove();
  }

  const step = (by) => {
    if (mode === 'months') {
      view = { y: view.y + by, m: view.m };
    } else {
      const next = view.m + by;
      view = { y: view.y + Math.floor(next / 12), m: ((next % 12) + 12) % 12 };
    }
    draw(by);
  };

  function drawHead() {
    const label = mode === 'months'
      ? String(view.y)
      : MONTHS_LONG[view.m] + ' ' + view.y;

    head.replaceChildren(
      el('div', {
        class: NAV_BTN,
        dataset: { testid: 'cal-prev' },
        onClick: () => step(-1)
      }, [chevron(true)]),
      el('div', {
        class: 'font-ui font-bold text-[13px] text-ink normal-nums cursor-pointer '
          + 'py-1 px-2 rounded-pill hover:bg-soft ' + TAP,
        dataset: { testid: 'cal-month' },
        text: label,
        onClick: () => {
          mode = mode === 'days' ? 'months' : 'days';
          draw(0);
        }
      }),
      el('div', {
        class: NAV_BTN,
        dataset: { testid: 'cal-next' },
        onClick: () => step(1)
      }, [chevron(false)])
    );
  }

  function drawMonthGrid() {
    const cells = MONTHS.map((name, i) => {
      const isCurrent = view.y === selected.y && i === selected.m;
      return el('div', {
        class: MONTH_CELL
          + (isCurrent ? ' bg-accent text-accent-ink' : ' text-ink hover:bg-soft'),
        text: name,
        onClick: () => {
          view.m = i;
          mode = 'days';
          draw(0);
        }
      });
    });

    const grid = el('div', { class: 'grid grid-cols-4 gap-1' }, cells);
    body.replaceChildren(grid);
  }

  function drawDayGrid(direction) {
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
          + (isToday && !isSelected ? ' shadow-[inset_0_0_0_1.5px_var(--ink)]' : ''),
        dataset: { testid: 'cal-day', day: String(d), on: isSelected ? '1' : '0' },
        text: String(d),
        onClick: () => {
          const picked = isoDate(view.y, view.m, d);
          onPick(picked);
          close();
        }
      }));
    }

    const grid = el('div', { class: 'grid grid-cols-7 gap-1' }, cells);
    body.replaceChildren(grid);
    if (direction) pushIn(grid, direction);
  }

  function draw(direction) {
    drawHead();
    if (mode === 'months') drawMonthGrid();
    else drawDayGrid(direction);
  }

  draw(0);
}
