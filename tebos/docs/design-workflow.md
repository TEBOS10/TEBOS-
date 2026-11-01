# Website workflow: design, build, test, fix

How TEBOS builds a client website (Grape Studios, BAME, every site-template job) so that a page is checked in a
real browser before anyone calls it done. Adapted on 1 Nov 2026 from a public "GPT-6 Astra in Codex" workflow the
founder shared. Its tools are different (Codex, an OpenAI plan, third-party skill packs); its method holds.

## What TEBOS already has, piece by piece

| The post's piece | Its job | TEBOS's equivalent |
|---|---|---|
| Design skills (type, spacing, motion) | Design knowledge | `src/quiet.css` and ADR 0014 (TEBOS); `src/grape/grape.css` and ADR 0016 (Grape). Each client gets its own palette and rules, written down before code |
| "Taste" (no purple gradients, no three identical icon cards, no giant centred headline) | Avoid the AI look | The house rules below, and the founder's review. The Grape hero was redone for exactly this reason |
| Figma MCP | Build from the real frame, not a screenshot | The Figma connector is available to Claude. Paste a frame link (Copy link to selection, so it has `node-id`) and Claude reads layers, variables and spacing |
| Playwright MCP | Let the builder see what it built | Playwright runs every app (`npm run test:e2e`, 4 dev servers). `e2e/site-check.spec.ts` is the generic check below |

Not adopted: installing third-party skill packs from the internet into this repo. Each one is code and instructions
from an outside author that would run with this repo's access. Any one the founder wants is reviewed first, then
added deliberately.

## The four phases

1. **Design: read and push back, then stop.** Read the frame or brief and list what is off before writing code:
   spacing off the 8px scale, masks that need CSS, missing states (empty, error, loading), missing mobile layout.
   **Stop and wait for "go".** Building on a misread spacing is the expensive mistake.
2. **Build:** one section at a time, using the frame's values. Flex and grid, never absolute coordinates copied
   from a frame without auto layout.
3. **Test:** run the site check and report a pass/fail table. **Stop and wait for "go".** A step that finds and
   fixes in one go quietly rewrites the site.
4. **Fix:** one fault at a time, the smallest change that fixes it. Then run the check again. No new sections,
   no rewritten copy, no "while I was there".

## The site check (`e2e/site-check.spec.ts`)

Every public page of TEBOS and Grape Studios' site, in Chromium, must pass all five:

1. no console errors or uncaught exceptions;
2. every in-page link (`#id`) points at an element that exists;
3. at 390px nothing scrolls sideways (a failure names the elements that stick out);
4. every image has alt text (or `alt=""` for decoration);
5. keyboard focus is visible on the first six links and buttons.

Add a page to `PAGES` when a public page is added. Form checks (an empty submit shows an error, never a reload)
live in each form's own spec.

## House rules for any site TEBOS builds

- The client's brand, not TEBOS's: their colours, their photographs, their words. Accent colours stay muted unless
  the client's brand says otherwise.
- No gradients as decoration, no rows of identical icon cards, no stock "AI" imagery.
- One clear action per screen (Grape: book a shoot).
- Mobile first: 390px is checked on every page.
- Nothing is called done until the site check passes and a screenshot at 390px and 1440px has been looked at.
- Never fabricate: no invented reviews, client logos or numbers.
