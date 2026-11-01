# Web Delivery Division: design brief

**Status: PROVISIONAL.** No reference websites, screenshots or brand files have been supplied for this division. This
brief has not been matched against any reference. Replace it when the founder or a client supplies references.

## Two surfaces, two jobs

1. **The internal surfaces:** the maintainers' dashboard and the client's progress portal. These reuse TEBOS's
   existing interface:
   - `web/src/styles.css` and `cinematic.css`;
   - the same tokens, components and sign-in.
   The direction is **data-rich and functional**:
   - one project per row;
   - the stage, the deadline and the next blocking item visible at a glance;
   - nothing decorative.
2. **Client websites.** Each gets its own direction from its intake (section D):
   - corporate, editorial, minimal, product-led or cinematic;
   - chosen by the client's brand and objective;
   - never 3D by default.

## Qualities every client website template must have

These come from the operating specification, and are measured in `ACCEPTANCE.md`.

- **The primary conversion** is above the fold on mobile and desktop, and repeated at the end of each page.
- **Typography:**
  - at most two families, loaded from Google Fonts or self-hosted;
  - body text at least 16px;
  - a line length of about 60–75 characters.
- **Spacing:** a 4px or 8px scale, applied as tokens; nothing set per page.
- **Images:**
  - client-supplied or licensed only, with the licence recorded in the asset register;
  - served in modern formats, with width and height set so the layout doesn't shift.
- **Motion:** purposeful only. `prefers-reduced-motion` turns it off. A 3D scene always has a static fallback.
- **Accessibility:**
  - keyboard reachable, with visible focus;
  - labelled form fields;
  - contrast at least WCAG AA.
- **Forms:**
  - never say "sent" unless the save succeeded;
  - a failure shows an error and keeps the visitor's text;
  - a booking request is labelled as a request, not a confirmed booking.

## Not copied

References are direction only. No protected branding, source code, photography or written content is reused.
