// The arithmetic behind the entry keypad.
//
// Bills arrive as sums, not totals - 240 x 2 for the drinks, plus 800 for the
// food - so the keypad accepts an expression and shows its running value. This
// is a hand-written evaluator over a token array rather than `eval` or
// `new Function`: the same rule that keeps `dom.js` building nodes instead of
// parsing HTML strings applies here. Nothing typed into the app is ever
// executed as code.
//
// State is two pieces, kept apart so the caller can render them separately:
//   expr - completed tokens, alternating number, operator, number, ...
//   buf  - the digits being typed right now, as a string ('' when none)

export const MUL = '×';   // ×
export const DIV = '÷';   // ÷
export const SUB = '−';   // − (minus sign, not a hyphen)
export const ADD = '+';

export const OPS = [DIV, MUL, SUB, ADD];

const isOp = (t) => typeof t === 'string';

/** Same guard the digits-only keypad always had: 9 significant digits. */
const tooLong = (buf) => buf.replace('.', '').length > 8;

/**
 * Fold a token list to a number, or null if it cannot be evaluated.
 *
 * Two passes rather than one, so multiplication binds tighter than addition:
 * 240 x 2 + 800 is 1280, not 2080. Returning null for a division by zero lets
 * the caller keep showing the last good value instead of painting NaN over the
 * amount the user is part-way through typing.
 */
export function evaluate(tokens) {
  if (!tokens.length) return 0;
  if (isOp(tokens[tokens.length - 1])) tokens = tokens.slice(0, -1);
  if (!tokens.length) return 0;

  const pass = [tokens[0]];
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const rhs = tokens[i + 1];
    if (rhs === undefined) break;
    if (op === MUL) pass[pass.length - 1] *= rhs;
    else if (op === DIV) {
      if (rhs === 0) return null;
      pass[pass.length - 1] /= rhs;
    } else pass.push(op, rhs);
  }

  let total = pass[0];
  for (let i = 1; i < pass.length; i += 2) {
    total = pass[i] === SUB ? total - pass[i + 1] : total + pass[i + 1];
  }
  return Number.isFinite(total) ? total : null;
}

/** The whole expression including whatever is half-typed, as one token list. */
export function tokens(expr, buf) {
  return buf === '' ? expr.slice() : expr.concat(Number(buf));
}

/** Current value of the expression, or null when it cannot be evaluated. */
export function fold(expr, buf) {
  return evaluate(tokens(expr, buf));
}

export function pressDigit(expr, buf, ch) {
  if (ch === '.' && buf.indexOf('.') >= 0) return { expr, buf };
  if (tooLong(buf)) return { expr, buf };
  // A bare "." starts a number, so 0.5 can be typed as ".5" like every other
  // keypad; without this the leading zero is mandatory.
  return { expr, buf: buf + ch };
}

export function pressOp(expr, buf, op) {
  if (buf !== '') return { expr: expr.concat(Number(buf), op), buf: '' };
  if (!expr.length) return { expr, buf };                 // no leading operator
  // Buffer empty means `expr` ends in an operator (see the invariant above),
  // so this is a change of mind: swap it rather than stack two.
  return { expr: expr.slice(0, -1).concat(op), buf: '' };
}

/** Collapse everything to a single value. A trailing operator is dropped. */
export function pressEquals(expr, buf) {
  const value = fold(expr, buf);
  if (value === null) return { expr, buf };
  return { expr: [], buf: value === 0 ? '' : trim(value) };
}

/**
 * One step back. Inside a number that is one digit; at a number's start it is
 * the operator before it.
 *
 * Removing an operator has to pull the number in front of it back into the
 * buffer, or `expr` would be left ending in a number - and the next digit
 * typed would sit beside it with no operator between, which `evaluate` reads
 * as a truncated expression and silently drops.
 */
export function pressDelete(expr, buf) {
  if (buf !== '') return { expr, buf: buf.slice(0, -1) };
  if (!expr.length) return { expr, buf };

  const rest = expr.slice(0, -1);            // drop the trailing operator
  const num = rest[rest.length - 1];         // the number it followed
  return { expr: rest.slice(0, -1), buf: trim(num) };
}

export function clear() {
  return { expr: [], buf: '' };
}

/** A number as the shortest string that reads back as the same value. */
export function trim(n) {
  if (!Number.isFinite(n)) return '0';
  // Guards against 0.1 + 0.2 style tails showing up in the amount field.
  const r = Math.round(n * 1e6) / 1e6;
  return String(r);
}

const group = (n) => {
  const [whole, frac] = trim(n).split('.');
  const withCommas = Number(whole).toLocaleString('en-US');
  return frac === undefined ? withCommas : withCommas + '.' + frac;
};

/**
 * The expression as it is shown above the amount. Empty while a single number
 * is being typed - there is no sum to show yet, and the big number already
 * says everything.
 */
export function exprText(expr, buf) {
  if (!expr.length) return '';
  const parts = expr.map(t => (isOp(t) ? t : group(t)));
  if (buf !== '') parts.push(group(Number(buf)));
  return parts.join(' ');
}

/** What the big amount line reads. */
export function displayText(expr, buf, lastGood) {
  if (!expr.length) return buf === '' ? '0' : buf;
  const v = fold(expr, buf);
  return group(v === null ? lastGood || 0 : v);
}
