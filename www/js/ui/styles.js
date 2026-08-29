// Shared utility recipes.
//
// The app's markup is el() calls, not JSX, so a repeated Tailwind string has
// nowhere to live except a constant. These are the recipes used by more than
// one module; anything used in a single place is written inline at its call
// site instead.
//
// Two things to know when editing these:
//
//   1. Every recipe that replaces a CSS `font:` shorthand carries
//      `normal-nums`. The shorthand silently reset font-variant-numeric, and
//      body sets `tabular-nums` (app.css) - so without it the inherited
//      tabular figures come back and every number re-flows by a fraction of a
//      pixel. It is not decoration.
//   2. Sizes are arbitrary values (`text-[14.5px]/[1.2]`) rather than
//      Tailwind's scale, because the design's type ramp is half-pixel and
//      predates the utility layer. Rounding them to the nearest `text-sm`
//      would move every screen.

/** A list row: chip, body, right-aligned number, hairline underneath. */
export const ROW = 'flex items-center gap-3 py-[13px] border-b border-line';

/** ROW plus the press affordance, for rows that open something. */
export const ROW_TAP = ROW + ' relative overflow-hidden cursor-pointer '
  + 'transition-transform duration-[180ms] ease-move active:scale-[.985]';

export const ROW_BODY = 'flex-1 min-w-0';
export const ROW_TITLE = 'font-ui font-semibold text-[14.5px]/[1.2] text-ink min-w-0 normal-nums';
export const ROW_META = 'font-ui font-medium text-[11px]/[1] text-ink3 mt-1.5 tracking-[.01em] normal-nums';
export const ROW_RIGHT = 'text-right flex-none';
export const ROW_AMT = 'font-ui font-bold text-[14.5px]/[1] text-ink whitespace-nowrap tracking-[-.01em] normal-nums';
export const ROW_SUB = 'font-ui font-medium text-[10.5px]/[1] text-ink3 mt-1.5 whitespace-nowrap normal-nums';

/** Truncate to one line with an ellipsis. */
export const ELLIP = 'whitespace-nowrap overflow-hidden text-ellipsis';

/**
 * The press affordance.
 *
 * PRESS is the feedback alone. TAP adds the containment a ripple needs. They
 * are separate because TAP's `relative` would beat an `absolute` the element
 * sets itself - two utilities for one property resolve by their order in the
 * generated stylesheet, not by their order in the class string - which is
 * exactly how the FAB ended up in the bottom-left corner.
 */
export const PRESS = 'cursor-pointer transition-transform duration-[180ms] '
  + 'ease-move active:scale-[.985]';
export const TAP = 'relative overflow-hidden ' + PRESS;

/** Sideways-scrolling strip of chips. The scrollbar is hidden by .noscrollbar. */
export const CHIPROW = 'flex gap-[7px] mb-[14px] overflow-x-auto pb-0.5 noscrollbar';
/** The same strip where the following block supplies its own spacing. */
export const CHIPROW_FLUSH = 'flex gap-[7px] mb-0 overflow-x-auto pb-0.5 noscrollbar';

/** Uppercase micro-label used above fields and beside section rules. */
export const MICROLABEL = 'font-ui font-bold text-[10px]/[1] tracking-[.16em] uppercase text-ink3 normal-nums';

/* ---------------- sheets ---------------- */

/* The sheet shell. Height is the caller's business - each sheet caps its own. */
export const SHEET = 'absolute left-0 right-0 bottom-0 flex flex-col bg-surface '
  + 'rounded-t-sheet shadow-[var(--sh-sheet)] z-[11]';
export const SHEET_HEAD = 'flex-none pt-[14px] px-[22px] pb-0';
/*
 * `min-h-0` is the whole scroll fix. A flex item defaults to `min-height: auto`
 * and refuses to shrink below its content, so the body never got shorter than
 * what was in it, `overflow-y` never had anything to do, and the sheet grew
 * past its max-height - pushing the keypad and the save button off the bottom
 * of the screen instead of scrolling.
 */
export const SHEET_BODY = 'flex-1 min-h-0 overflow-y-auto overscroll-contain '
  + 'px-[22px] pt-0 pb-2.5';
export const SHEET_FOOT = 'flex-none pt-3 px-[22px] pb-[calc(20px+var(--safe-b))]';
export const SHEET_TITLE = 'font-ui font-extrabold text-[22px]/[1.05] text-ink '
  + 'tracking-[-.03em] normal-nums';
export const SHEET_LEDE = 'font-ui font-normal text-[12px]/[1.5] text-ink2 mt-2 normal-nums';
export const SHEET_ICON = 'flex-none w-9 h-9 rounded-chip bg-accent text-accent-ink '
  + 'flex items-center justify-center';

export const SAVEBTN = 'mt-2.5 text-center p-4 rounded-pill font-ui font-bold '
  + 'text-[12px] tracking-[.14em] uppercase normal-nums';
/** The wide destructive button in a sheet footer. Colour comes from the caller. */
export const DELBTN_WIDE = 'flex items-center justify-center gap-1.5 rounded-pill '
  + 'font-ui font-bold text-[12px] tracking-[.14em] uppercase mt-2 p-[14px] normal-nums';

/** Uppercase micro-label used inside sheets, tighter than MICROLABEL. */
export const MINILABEL = 'font-ui font-semibold text-[10px]/[1] text-ink3 uppercase '
  + 'tracking-[.12em] normal-nums';

/** Full-width tinted input used by the entity and recurring editors. */
export const FIELD = 'w-full bg-soft border-none outline-none rounded-box py-3 px-[13px] '
  + 'font-ui font-medium text-[14px] text-ink normal-nums';

/** One row of a switch list: label and hint on the left, the switch on the right. */
export const SWITCHROW = 'flex items-center gap-[14px] py-[13px] border-t border-line';
export const SWITCHROW_LABEL = 'font-ui font-semibold text-[13px] text-ink normal-nums';
export const SWITCHROW_HINT = 'font-ui font-normal text-[11px]/[1.45] text-ink2 mt-[3px] normal-nums';
