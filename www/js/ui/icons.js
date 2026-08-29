// Stroke icons.
//
// design.md: 16-22px, stroke-width ~1.7, round caps, `currentColor`. Real SVG
// nodes rather than an icon font or emoji, so they inherit the ink colour,
// flip with the theme, and stay crisp at any density.
//
// Note the attribute names: the prototype is React and writes `strokeWidth`,
// which the DOM does not understand. Plain SVG wants `stroke-width`.
//
// Two sources, one renderer. The map below is the app's own chrome - the
// glyphs the shell reaches for by name. Everything a user can *pick* for a
// category or an account comes from the generated Lucide subset, which uses
// the identical [tag, attributes] shape. Chrome names win on a collision.

import { LUCIDE } from './lucide-paths.js';

const NS = 'http://www.w3.org/2000/svg';

const ICONS = {
  wifi: [
    ['path', { d: 'M2 9a15 15 0 0 1 20 0' }],
    ['path', { d: 'M5.5 12.5a10 10 0 0 1 13 0' }],
    ['path', { d: 'M9 16a5 5 0 0 1 6 0' }],
    ['path', { d: 'M12 19.5h.01' }]
  ],
  moon: [['path', { d: 'M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z' }]],
  gear: [
    ['circle', { cx: 12, cy: 12, r: 3.2 }],
    ['path', { d: 'M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z' }]
  ],
  arrowLeft: [
    ['path', { d: 'M19 12H5' }],
    ['path', { d: 'm11 18-6-6 6-6' }]
  ],
  upload: [
    ['path', { d: 'M12 16V4' }],
    ['path', { d: 'm7.5 8.5 4.5-4.5 4.5 4.5' }],
    ['path', { d: 'M4.5 14v4.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V14' }]
  ],
  card: [
    ['rect', { x: 2.5, y: 5.5, width: 19, height: 13, rx: 2.5 }],
    ['path', { d: 'M2.5 10h19' }]
  ],
  pie: [
    ['path', { d: 'M21 12a9 9 0 1 1-9-9v9Z' }],
    ['path', { d: 'M15.5 3.9A9 9 0 0 1 20.1 8.5H15.5Z' }]
  ],
  plusCircle: [
    ['circle', { cx: 12, cy: 12, r: 9 }],
    ['path', { d: 'M12 8.5v7M8.5 12h7' }]
  ],
  bell: [
    ['path', { d: 'M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7Z' }],
    ['path', { d: 'M13.7 20a2 2 0 0 1-3.4 0' }]
  ],
  check: [['path', { d: 'm5 12.5 4.5 4.5L19 7.5' }]],
  checkLong: [['path', { d: 'm5 12 5 5L19 7' }]],
  chevronRight: [['path', { d: 'm9 6 6 6-6 6' }]],
  chevronUp: [['path', { d: 'M6 15l6-6 6 6' }]],
  chevronDown: [['path', { d: 'M6 9l6 6 6-6' }]],
  search: [
    ['circle', { cx: 11, cy: 11, r: 6.5 }],
    ['path', { d: 'm20 20-4.2-4.2' }]
  ],
  message: [['path', { d: 'M20 12.5a7.5 7.5 0 0 1-10.6 6.8L4 20.5l1.3-4.6A7.5 7.5 0 1 1 20 12.5Z' }]],
  transfer: [
    ['path', { d: 'M4 8.5h14M14.5 5 18 8.5 14.5 12' }],
    ['path', { d: 'M20 15.5H6M9.5 12 6 15.5 9.5 19' }]
  ],
  target: [
    ['circle', { cx: 12, cy: 12, r: 8.5 }],
    ['circle', { cx: 12, cy: 12, r: 4.5 }],
    ['circle', { cx: 12, cy: 12, r: 1 }]
  ],
  person: [
    ['circle', { cx: 12, cy: 8.5, r: 3.8 }],
    ['path', { d: 'M4.5 20a7.5 7.5 0 0 1 15 0' }]
  ],
  plus: [['path', { d: 'M12 6v12M6 12h12' }]],
  alert: [
    ['path', { d: 'M12 7v6.5' }],
    ['path', { d: 'M12 17h.01' }]
  ],
  robot: [
    ['path', { d: 'M12 3v3' }],
    ['rect', { x: 4.5, y: 6, width: 15, height: 12, rx: 3 }],
    ['path', { d: 'M9 11h.01M15 11h.01M9 14.5h6' }]
  ],
  coin: [
    ['circle', { cx: 12, cy: 12, r: 8.5 }],
    ['path', { d: 'M12 7.5v9M9.7 9.8h4a1.9 1.9 0 0 1 0 3.8h-4' }]
  ]
};

function svgRoot(size, weight) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', weight);
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  return svg;
}

/** Whether a name will actually draw something. */
export const hasIcon = (name) => !!(name && (ICONS[name] || LUCIDE[name]));

/**
 * @param {string} name  key in ICONS or in the generated Lucide subset
 * @param {number} size  square edge in px
 * @param {{weight?:number, class?:string}} [opts]
 */
export function icon(name, size = 18, opts = {}) {
  const svg = svgRoot(size, opts.weight || 1.7);
  if (opts.class) svg.setAttribute('class', opts.class);
  // An unknown name draws an empty svg rather than throwing: a category whose
  // icon was removed from the set should lose its glyph, not the whole screen.
  for (const [tag, attrs] of ICONS[name] || LUCIDE[name] || []) {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    svg.appendChild(node);
  }
  return svg;
}

/**
 * Account sparkline. Points come from the store as a real balance history, so
 * a flat account draws a flat line rather than invented noise.
 */
export function sparkline(points, color) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', 52);
  svg.setAttribute('height', 20);
  svg.setAttribute('viewBox', '0 0 52 20');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('class', 'flex-none');
  svg.setAttribute('data-testid', 'spark');

  const line = document.createElementNS(NS, 'polyline');
  line.setAttribute('points', points);
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', color);
  line.setAttribute('stroke-width', 1.7);
  line.setAttribute('stroke-linecap', 'round');
  line.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(line);
  return svg;
}
