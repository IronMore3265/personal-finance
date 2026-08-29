// The account and category pickers, shared by the add sheet and the scheduled
// expense editor.
//
// Both were written for the add sheet and read `store.ui.entry*` directly,
// which is why the scheduled editor could not use them and had a flat strip of
// every account and every category instead - nine chips and thirteen chips,
// most of a screen, with no grouping and nothing folded away. The state is
// passed in now, so one control serves both drafts.

import { el } from '../core/dom.js';
import { store } from '../core/store.js';
import { chip, dot, accountChip, categoryChip } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { CHIPROW_FLUSH, TAP } from '../ui/styles.js';

const GROUP_ICON = { cash: 'wallet', bank: 'landmark', mfs: 'smartphone', card: 'credit-card' };

const CATCHIP = 'flex items-center gap-[7px] py-[11px] px-[9px] rounded-[14px] min-w-0';

/**
 * Accounts, grouped by kind.
 *
 * Nine accounts in one strip meant the card ones lived off the right edge.
 * Collapsed, this is one chip per group; tapping a group replaces the row with
 * that group's accounts, and picking one collapses it again - with the chosen
 * account's name and chip left showing on its group, so the selection is
 * readable without expanding anything.
 *
 * @param {object}   o
 * @param {string?}  o.value  selected account id
 * @param {string?}  o.group  expanded group type, null when collapsed
 * @param {(id: string) => void}    o.onPick
 * @param {(type: string?) => void} o.onGroup
 */
export function accountPicker({ value, group, onPick, onGroup }) {
  const groups = store.accountGroups();

  if (group) {
    const open = groups.find(g => g.type === group);
    if (open) {
      return el('div', { class: CHIPROW_FLUSH, dataset: { testid: 'chiprow' } }, [
        chip(
          open.label,
          true,
          () => onGroup(null),
          icon(GROUP_ICON[open.type] || 'wallet', 15)
        ),
        ...open.accounts.map(a => chip(
          a.name,
          value === a.id,
          () => onPick(a.id),
          accountChip(a, 22)
        ))
      ]);
    }
  }

  return el('div', { class: CHIPROW_FLUSH, dataset: { testid: 'chiprow' } },
    groups.map(g => {
      const mine = g.accounts.find(a => a.id === value);
      return chip(
        mine ? mine.name : g.label,
        !!mine,
        () => onGroup(g.type),
        mine ? accountChip(mine, 22) : icon(GROUP_ICON[g.type] || 'wallet', 15)
      );
    })
  );
}

/**
 * The category picker.
 *
 * A dozen-plus chips is most of a screen, and after the choice is made none of
 * them matter any more - so once one is picked the grid folds down to it, with
 * a Change affordance to bring the rest back.
 *
 * @param {object}  o
 * @param {string?} o.value  selected category id
 * @param {boolean} o.open   grid expanded, or folded to the choice
 * @param {string}  o.type   'income' or 'expense'
 * @param {(id: string) => void}     o.onPick
 * @param {(open: boolean) => void}  o.onOpen
 */
export function categoryPicker({ value, open, type, onPick, onOpen }) {
  const wanted = type === 'income' ? 'income' : 'expense';
  const list = store.db.categories.filter(c => c.type === wanted);
  const picked = list.find(c => c.id === value);

  const catChip = (c, onClick) => el('div', {
    class: CATCHIP + ' ' + TAP
      + (value === c.id ? ' bg-accent text-accent-ink' : ' bg-soft text-ink2'),
    dataset: { testid: 'catchip', on: value === c.id ? '1' : '0' },
    onClick
  }, [
    c.icon ? categoryChip(c, 26) : dot(c.color),
    el('div', {
      class: 'font-ui font-medium text-[11px]/[1.2] min-w-0 normal-nums '
        + 'whitespace-nowrap overflow-hidden text-ellipsis',
      text: c.name
    })
  ]);

  if (picked && !open) {
    return el('div', { class: 'grid grid-cols-[1fr_auto] items-center gap-1.5' }, [
      catChip(picked, () => onOpen(true)),
      el('div', {
        class: 'flex items-center gap-[5px] py-[11px] px-[13px] rounded-[14px] '
          + 'text-ink3 font-ui font-semibold text-[11px] normal-nums ' + TAP,
        onClick: () => onOpen(true)
      }, [el('span', { text: 'Change' }), icon('chevron-down', 13, { weight: 2.2 })])
    ]);
  }

  return el('div', { class: 'grid grid-cols-3 gap-1.5' },
    list.map(c => catChip(c, () => onPick(c.id)))
  );
}
