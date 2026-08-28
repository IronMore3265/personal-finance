// Brand marks for the payment providers the app knows about.
//
// Each file in assets/brands is a 64x64 square: a full-bleed background in the
// provider's own colour with the signature mark - no wordmark text where the
// brand has a separate symbol - knocked out in white. Mastercard is the one
// exception: its symbol *is* its colour, so it keeps the red/orange discs and
// sits on the black backing its brand guidelines use.
//
// The mark is an <img> rather than inline SVG on purpose: these are flat brand
// artwork, not stroke icons, so they must NOT inherit `currentColor` or flip
// with the theme the way ui/icons.js glyphs do.

const BRANDS = {
  bkash:      { label: 'bKash',            bg: '#df146e' },
  nagad:      { label: 'Nagad',            bg: '#eb2329' },
  rocket:     { label: 'Rocket',           bg: '#8b3392' },
  visa:       { label: 'Visa',             bg: '#1a1f71' },
  mastercard: { label: 'Mastercard',       bg: '#231f20' },
  amex:       { label: 'American Express', bg: '#016fd0' }
};

// Matched against the account name, so an account the user types in themselves
// ("bKash personal", "My Visa card") picks up its logo too. Order matters only
// in that every pattern is distinct; first hit wins.
const PATTERNS = [
  [/b\s*-?\s*kash/i,            'bkash'],
  [/nagad|নগদ/i,                'nagad'],
  [/rocket|dbbl/i,              'rocket'],
  [/master\s*-?\s*card/i,       'mastercard'],
  [/amex|american\s*express/i,  'amex'],
  [/visa/i,                     'visa']
];

/** Brand key for an account name, or null when it has no logo. */
export function brandKey(name) {
  if (!name) return null;
  for (const [re, key] of PATTERNS) if (re.test(name)) return key;
  return null;
}

export function brandMeta(key) { return BRANDS[key] || null; }

export const BRAND_KEYS = Object.keys(BRANDS);

/**
 * The 36px rounded-square chip, same footprint as glyphChip, carrying the
 * provider's logo instead of a letter.
 */
export function brandChip(key, size = 36) {
  const meta = BRANDS[key];
  const node = document.createElement('div');
  node.className = 'chipglyph chipglyph--brand';
  node.style.width = node.style.height = size + 'px';

  const img = document.createElement('img');
  img.className = 'chipglyph__mark';
  img.src = 'assets/brands/' + key + '.svg';
  img.alt = meta ? meta.label : key;
  // Decorative next to a visible account name; the name carries the meaning.
  img.setAttribute('aria-hidden', 'true');
  node.appendChild(img);
  return node;
}
