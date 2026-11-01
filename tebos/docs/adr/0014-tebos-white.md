# ADR 0014: TEBOS white, a quiet look

Date: 2026-11-01 · Status: accepted (founder, 1 Nov 2026)

## Context

The founder, 1 Nov, said:
- "minimalism with a creative aspect … we don't want clutter or too much wording or sharpness";
- "it just looks like another tech startup, it's too dark so perhaps change the black with white";
- "make sure my logo blends naturally";
- "I personally love the TEBOS Chessboard";
- "make even a 10 year old understand. Less is more but quality of the platform must feel valuable and trustworthy."

## Decision

The TEBOS app (`web/src/main.tsx`) now loads `web/src/quiet.css` in place of the dark `cinematic.css`. TEPOS and PRA
keep their own looks.

- **Colour:** white paper and near-black ink (`#16181d`). One blue (`#2f6feb`, the blue of the logo's light) is used
  rarely. Status colours are soft tints.
- **Shape:** soft pill buttons and 24px cards held by one hairline and a faint shadow. Nothing glows; there are no
  sharp corners.
- **Type:** Geist, large and light headings, short sentences. The home page's opening dropped from 60 words to 20.
  The site menu dropped from 8 links to 4; the rest moved to the footer.
- **The logo:** `public/brand/tebos-mark-ink.png` and `tebos-logo-ink.png` are the same chrome mark recoloured in ink,
  with the blue streak kept, so it sits on white the way the original sat on black. The originals are unchanged; the
  film and the explainer still use them on their dark scenes.
- **The chessboard stays.** It now stands in a white room: ink and porcelain squares, chrome and obsidian pieces, and
  no bloom. The bloom washed out a white scene (`web/src/world/boardWorld.ts`).

## Rules for new screens

- One main action per screen, in ink. Everything else is a quiet button.
- Say it in one short sentence; if a 10-year-old wouldn't follow it, rewrite it.
- No new colours. Use the tokens in `quiet.css`.
