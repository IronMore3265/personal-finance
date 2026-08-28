// Generates www/js/ui/lucide-paths.js from the lucide-static package.
//
// The app ships www/ as authored - no bundler, no runtime dependency - so the
// icons people can pick from are baked into a single vendored file rather than
// pulled from node_modules at load time. Only the curated list below is
// included: the full pack is 2000 icons and half a megabyte, which is a lot of
// weight for a picker nobody will scroll to the end of.
//
// To change the set, edit GROUPS and re-run:  node scripts/gen-icons.mjs
//
// Output shape matches the hand-written ICONS map in ui/icons.js exactly -
// [tagName, attributes] pairs - so one renderer draws both.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ICON_DIR = join(root, 'node_modules', 'lucide-static', 'icons');
const OUT = join(root, 'www', 'js', 'ui', 'lucide-paths.js');

const GROUPS = [
  ['Food', [
    'utensils', 'utensils-crossed', 'coffee', 'pizza', 'beef', 'cake',
    'apple', 'ice-cream-cone', 'wine', 'beer', 'milk', 'cookie'
  ]],
  ['Transport', [
    'car', 'bus', 'train-front', 'plane', 'bike', 'fuel',
    'ship', 'car-taxi-front', 'circle-parking', 'map-pin', 'footprints', 'truck'
  ]],
  ['Home', [
    'house', 'sofa', 'bed', 'lamp', 'lightbulb', 'droplet',
    'flame', 'wrench', 'hammer', 'key', 'washing-machine', 'trash-2'
  ]],
  ['Bills', [
    'receipt', 'file-text', 'zap', 'phone', 'tv', 'wifi',
    'router', 'calendar', 'clock', 'signal', 'shield', 'umbrella'
  ]],
  ['Shopping', [
    'shopping-bag', 'shopping-cart', 'shopping-basket', 'shirt', 'gift', 'tag',
    'store', 'package', 'watch', 'glasses', 'gem', 'scissors'
  ]],
  ['Health', [
    'heart-pulse', 'pill', 'dumbbell', 'stethoscope', 'syringe', 'cross',
    'brain', 'bandage', 'activity', 'hospital'
  ]],
  ['Fun', [
    'music', 'gamepad-2', 'film', 'ticket', 'camera', 'headphones',
    'palette', 'book-open', 'party-popper', 'tent', 'dices', 'guitar'
  ]],
  ['Money', [
    'wallet', 'landmark', 'credit-card', 'piggy-bank', 'coins', 'banknote',
    'hand-coins', 'receipt-text', 'vault', 'circle-dollar-sign',
    'arrow-left-right', 'trending-up', 'trending-down', 'percent'
  ]],
  ['Work', [
    'briefcase', 'laptop', 'graduation-cap', 'book', 'pen-tool', 'printer',
    'building-2', 'users', 'monitor', 'smartphone', 'globe', 'mail'
  ]],
  ['Other', [
    'star', 'heart', 'sprout', 'leaf', 'paw-print', 'dog',
    'cat', 'baby', 'sun', 'moon-star', 'circle-help', 'ellipsis'
  ]]
];

// Icons the UI itself reaches for by name. They are generated into the same
// file so a picker selection and a hard-coded chrome icon resolve identically.
const EXTRA = [
  'calendar', 'pencil', 'trash-2', 'x', 'check', 'chevron-down', 'chevron-right',
  'chevron-left', 'plus', 'minus', 'search', 'hand-coins', 'arrow-down-left',
  'arrow-up-right', 'repeat', 'bell', 'wallet', 'landmark', 'credit-card',
  'smartphone', 'banknote'
];

/** Pull the drawable children out of a lucide SVG file. */
function parse(name) {
  const file = join(ICON_DIR, name + '.svg');
  if (!existsSync(file)) return null;
  const svg = readFileSync(file, 'utf8');

  const out = [];
  const tag = /<(path|circle|rect|line|polyline|polygon|ellipse)\b([^>]*?)\/?>/g;
  let m;
  while ((m = tag.exec(svg))) {
    const attrs = {};
    const attr = /([a-zA-Z-]+)="([^"]*)"/g;
    let a;
    while ((a = attr.exec(m[2]))) attrs[a[1]] = a[2];
    out.push([m[1], attrs]);
  }
  return out.length ? out : null;
}

const icons = {};
const groups = [];
const missing = [];

for (const [label, names] of GROUPS) {
  const kept = [];
  for (const n of names) {
    const parsed = parse(n);
    if (!parsed) { missing.push(n); continue; }
    icons[n] = parsed;
    kept.push(n);
  }
  groups.push([label, kept]);
}

for (const n of EXTRA) {
  if (icons[n]) continue;
  const parsed = parse(n);
  if (!parsed) { missing.push(n); continue; }
  icons[n] = parsed;
}

if (missing.length) {
  console.error('Not in lucide-static, dropped: ' + missing.join(', '));
}

const body = Object.keys(icons).sort()
  .map(k => '  ' + JSON.stringify(k) + ': ' + JSON.stringify(icons[k]) + ',')
  .join('\n')
  .replace(/,$/, '');

const groupsSrc = groups
  .map(([label, names]) =>
    '  { label: ' + JSON.stringify(label) + ', names: ' + JSON.stringify(names) + ' }')
  .join(',\n');

writeFileSync(OUT, `// Curated Lucide icon set. GENERATED - do not edit by hand.
//
// Run \`node scripts/gen-icons.mjs\` to regenerate from lucide-static; the
// curated list lives in that script. Same [tag, attributes] shape as the
// chrome icons in ui/icons.js, so one renderer draws both.
//
// Lucide, ISC licence. https://lucide.dev

export const LUCIDE = {
${body}
};

/** Picker layout: tabs, in order, over a subset of LUCIDE. */
export const ICON_GROUPS = [
${groupsSrc}
];

export const ICON_NAMES = Object.keys(LUCIDE);
`);

const kb = (readFileSync(OUT, 'utf8').length / 1024).toFixed(1);
console.log('wrote ' + OUT);
console.log(Object.keys(icons).length + ' icons, ' + groups.length + ' groups, ' + kb + ' KB');
