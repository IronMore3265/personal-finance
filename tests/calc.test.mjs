// Unit tests for the keypad evaluator. Pure module, no DOM, so this runs
// straight in node:  node --test tests/
//
// The keypad is the one place in the app where a wrong answer is silent - it
// just saves the wrong number - so the arithmetic is pinned down here rather
// than only through the UI.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as c from '../www/js/core/calc.js';

/** Drive the module exactly the way the store's pressKey does. */
function type(keys) {
  let s = c.clear();
  for (const k of keys) {
    if (k === 'del') s = c.pressDelete(s.expr, s.buf);
    else if (k === '=') s = c.pressEquals(s.expr, s.buf);
    else if (c.OPS.includes(k)) s = c.pressOp(s.expr, s.buf, k);
    else s = c.pressDigit(s.expr, s.buf, k);
  }
  return s;
}

const keys = (str) => str.split(' ').filter(Boolean);
const val = (str) => { const s = type(keys(str)); return c.fold(s.expr, s.buf); };

test('multiplication binds tighter than addition', () => {
  assert.equal(val('2 4 0 × 2 + 8 0 0'), 1280);
  assert.equal(val('8 0 0 + 2 4 0 × 2'), 1280);
});

test('the four operators', () => {
  assert.equal(val('1 2 + 3'), 15);
  assert.equal(val('1 0 − 3'), 7);
  assert.equal(val('9 ÷ 3'), 3);
  assert.equal(val('6 × 7'), 42);
});

test('division by zero yields null rather than NaN', () => {
  assert.equal(val('9 ÷ 0'), null);
});

test('a trailing operator is ignored, so a half-typed sum still saves', () => {
  assert.equal(val('1 2 0 0 +'), 1200);
  assert.equal(val('1 2 0 0 + 3 ×'), 1203);
});

test('decimals, without floating point tails leaking into the amount', () => {
  assert.equal(val('1 . 5 + 2 . 2 5'), 3.75);
  assert.equal(c.trim(val('0 . 1 + 0 . 2')), '0.3');
  assert.equal(type(keys('1 . 2 . 3')).buf, '1.23', 'only one decimal point');
});

test('an operator pressed twice swaps rather than stacks', () => {
  assert.deepEqual(type(keys('5 + ×')).expr, [5, '×']);
  assert.equal(val('5 + × 2'), 10);
});

test('an expression cannot start with an operator', () => {
  assert.equal(type(keys('+ 5')).buf, '5');
  assert.deepEqual(type(keys('+ 5')).expr, []);
});

test('delete steps back one keypress at a time', () => {
  assert.equal(type(keys('1 2 3 del')).buf, '12');
  assert.deepEqual(type(keys('5 + 6 × del')), { expr: [5, '+'], buf: '6' });
  assert.deepEqual(type(keys('5 + 6 del del del del')), { expr: [], buf: '' });
  assert.deepEqual(type(keys('del del')), { expr: [], buf: '' }, 'safe when empty');
});

test('deleting an operator does not swallow the next digit typed', () => {
  // Regression: popping the operator used to leave expr ending in a number,
  // and evaluate() then read [12, 3] as a truncated expression worth 12.
  assert.deepEqual(type(keys('1 2 + del')), { expr: [], buf: '12' });
  assert.equal(val('1 2 + del 3'), 123);
});

test('equals folds the expression and lets you keep going', () => {
  assert.deepEqual(type(keys('2 4 0 × 2 =')), { expr: [], buf: '480' });
  assert.equal(val('2 4 0 × 2 = + 2 0'), 500);
});

test('the 9 digit cap the digits-only keypad always had still holds', () => {
  assert.equal(type(keys('1 2 3 4 5 6 7 8 9 0')).buf, '123456789');
});

test('the expression line stays empty until there is a sum to show', () => {
  const a = type(keys('1 2 0 0'));
  assert.equal(c.exprText(a.expr, a.buf), '');

  const b = type(keys('1 2 0 0 + 2 4 0 × 2'));
  assert.equal(c.exprText(b.expr, b.buf), '1,200 + 240 × 2');
  assert.equal(c.displayText(b.expr, b.buf, 0), '1,680');
});

test('the amount holds its last good value through a division by zero', () => {
  const s = type(keys('9 ÷ 0'));
  assert.equal(c.displayText(s.expr, s.buf, 1680), '1,680');
});
