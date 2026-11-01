# Web Delivery Division: design brief

**Status: set by the founder's references (1 Nov 2026).** The founder supplied eight screen recordings as "the standard
of which I expect websites and web apps".

**How they were reviewed:**
- eight frames sampled evenly from each clip, plus close-ups;
- these are social-media recordings of other studios' sites, not the live sites. Exact animations, timings and
  responsive behaviour can't be read from them; anything below about motion describes what the frames show;
- the recordings stay out of this public repository. They are other people's work, kept as direction only.

## 1. The references, and what each one teaches

| # | What it shows | The quality to reproduce |
|---|---|---|
| R1 | A product hero: one drinks can, rendered in 3D, turning on a magenta gradient, then a whole row of cans on black. A cork coaster floating alone on near-black under tiny editorial captions ("Isn't just a coaster"). A photoreal coffee scene. One giant grotesk word ("sustainability") on a textured grey | **One hero object or one word, and nothing competing with it.** The product is lit like a studio photograph; the text around it is small |
| R2 | A logistics company's site as an isometric 3D world, white and red. Scrolling moves the camera through the warehouse, the rail yard, the port and the offices. A small white card holds the promise ("your forwarding company for transport & logistics") and two red buttons | **The business's whole operation, made explorable.** Scroll is the story. The conversion card stays put while the world moves. One brand colour |
| R3 | A custom home builder (a client project priced at USD 2,650). The hero is a blueprint wireframe of a house over the real site. Scrolling builds it: foundation, framing, the finished house, then a slow push to the front door: "Welcome home". A serif italic headline, "Built from the blueprint up", with a gold accent | **Scroll-driven transformation that tells the client's process.** The strongest model for property and the PRA platform: before → process → result |
| R4 | A data platform: a 3D globe on deep navy carrying live points (flights, ships, events), with a compact layer panel on the left and a status bar along the bottom | **A dense, dark, live-data interface** that still reads at a glance. Its place is TEBOS and TEPOS dashboards that hold real data, not marketing pages |
| R5 | Sites built with an AI builder and a section library: a dark hero with light trails; a café ("Favorites made daily") with bold condensed type over product photos on a light ground; a DNA helix ("A universe of possibilities already in motion") | **Fast assembly from a library of high-end sections**, then tailored. The library is Getlayers, already recorded in `docs/tooling-connections.md`; its paid plan is a spend decision |
| R6 | A critique: "Stop building Jarvis dashboards". The useful dashboard is a few business numbers with small trend lines: "Watching every number, so you don't have to" | **Dashboards show the numbers that matter, not decoration.** It agrees with the founder's operating specification ("avoid decorative dashboards") |
| R7 | A fashion and editorial portfolio. Photographs on a curved horizontal strip; large serif letters pinned to the corners; an "About" set over a dark-red full-bleed photo; scattered polaroids on grey | **Editorial luxury.** White space, serif display type, photography as the layout, and navigation by gesture |
| R8 | A designer's portfolio, dark. The person cut out in front of a curved 3D carousel of project cards; a serif title, "Product & UX Designer"; an intro mark drawn on load | **The person or product as the subject, with depth behind it.** A short intro sequence, then straight to the work |

## 2. The TEBOS standard (what every client site must reach)

1. **One idea per site.** Each site is built around one hero idea taken from the client's business:
   - **an object:** the product, rendered (R1);
   - **a world:** their operation, explorable (R2, R4);
   - **a transformation:** their process, scroll-built (R3);
   - **the person or the work:** portfolios, people-led services (R7, R8).

   The creative brief (agent 02) names which one, and why. A site without one fails design review.
2. **Scroll tells the story.** Sections move the camera, build the scene or reveal the next state. The page never just
   stacks boxes. Every moving section still makes sense as a still frame.
3. **Type:**
   - one display face, either a high-contrast serif (R3, R7, R8) or a heavy grotesk (R1, R5), used large and sparingly;
   - a quiet sans for everything else;
   - small UI text, about 12–14px, generously spaced;
   - body text at least 16px.
4. **Colour:**
   - a near-black, white or warm-grey canvas;
   - **one** brand accent (red in R2, magenta in R1, gold in R3), used for calls to action and the hero's light;
   - no gradients-for-the-sake-of-it.
5. **The conversion stays visible.** The promise and one or two buttons sit in a fixed, calm card (R2), or return at
   the end of each chapter. Ambition never hides the enquiry, booking or purchase.
6. **Image quality:**
   - studio-grade renders or photography only;
   - no stock clichés;
   - no AI images with visible artefacts.
   Every asset is client-supplied, licensed, or made for the client, and recorded in the asset register.
7. **Web apps:**
   - dense and dark when the data is live (R4);
   - otherwise the few numbers that matter, with trends (R6);
   - the same type and accent rules.

## 3. How it's built at no added cost

| Effect | Approach | Licence and cost | Fallback (always shipped) |
|---|---|---|---|
| 3D object or world (R1, R2, R4, R8) | Three.js, already a TEBOS dependency (0.186), with models in glTF/GLB, compressed (Draco or Meshopt) | MIT; R0 | A pre-rendered poster image or a short muted video loop |
| Scroll-built transformation (R3) | An image sequence drawn to a canvas and scrubbed by scroll position (frames rendered once in Blender, which is free) | R0; the frames are the client's own | Four still chapters with crossfades |
| Scroll choreography | Native `IntersectionObserver` and CSS scroll-driven animations where supported. A scroll library only if needed, after checking its licence | R0 | The plain document flow |
| Smooth scroll, if used | A small open-source library (MIT), never scroll-jacking that breaks the keyboard or the back button | R0 | Native scroll |
| Section library (R5) | Getlayers as reference only; its paid plan is a spend decision. Our own sections otherwise | Paid, so not used without approval | — |
| AI-generated imagery | Higgsfield or ElevenLabs connectors, which spend credits | Needs approval per project | Client photography, or a commissioned shoot (at the client's cost, disclosed) |

**Performance and access rules** (these make ambition safe):
- **Hero budget:** at most 2 MB of transferred weight before first interaction on mobile, with 3D loaded after the
  first paint.
- **Fallbacks:**
  - `prefers-reduced-motion` gets the still chapters;
  - devices without WebGL, or with low memory, get the poster.
- **Keyboard and screen readers:** every scroll scene has a text equivalent, and focus is never trapped.
- **Mobile:** the scene is reframed for portrait, not just scaled, and the call to action stays reachable with a thumb.

## 4. Matching the ambition to the package

The references are the bar for quality. Their scale belongs to bigger budgets.

| Package | Reference level it can carry | Why |
|---|---|---|
| Small (R500 a month) | Editorial and object-led (R7, R1-style still or a light 3D object), with one scroll chapter | Fits 10 parts, and the 3-day delivery |
| Medium (R2,500 a month) | Adds a scroll-built transformation (R3) or a contained 3D scene | Needs rendered frames or a model: assets must exist before Build |
| Company (R7,500 a month) | Explorable worlds (R2) and live-data apps (R4) | Weeks of modelling, so the 3-day promise doesn't apply. Flagged at intake (spec §4) |

A full R2-style world inside a 3-day Small delivery isn't realistic. The intake flags it, and offers a phased scope or
a quote.

## 5. Not copied

The brands, models, photographs, copy and code in these recordings belong to their owners. TEBOS reproduces the
**qualities** in section 2 with each client's own content and assets.
