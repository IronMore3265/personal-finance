// Swatches offered by the colour picker.
//
// These are the same family as the seeded category colours - oklch, lightness
// around 0.6, chroma around 0.14 - so a colour a user picks sits beside the
// built-in ones without looking like it came from a different app. Even
// lightness also means the white dot on top stays legible on every one.
//
// Three colours are deliberately absent, per docs/design-v4.md:
//   --accent (lime)  is an affordance. It means "tap this", never "this is
//                    groceries" - a lime category would read as a button.
//   --pos / --danger are direction. Green is money in and red is money out
//                    everywhere in the app; a green category would fight that.
//
// Stored as plain CSS colour strings, exactly like seed.js, so they go
// straight into a style attribute with no conversion step.

export const SWATCHES = [
  'oklch(0.68 0.15 95)',    // amber
  'oklch(0.70 0.16 65)',    // orange
  'oklch(0.60 0.17 30)',    // vermilion
  'oklch(0.62 0.15 10)',    // rose
  'oklch(0.62 0.15 340)',   // magenta
  'oklch(0.55 0.14 300)',   // violet
  'oklch(0.58 0.15 275)',   // indigo
  'oklch(0.60 0.13 250)',   // blue
  'oklch(0.62 0.13 220)',   // azure
  'oklch(0.65 0.13 195)',   // cyan
  'oklch(0.64 0.12 175)',   // teal
  'oklch(0.64 0.14 145)',   // emerald
  'oklch(0.66 0.13 125)',   // moss
  'oklch(0.63 0.09 110)',   // olive
  'oklch(0.55 0.05 260)',   // slate
  'oklch(0.62 0.02 260)'    // grey
];

export const DEFAULT_COLOR = SWATCHES[0];

/** Nearest swatch to an arbitrary stored colour, so the picker shows a selection. */
export function nearestSwatch(color) {
  if (!color) return DEFAULT_COLOR;
  return SWATCHES.includes(color) ? color : DEFAULT_COLOR;
}
