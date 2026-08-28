# DESIGN.md — "Pro Finance" visual + motion specification

A reverse-engineered design specification derived frame-by-frame from
`Finance Management Mobile App Design by Conceptzilla on Dribbble.mp4`
(12.02 s · 60 fps · 1600×1200 · H.264, created 2021-07-19).

Everything below is **measured**, not estimated by eye, unless explicitly marked
*approx*. Where a value is ambiguous the measured raw number is given alongside
the rounded design value.

---

## 1. How this was derived

| Step | Method |
|---|---|
| Frame extraction | ffmpeg, all 721 frames plus 15 fps filmstrips around each transition |
| Screen isolation | Detected the white device body by luminance (`min(RGB) >= 245`); constant at **x 552–1047, y 82–1117** in every settled frame |
| Screen rect | Inner display = **464 × 1004 px**, bezel 16 px on all sides (confirmed against the full-bleed black stock-detail screen: x 568–1031) |
| Canvas mapping | 1004/464 = 2.1638 → 19.5:9. Of the candidate canvases (375×812, 390×844, 414×896, 428×926), **414 × 896** is the only one that resolves every measured value to a round design number. Scale factor **S = 464/414 = 1.1208 video px per pt** |
| Colour | Modal (most-frequent) exact RGB per region rather than averages, to avoid anti-aliasing drift |
| Type | Per-glyph bounding boxes (column segmentation + row extents) → cap height, advance width, line pitch |
| Motion | Per-frame mean absolute difference over the device rect → motion/hold segmentation; then property tracking (device width, element x/y) with a least-squares fit against a library of cubic-bézier curves |

> **Reading the numbers:** all sizes are in **pt on a 414 × 896 canvas** unless
> suffixed `px`, which means raw video pixels. Divide px by 1.1208 to get pt.
> Tolerance is ±1 pt.

---

## 2. Canvas & grid

```
Canvas            414 × 896 pt   (@2x = 828 × 1792)
Page background   #FFFFFF
Safe top          ~44 pt (status bar hidden in the reel; content starts at 47–65 pt)
Safe bottom       ~30 pt below the tab bar
```

### Horizontal insets — there are three, used deliberately

| Inset | Value | Used by |
|---|---|---|
| **Standard gutter** | **24 pt** | screen titles, search, chips, section labels, list rows, chart, nav bar |
| **Card inset** | **20 pt** | the dark Brokerage Account card only — intentionally *wider* than the list beneath it |
| **Hero inset** | **40 pt** | the onboarding screen (headline, CTA) |
| Summary-list inset | 36 pt | the Analytics summary rows and their dividers (a nested, indented block) |
| Full bleed | 0 pt | the Analytics range-selector strip, the Stock-detail chart panel |

### Spacing scale

Every measured vertical gap lands on a **4 pt grid**, dominated by multiples of 8:

```
4 · 8 · 10 · 12 · 16 · 20 · 24 · 28 · 32 · 40 · 46 · 56 · 64
```

---

## 3. Colour

### Core palette

| Token | Hex | Where |
|---|---|---|
| `--bg` | `#FFFFFF` | page background, every screen |
| `--surface-1` | `#F4F4F4` | search field, filter chips, list-row wells |
| `--surface-2` | `#F9F9F9` | Analytics range-selector strip |
| `--border-hairline` | `#EDEDED` | row dividers, tab underline track, card outlines |
| `--ink` | `#000000` | headings, values, primary labels (renders as ~`#080808`) |
| `--ink-muted` | `#B5B5B5` | overline labels, tickers, placeholders, inactive tabs |
| `--panel` | `#080808` | dark cards and the stock-detail chart panel |
| `--panel-raised` | `#202020` | pill buttons *inside* a dark panel |

### Brand & semantic

| Token | Hex | Notes |
|---|---|---|
| `--accent-lime` | `#E6F348` | the single brand colour: logo dot, CTA fill, backing card, Buy button, Bonds series |
| `--accent-lime-bright` | `#EBF854` | Buy button, a touch hotter than the base lime |
| `--positive` | `#8ED100` | `+68.1%`, `+$3,267 · 23.81%` — a vivid yellow-green, **not** the lime |
| `--negative` | `#F86961` | `−3.2%`, Sell button fill, down candles |
| `--candle-up` | `#B8FD28` | up candles on the dark chart |

> The lime and the positive-green are **two different colours** and are never
> substituted for each other. Lime = brand / affordance. Green = data / direction.

### Chart series (Analytics stacked bars, bottom → top)

| Series | Hex |
|---|---|
| Stocks | `#6A960D` |
| Funds | `#96C82D` |
| Bonds | `#E7F449` |
| Currencies | `#E1E2D0` |

A single-hue ramp (olive → green → lime → pale sage), ordered darkest at the
baseline and lightest at the top, so the stack reads as depth rather than as
four competing categories.

### Colour rules observed

- Pure white page, no tinted greys — every surface is white or a ≤4 % grey.
- Dark panels are near-black (`#080808`), never navy or charcoal.
- Colour appears only on the lime accent, numeric deltas, chart data, and brand
  logos. Everything else is black / grey / white.
- Shadows are extremely soft and low-opacity (large blur, ~4–6 % black), used
  only under dark cards to lift them off white.

---

## 4. Typography

### Typeface

A **geometric sans with a single-storey `a`**: circular bowls, monoline strokes,
straight-tailed `y`, straight-legged `R`, slant-cut `t`, single-storey `g` with
an open tail, `M` with a pointed apex reaching the baseline.

- Closest free match: **Poppins** (or Jost / Outfit).
- Closest commercial match: **Google Sans / Product Sans**.
- Weights in use: **Regular (400)**, **Medium (500)**, **SemiBold (600)**, **Bold (700)**.

### Type scale (measured)

| Role | Size | Weight | Case / tracking | Colour | Evidence |
|---|---|---|---|---|---|
| Hero balance | **48 pt** | Bold | — | `--ink` | `$16,988.31`; digit height 35.7 pt, digit advance 27.7 pt |
| Screen title | **40 pt** | Bold | — | `--ink` | `Market`; ascender 29.4 pt |
| Onboarding headline | **32 pt** / 40 pt leading | Medium | — | `--ink` | `Reach your / financial goal`; baseline pitch 40.2 pt |
| Nav bar title | **20 pt** | SemiBold | — | `--ink` | `Account Analytics` |
| Row title | **18 pt** | Medium | — | `--ink` | `Apple Inc`, `Total balance`, `Replenishment` |
| Row value | **18 pt** | SemiBold | — | `--ink` | `$1,882.03`, `$16,988.31` |
| Body / secondary | **14 pt** | Regular | — | `--ink-muted` | `AAPL`, `per year`, `apr 12, 2021` |
| Delta / % | **14 pt** | SemiBold | — | `--positive` / `--negative` | `+11.48% · $591` |
| Chip / tab label | **14 pt** | Medium | — | `--ink` | `Stocks`, `Funds`, `Day` |
| Section overline | **12 pt** | Medium | UPPER, **+6 % tracking** | `--ink-muted` | `TOTAL BALANCE`, `STOCKS`, `COLLECTIONS`, `USER CHOICE`, `PAYMENT HISTORY` |
| Segmented tab | **13 pt** | SemiBold | UPPER, **+4 % tracking** | active `--ink` / inactive `--ink-muted` | `OVERVIEW · INDUSTRIES · CURRENCIES · COUNTRIES · DIVIDENDS` |

### Typographic rules observed

- **Only two type colours per screen**: full black and `#B5B5B5`. There is no
  60 % / 40 % grey ladder.
- Every group is a **two-line pair**: bold value over a muted 14 pt caption
  (`Apple Inc` / `AAPL`, `$1,882.03` / `+68.1%`). This pairing is the atomic unit
  of the whole design.
- Uppercase is reserved exclusively for *labels about content*, never for content.
- Numerals are proportional, not tabular — figures are left-aligned to their
  label and right-aligned as a group.
- Hero numbers are set very large and very tight. The design earns its whitespace
  by having exactly one enormous number per screen.

---

## 5. Component specifications

### 5.1 Dark account card (Portfolio)

```
size          373 × 208 pt      (raw 418 × 233 px)
inset         20 pt each side
radius        24 pt             (measured 25.0)
fill          #080808
padding       28 pt left/right
shadow        y+8, blur 24, #000 @ ~6%
```

Contents, top → bottom:

- `Brokerage Account` — 16 pt Medium, `#B5B5B5`; overflow `···` glyph flushed right
- `$5,738.70` — 26 pt Bold white, with `+11.48% · $591` in 14 pt SemiBold
  `--positive` on the same baseline
- Two pill buttons, **128 × 40 pt**, radius 20 pt (full pill), fill `#202020`,
  **10 pt** apart; each is `(icon 18 pt) + 8 pt + label 15 pt Medium`

**The lime backing card.** A second card sits behind, filled `--accent-lime`,
rotated ~2–3°, peeking **16 pt** above the dark card and inset ~42 pt / 28 pt
left/right. It is the signature device of the design: it turns a flat card into a
physical stack and gives the brand colour a job with zero text on it.

### 5.2 Stock list row (Portfolio)

```
row pitch     72 pt
content       40 pt tall
icon          40 pt circle, #F4F4F4 fill, logo centred at ~22 pt
columns       [icon 40] 16 [name/ticker · flex] [sparkline ~64×20] [value/delta, right]
sparkline     2 pt stroke, --positive or --negative, no fill, no axis
```

Section overlines (`STOCKS`, `FUNDS`) sit **27 pt** above the first row of their
group and **30 pt** below the last row of the previous group.

### 5.3 Search field + filter (Market)

```
field         298 × 48 pt, radius 14 pt, fill #F4F4F4
              [16 pt inset] search glyph 18 pt · 12 pt · placeholder 16 pt #B5B5B5
gap           10 pt
filter button 56 × 48 pt, radius 14 pt, fill #F4F4F4, sliders glyph
```

### 5.4 Filter chips (Market)

```
height        28 pt, radius 14 pt (full pill), fill #F4F4F4
label         14 pt Medium, --ink
padding-x     ~14 pt
gap           12 pt
overflow      horizontal scroll; the last chip is clipped at the right edge — deliberate
```

### 5.5 Collection card (Market)

```
size          366 × 160 pt, radius 32 pt, fill #080808
inset         24 pt
```

Title 18 pt SemiBold white → subtitle 14 pt `#B5B5B5` → `+6.48%` 26 pt Bold
`--positive` with `per year` 14 pt muted beneath. Right side: a stack of five
28 pt avatar circles overlapping by ~40 %, the last showing `+22` on `#5A5A5A`.
A lime sibling card peeks in from the right as a carousel affordance.

### 5.6 Favourite card (Market)

```
size          160 × 140 pt, radius ~18 pt
fill          #FFFFFF, 1 pt border #F0F0F0
gap           16 pt
```

Logo 40 pt top-left → name 16 pt SemiBold → `$132.15` 15 pt with `+1.25%` 14 pt
SemiBold `--positive`. The third card is deliberately half-clipped.

### 5.7 Segmented tabs (Analytics, Stock detail)

```
labels        13 pt SemiBold UPPER, +4% tracking
active        --ink + 2 pt underline, width = label width
inactive      --ink-muted
track         1 pt #EDEDED full-bleed rule beneath
gap           ~20 pt, horizontally scrollable, last item clipped
```

### 5.8 Range selector (Analytics)

```
strip         full-bleed, height 52 pt, fill #F9F9F9
items         1w · 1m · 3m · 6m · 1y · 2y · All — evenly distributed
label         15 pt Medium
selected      pill 56 × 34 pt, radius 12 pt, fill #EDEDED, label Bold --ink
```

The Stock-detail equivalent is the same pattern inverted on black
(`5m · 15m · 30m · 1H · 4H · Day · Week · Month`, selected pill `#2A2A2A`).

### 5.9 Stacked bar chart (Analytics)

```
plot area     ~370 × 229 pt, inset ~22 pt
bar width     7 pt
bar pitch     14 pt   (50% duty cycle)
bar cap       fully rounded (radius = width/2) on EVERY segment
segment gap   ~2 pt — the stack is visibly separated, not welded
legend        4 items, 6 pt dot + 8 pt + 15 pt label, above the plot
```

Rounded caps on every stacked segment (not just the top one) is the chart's whole
personality — it reads as columns of capsules rather than as a bar chart.

### 5.10 Summary rows (Analytics)

```
inset         36 pt
row height    ~34 pt, label left / value right
divider       2 pt #EDEDED, full inset width, between logical groups only
grouping      [Total balance] ─── [Replenishment · Income] ─── [Average income per year]
```

Dividers separate **groups**, not every row — `Replenishment` and `Income` are
visually welded because they are the same idea.

### 5.11 Bottom action bar (Stock detail)

```
Sell          178 × 44 pt, radius ~13 pt, fill #F86961, label 17 pt SemiBold #FFFFFF
Buy           178 × 44 pt, radius ~13 pt, fill #E6F348, label 17 pt SemiBold #000000
gap           10 pt
bottom inset  20 pt
```

Destructive action on the left in white-on-coral, primary on the right in
black-on-lime, at equal weight. This is a trading screen, not a funnel.

### 5.12 Tab bar

```
items         3 (pie/portfolio · swap/trade · person/account)
icon          22 pt, 1.75 pt stroke, outline style
centres       x = 83 · 207 · 331 pt   (124 pt apart — not thirds)
baseline      icons at y 846–866 pt, 30 pt bottom inset
scrim         a white→transparent vertical fade ~40 pt tall above the bar,
              so content scrolls under it
active state  no fill, no pill — the active icon is simply solid black,
              inactive is #B5B5B5
```

### 5.13 Onboarding screen

```
inset         40 pt
logo          "Pro Finance" 18 pt SemiBold, with a 36 pt lime circle sitting
              BEHIND the last letters — a highlighter mark, not a bullet
sparkle       ✦ 32 × 29 pt, top-right, pure black
illustration  a single hand-drawn 2.5 pt black stroke: a loop that dips, crosses
              itself, then sweeps up into an arrowhead. Bleeds off the left edge.
              Occupies y 296–600 pt.
headline      32/40 pt Medium, 2 lines, ragged right
CTA           333 × 58 pt, radius 14 pt, fill --accent-lime
              label 16 pt SemiBold #000 centred, → arrow glyph flush right at 20 pt
bottom gap    59 pt below the CTA
```

---

## 6. Screen anatomy (vertical rhythm, pt from the top of the display)

### Portfolio / Home

```
 88   TOTAL BALANCE          overline
 27   ↓
122   $16,988.31             hero
 21   ↓
178   +$3,267 · 23.81%       delta
 45   ↓
232   lime backing card top
      ↓ (dark card top at 248)
455   dark card bottom
 64   ↓
519   STOCKS
 27   ↓
554   Apple Inc              row 1   ┐
626   Microsoft cor…         row 2   │ 72 pt pitch
698   Dropbox Inc            row 3   ┘
 30   ↓
767   FUNDS
797   Vanguard S&P…          (clipped by the tab-bar scrim)
844   tab bar
```

### Account Analytics

```
 47   ← · Account Analytics · ⤴
 40   ↓
108   OVERVIEW INDUSTRIES CURRENCIES COUNTRIES DIV…
 13   ↓
131   1 pt rule
 37   ↓
168   ● Stocks ● Funds ● Bonds ● Currencies      legend
 29   ↓
206   stacked bar chart (229 tall)
 23   ↓
458   range strip (52 tall, full bleed)
 51   ↓
560   Total balance          $16,988.31
      ─── divider ───
632   Replenishment          $13,721.31
674   Income                 +$3,267 · 23.81%
      ─── divider ───
747   Average income/yr      +10.25%
829   tab bar
```

### Market

```
 65   Market                 40 pt Bold
 38   ↓
134   search + filter        48 tall
 19   ↓
200   filter chips           28 tall
 46   ↓
272   COLLECTIONS
 21   ↓
302   Dividend Strategy card (160 tall)
 46   ↓
461   FAVORITES                                    →
 29   ↓
549   favourite cards (140 tall)
 56   ↓
743   USER CHOICE
 19   ↓
770   Microsoft cor…  $1,402.71   (row well, #F4F4F4)
842   tab bar
```

### Stock detail (Apple Inc)

```
  0   ── black panel, full bleed ──
 18   ← ·  Apple Inc / AAPL  · ★
 63   $132.15  +1.25% · $1.73                🔔     (sub-header, #101010)
100   candlestick chart with two grey envelope curves + a "133.38" tag
490   5m 15m 30m 1H 4H [Day] Week Month
      ── white sheet, ~24 pt top radius, at y ≈ 566 ──
600   ACCOUNT  OVERVIEW  INDICATORS  NEWS
653   14 stoks               $1,850.10 / +68.1%
      PAYMENT HISTORY
715   +2 stoks / apr 12 2021 $133.10 / −0.7%
765   +4 stoks / mar 6 2021  $254.37 / +7.2%
832   [ Sell ] [ Buy ]
```

*(`stoks` is a typo in the original artwork.)*

---

## 7. Motion

### 7.1 Full timeline (12.02 s, 60 fps)

| Time | Δ | Event |
|---|---|---|
| 0.00 – 0.67 | 0.67 s | **Hold** — Onboarding |
| 0.67 – 1.15 | 0.48 s | Onboarding exits: headline and logo fade out, the arrow stroke *un-draws* upward |
| 1.15 – 1.43 | 0.28 s | Hold on white |
| 1.43 – 2.07 | 0.63 s | **Portfolio builds in** (see 7.3) |
| 2.07 – 2.30 | 0.23 s | Hold |
| 2.30 – 3.13 | 0.83 s | **Camera dollies in** to 1.80× (0.77 s) + tap ripple on `analytics` |
| 3.13 – 3.40 | 0.27 s | Hold in close-up |
| 3.40 – 4.22 | 0.82 s | Card and lime backing **rotate and translate away**; screen dissolves to white |
| 4.22 – 4.42 | 0.20 s | Hold |
| 4.42 – 5.12 | 0.70 s | **Camera dollies out** to 1.0× (0.67 s) while Analytics assembles |
| 5.12 – 6.23 | 1.12 s | **Hold** — Analytics |
| 6.23 – 7.58 | 1.35 s | **Horizontal push** → Market (see 7.4) |
| 7.58 – 8.87 | 1.28 s | **Hold** — Market |
| 8.87 – 10.05 | 1.18 s | **Cover from top** → Stock detail (see 7.5) |
| 10.05 – 10.67 | 0.62 s | **Hold** — Stock detail |
| 10.67 – 11.28 | 0.62 s | Whole device slides out left, accelerating |
| 11.28 – 11.40 | 0.12 s | Empty frame |
| 11.40 – 11.98 | 0.58 s | New device slides in from the right; the arrow stroke draws on |

**Rhythm:** transitions run **0.5–0.9 s**, holds run **0.2–1.3 s**. Every screen
gets at least a 0.6 s rest before it is disturbed. Roughly 55 % of the reel is
motion and 45 % is stillness.

### 7.2 Measured easing tokens

| Motion | Duration | Best-fit curve | RMSE |
|---|---|---|---|
| Camera zoom in | 0.77 s | `cubic-bezier(0.4, 0, 0.2, 1)` — ease-in-out | 0.065 |
| Camera zoom out | 0.67 s | `cubic-bezier(0.65, 0, 0.35, 1)` — ease-in-out-cubic | 0.052 |
| Screen push-in (Market) | 0.85 s | `cubic-bezier(0.33, 1, 0.68, 1)` — **ease-out-cubic** | 0.146 |
| Panel expand (Stock) | ~0.60 s | ease-out, near-critically damped (per-frame Δ = 15, 44, 32, 23, 16, 12, 8, 7, 6, 4, 2, 2) | — |
| Device exit | 0.57 s | ease-**in** (accelerating; truncated by the frame edge) | — |

Nothing in the reel overshoots or bounces. Every settle is a clean decelerate.

**Suggested tokens:**

```css
--ease-enter:  cubic-bezier(0.33, 1, 0.68, 1);   /* things arriving      */
--ease-exit:   cubic-bezier(0.65, 0, 1, 1);      /* things leaving       */
--ease-move:   cubic-bezier(0.4, 0, 0.2, 1);     /* things repositioning */

--dur-micro:   180ms;   /* ripple, chip select   */
--dur-short:   320ms;   /* element fade + rise   */
--dur-screen:  600ms;   /* screen transitions    */
--dur-hero:    850ms;   /* the one showpiece move per screen */
```

### 7.3 Pattern A — *Assemble* (Onboarding → Portfolio)

The incoming screen is not one object; it is built from parts.

1. **t+0** — `$16,988.31` fades in at ~35 % opacity in grey and resolves to black
   over ~0.25 s. It does not move.
2. **t+0.05** — the dark card enters from **off-screen top-right**, rotated
   roughly −30°, and travels down-left to its resting position while rotating to
   0°. Ease-out, ~0.45 s, no overshoot.
3. **t+0.12** — the lime backing card follows the same path ~3 frames behind,
   settling 16 pt above and slightly rotated. That lag is what sells the stack as
   two physical objects.
4. **t+0.20 onward** — list rows fade up with a **~40 ms per-row stagger**, top
   to bottom, each translating ~12 pt upward.
5. Tab-bar icons resolve last.

### 7.4 Pattern B — *Push* (Analytics → Market)

A conventional horizontal navigation push, executed strictly:

- Outgoing screen translates left and fades over **0.57 s** (6.23 → 6.80).
- Incoming screen enters from the right edge over **0.85 s**, `ease-out-cubic`,
  travelling the full 414 pt.
- Title and content move in **lockstep** — this is a whole-surface push, not a
  per-element stagger. Only the collection card lags, by ~2 frames.
- No dimming scrim, no parallax between layers.

### 7.5 Pattern C — *Cover* (Market → Stock detail)

1. Tap ripple on the Apple Inc favourite card: a ~48 pt grey circle expanding
   from the touch point and fading, ~0.25 s.
2. The Market screen **fades to white while sliding down ~30 pt and scaling to
   ~0.97** — it recedes rather than exits.
3. The black chart panel **descends from the top edge and expands downward** to
   566 pt, ease-out, ~0.60 s.
4. The white sheet resolves beneath it with a ~24 pt top radius.
5. Candlesticks draw in **left → right**, then the account rows fade in
   staggered, then Sell / Buy.

### 7.6 Pattern D — *Dismiss with physics* (Portfolio card → Analytics)

The most distinctive move in the reel, and the reason the design feels tactile:

1. **Tap ripple** on the `analytics` pill — a white ring expanding from ~14 pt to
   ~48 pt and fading to 0 over ~0.28 s.
2. **Camera dollies in** to 1.80× centred on the card, 0.77 s, ease-in-out. The
   *presentation* zooms; the UI itself does not scale.
3. In close-up, the card and its lime backing **rotate ~15° clockwise and
   translate down-left off the screen**, gaining speed (ease-in). The lime card
   is revealed as a separate object and leaves last.
4. The rest of the screen dissolves upward to white during the same window.
5. **Camera dollies back out** while Analytics assembles: segmented tabs first,
   then the nav bar, then the **bars growing from the baseline** with a
   left → right stagger, then the range strip, then the summary rows.

### 7.7 Motion rules to carry forward

- **One hero move per transition.** Everything else is a fade or a small translate.
- **Nothing bounces.** Every arrival decelerates cleanly to rest.
- **Stagger arrivals, synchronise departures.** Content assembles piece by piece;
  it leaves as a single block.
- **Translation distances are small** — 12–30 pt for content elements. Only whole
  screens travel far.
- **Charts always animate their data**: bars grow from the baseline, candles draw
  left → right. Sparklines are static.
- **Every tap is acknowledged** with a circular ripple before anything else moves.
- Device-level slides and camera dollies are *presentation* choices for the reel,
  not app behaviour. Do not build them into the product.

---

## 8. The design's operating principles

1. **One giant number per screen.** `$16,988.31` at 48 pt, `Market` at 40 pt.
   Everything else is 18 pt or smaller. The ~3:1 contrast between hero and body
   creates the hierarchy on its own, so nothing else has to shout.
2. **White is the layout.** No cards around list content, no zebra striping, no
   boxes. Grouping is done with 46–64 pt of vertical space and a 12 pt uppercase
   label.
3. **Black is a material, not a colour.** Dark panels appear exactly where the
   design wants weight: the account you own, the collection being promoted, the
   chart you are trading against. Three per app.
4. **One accent, used sparingly and never for data.** Lime appears about five
   times per screen at most, and always on something you can act on.
5. **Two-line pairs everywhere.** Value + caption is the atomic unit. Learn it
   once and every row in the app reads instantly.
6. **Clip things on purpose.** Chips, tabs, collection cards and favourite cards
   are all cut off at the right edge. Nothing is centred-and-contained; the
   horizontal overflow *is* the affordance.
7. **Rounded everything, at three scales.** 12–14 pt for controls, 18–24 pt for
   cards and sheets, 32 pt for the promotional card. Bar-chart segments and pills
   are fully rounded.
8. **Physical objects.** The lime card behind the black card, the card that
   rotates away when tapped, the overlapping avatar stack — the design
   consistently implies that UI elements are things with edges and mass.

---

## 9. Applying this in this repo

This project uses the **Astryx** design system (see [AGENTS.md](AGENTS.md)),
which forbids raw hex, raw px and hand-rolled `<div>` layout. To apply this
specification correctly:

- Put the palette in an **Astryx theme**, not in `:root` overrides —
  `npx astryx theme template`, then map `--accent-lime`, `--positive`,
  `--negative` and the neutrals onto the theme's token slots. Never override
  `--color-*` in `:root`.
- Check `npx astryx docs tokens` and `npx astryx docs spacing` before introducing
  any of the pt values above; use the nearest existing token rather than an
  arbitrary value. The 4 pt grid here should map cleanly.
- The list-row pattern (§5.2) is dense data → build it with `List`/`Item` or
  `Table` rows, **not** with `Card`-wrapped items.
- The dark account card and the collection card (§5.1, §5.5) *are* standalone
  widgets → `Card` is correct there.
- Delta values are status, not counts → `StatusDot`/`Token`, not `Badge`.
- Check `npx astryx docs motion` before hard-coding the easing tokens in §7.2 —
  prefer the system's motion tokens if they are close.

### Caveats

- The reel is a **portfolio / brokerage** concept (stocks, funds, candlesticks,
  buy/sell). This repo is a personal finance tracker (ledger, budgets, debts).
  The *visual system* transfers cleanly; the *screen anatomy* in §6 does not —
  treat those as rhythm references, not as screens to copy.
- Sizes are reconstructed from a 464 px-wide render. Values are accurate to
  ±1 pt; the 414 × 896 canvas is a strong inference, not a certainty. If you
  build on 390 × 844 instead, multiply every pt value by 0.942.
- Font weights are inferred from stroke thickness at ~40 px cap height and may be
  off by one step (Medium vs SemiBold) at the smaller sizes.
- The reel never shows scrolling, empty states, keyboards, errors, or dark mode.
  All of those are unspecified.
