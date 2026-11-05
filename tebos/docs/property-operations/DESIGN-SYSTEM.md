# Tidy Property Operations: design system

The single source of truth for values is `web/src/ops/tokens.css`. This document explains them and the rules for using
them. `web/src/ops/tokens.test.ts` enforces the parts a machine can check.

Principles, from the apple-design skill (`.claude/skills/apple-design/SKILL.md`, read in full) and the directive:
**purpose** (every element earns its place), **simplicity, not minimalism** (the most important thing is the most
obvious), **craft** (no value is random), **responsibility** (no figure without its basis; no action without its owner),
**familiarity** (things that look the same behave the same). The emotion to create is *calm confidence*.

## 1. Colour

Semantic tokens only; components never use a raw colour (tested).

| Role | Token | Dark | Light |
|---|---|---|---|
| Page | `--ops-bg` | #0a0c10 | #f4f5f7 |
| Sidebar (dark in both themes: one wayfinding anchor) | `--ops-sidebar` | #07090c | #0e1219 |
| Surface / raised / hover | `--ops-surface`, `-2`, `-hover` | #12151b / #181c24 / #1f242e | #fff / #f0f2f5 / #e7eaef |
| Text: primary, secondary, tertiary, caption | `--ops-text`, `-2`, `-3`, `-4` | ≥ 4.5:1 on every surface | ≥ 4.5:1 |
| Navy action | `--ops-accent` (+ `-hover`, `--ops-on-accent`) | #2c4a86 | #24427e |
| Links, active nav, focus | `--ops-accent-text`, `--ops-focus` | #9dbbff | #234fa8 |
| Status | `--ops-good`, `-warn`, `-bad`, `-info`, `-neutral` (+ `-bg`) | text ≥ 4.5:1 on its tint | same |
| Charts | `--ops-chart-expected`, `-billed`, `-received`, `-overdue`, `-vacant`, `-held` | ≥ 3:1 on the track | same |

Rules: semantic colour only where it carries meaning (green = paid or let, amber = owed or vacant, red = serious). No
gradients except the sidebar's hard edge. No glass on content: translucency is used once, for the phone's top bar.

## 2. Typography

Geist (variable, already in the repository), falling back to the system font. Each step is a **set**: size, leading and
tracking together. Large text tracks tighter, small text slightly looser; leading tightens as size grows.

| Step | Size | Leading | Tracking | Use |
|---|---|---|---|---|
| display | 1.5–2rem (fluid) | 1.12 | −0.022em | page titles |
| metric | 1.25–1.625rem (fluid) | 1.15 | −0.02em | KPI figures (tabular numbers) |
| title | 1.0625rem | 1.35 | −0.012em | card titles in lists |
| heading | 0.9375rem | 1.4 | −0.006em | card headings |
| body | 0.90625rem | 1.55 | −0.003em | everything else |
| small | 0.8125rem | 1.5 | 0 | tables, secondary lines |
| caption | 0.75rem | 1.45 | +0.01em | bases, hints |
| label | 0.71875rem, uppercase | 1.4 | +0.08em | KPI and column labels |

All sizes are in `rem`, so the layout grows with the reader's text-size setting. Money always uses tabular figures.

## 3. Spacing, radius, elevation

- Spacing: a 4px grid in rem: `--ops-s-1` (4) … `--ops-s-10` (40). Inline styles may only carry data (bar widths).
- Radius: 6 (chips), 8 (controls), 12 (notes, stacked records), 16 (cards), pill (badges, bars).
- Elevation: dark surfaces separate by **tone**, not shadow. Shadows only for things that float (`--ops-elev-2/3`).
  The light theme adds a 1px hairline shadow to cards (`--ops-elev-1`).

## 4. Components (rules)

| Component | Rule |
|---|---|
| Button | 36px tall (44px on touch). Primary = navy, one per area. Pressed state on pointer-down (scale 0.97, 90ms) |
| Field | Label above, hint below, error inline (`:user-invalid` edge); focus ring 3px in `--ops-focus-ring` |
| Card | Title, optional one-line subtitle saying what the numbers are |
| KPI | Uppercase label, tabular figure, basis line (expected / billed / received / owed / held / estimated / actual) |
| Table | Desktop: columns. **Compact screens: each row becomes a labelled record**, never a shrunken table |
| Needs attention | Dot + hidden severity word for screen readers + linked title + "detail · basis"; six shown, the rest one press away |
| Badge | Tinted background with ≥ 4.5:1 text; sentence case |
| Empty state | Says what is missing and what to do next, in one sentence |

## 5. Iconography

lucide icons, 15–17px, `aria-hidden`, always next to a text label (never an icon alone except month arrows, which carry
`aria-label`).

## 6. Motion and interaction (from the apple-design skill, applied selectively)

| Principle | Applied here | Not applied, and why |
|---|---|---|
| Response: feedback on press | `:active` scale on buttons, nav and cards; no artificial delays; `touch-action: manipulation` removes the tap delay | — |
| Critically damped by default | `--ops-ease-out`, 90–220ms; no overshoot anywhere | Bounce: nothing in this product is thrown |
| Spatial consistency | The phone menu grows from the Menu button (`transform-origin: top right`) | — |
| Materials | The phone's top bar is translucent; content scrolls under it | No glass on content or cards |
| Ease theme changes | Background colour transitions on theme change | — |
| Direct manipulation, velocity handoff, momentum, rubber-banding | — | No draggable elements yet. If a bottom sheet or swipe is added, it must use Pointer Events, 1:1 tracking and a spring library (decision recorded then) |

Operational screens never animate data that people read: figures appear at once. Only bars grow (220ms) to show
proportion, and not under reduced motion.

## 7. Accessibility (WCAG 2.2 AA target)

| Need | How |
|---|---|
| Contrast | Every text and graphic pairing computed in both themes by `tokens.test.ts` |
| Keyboard | Skip link first; visible focus everywhere; theme choice is a radio group with arrow keys |
| Screen readers | Landmarks, headings, labelled forms, `role="status"`/`alert` for results and errors; severity words hidden visually but read |
| Text size | rem/em throughout; em breakpoints |
| Reduced motion | No growth or slide; menus cross-fade; press scale off |
| Reduced transparency | Top bar becomes solid |
| More contrast | Captions become secondary text; lines and control edges strengthen |
| Forced colours | System colours; bars kept visible |
| Touch | 44px controls on coarse pointers |

## 8. Breakpoints

| Name | Range | Layout |
|---|---|---|
| compact | ≤ 51.25em (820px) | top bar with Menu; tables become records; one-column cards |
| medium | ≤ 56.25em (900px) | KPI grid in two columns |
| wide | above | sidebar, four KPIs, two-column cards |
| narrow phone | ≤ 26.25em (420px) | tighter KPI padding |

Tested at 390, 768 and 1440px (`e2e/ops.spec.ts`), with long names and large balances.

## 9. Themes

Dark is the default; Light and System are offered in the sidebar. System is resolved in code to dark or light (so the
light palette is written once) and follows the device live. The choice is stored per device; nothing is sent anywhere.

## 10. Screen quality checklist

A screen is finished only when all of these pass:

1. Every figure comes from a record, and its basis is on screen.
2. Initial, loading, empty, error, success and no-permission states are all designed and reachable.
3. No horizontal scroll at 390, 768 or 1440px with long names and nine-figure balances.
4. Contrast test passes; focus is visible; keyboard order is logical; the skip link works.
5. Under reduced motion nothing moves; under more contrast nothing relies on faint text.
6. Touch targets are 44px on a phone.
7. No raw colour or spacing value outside the tokens.
8. A screenshot has been looked at in both themes.
