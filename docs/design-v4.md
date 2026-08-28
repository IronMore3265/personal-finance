# Paisa — design spec (v4)

Copied from the Claude Design project *Android personal finance tracker*
(`design.md`), which is the source of truth for this build. Kept here so the
repository carries the spec it was built against.

For the deeper reverse-engineering of the reference reel — the measured grid,
type scale and the full motion timeline — see [DESIGN.md](../DESIGN.md).

---

Reference: `uploads/9190981c606898aaebf19bb434dea0a2-6bb1e873.png` (lime/black/white finance app).
Current build: `Paisa v4.dc.html`. Earlier: v3 lime, v1 calm (kept for history).

## What v4 fixes
- **Icons everywhere.** Nav, header, actions, account rows and list rows all carry stroke icons or glyph chips. No more text-only affordances ("Details", "All", "Mark paid" as bare words).
- **De-carded.** The reference is a white sheet with hairline dividers, not a stack of shadowed cards. Rule: **max one dark card per screen** (the primary account), everything else is flat rows on the sheet separated by section labels and 1px lines.
- **Rhythm instead of repetition.** Each screen has a different lead element: Home = centered balance + black card, Activity = search + grouped ledger, Budgets = thin-line rows, Reports = tabbed chart canvas, Settings = grouped list.

## Canvas
- Phone 393×852 in a near-black bezel, radius 46 outer / 34 inner.
- Screen surface is **white** (`--surface`), page behind is `#ededeb`. Cards no longer float on grey — the sheet IS white.
- Horizontal padding 22px. Section gap 26px.

## Colour
| token | light | dark |
|---|---|---|
| `--surface` sheet | `#ffffff` | `#131512` |
| `--ink` | `#111210` | `#f2f3ee` |
| `--ink2` / `--ink3` | `#6b6d67` / `#a2a49e` | `#9c9e97` / `#6c6e67` |
| `--line` hairline | `rgba(17,18,16,.09)` | `rgba(242,243,238,.12)` |
| `--accent` lime | `#d8f24a` | same |
| `--pos` green | `oklch(0.62 0.15 140)` | `oklch(0.78 0.17 140)` |
| `--danger` | `oklch(0.55 0.19 25)` | `oklch(0.68 0.19 25)` |

Lime is a **fill**, never body text. Gains are green, losses are red, everything else ink.
Chart palette: lime → green ramp for positive series, `--ink3` grey for the comparison series.

## Type
Manrope only. Tabular numerals on every amount.
- Balance hero 46/800, tracking −.045em
- Screen title 22/700 (centered in header)
- Row title 15/500 · row meta 11/400 uppercase-off
- Section label 10/700 uppercase, tracking .16em, `--ink3`
- Numbers in rows 15/700

## Icons
16–22px stroke icons, `stroke-width:1.6`, round caps, `currentColor`. Set in use: pie, transfer arrows, target, person, plus, arrow-left, share, search, sparkle, chevron, check, bell. Account rows use a 34px rounded-square glyph chip (type initial) tinted by account type — never an emoji.

## Components
- **Balance block** — centered label / amount / green delta. Home only.
- **Primary account card** — black, radius 26, name + ⋯, amount + delta, two translucent pill buttons with icons.
- **List row** — glyph chip · title + meta · optional sparkline · right-aligned amount (+ sub). Divider between rows, no per-row card.
- **Section header** — uppercase label, hairline rule filling the gap, optional icon-button on the right.
- **Tabs** — underlined, scrollable (Reports).
- **Range chips** — pill row, active is `--ink` fill (Reports).
- **Bar canvas** — thin rounded bars, 3px gap, lime/green/grey.
- **Bottom bar** — 4 stroke icons, no labels, active = ink icon + lime dot; lime FAB (+) floats above it.

## Screens
Home · Activity · Budgets/Goals · Reports (Overview / Categories / Accounts / Months) · Settings. Sheets: add transaction (numpad), SMS parser.

## Still open
Transfers as a third entry type vs own flow · per-account budgets · whether the USD account converts on Home.

---

## Where this build departs from the prototype

The prototype has no history to draw and no storage to answer from, so several
values in it are placeholders. Those are computed for real here — see the
*Design fidelity* section of the [README](../README.md) for the full list and the
reasoning. In short: sparklines, account deltas and the Reports bar canvas come
from the ledger rather than from a seeded random generator, and two colours are
re-tinted in dark mode so the wordmark and the one dark card stay legible.
