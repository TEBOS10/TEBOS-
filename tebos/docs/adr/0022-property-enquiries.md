# ADR 0022: Property enquiries, and Tidy Enterprise's public website

Date: 2 Nov 2026. Status: proposed (built 2 Nov; the migration waits for the founder's "merge it").

## Context

Stage 3 of the Tidy Enterprise plan (founder's "Go, all three in order", 2 Nov 2026): a public website in the founder's
own words, with an enquiry form that asks for consent. TEBOS's existing `enquiries` table is TEBOS's own sales
pipeline (plans and equity), not a property business's leads, and its rows aren't scoped to an organisation. Grape
Studios' booking site showed the pattern for a client's own site: its own build, talking to TEBOS only as the public.

## Decision

- Migration `20261102190000_property_enquiries.sql` adds `property_enquiries` and `property_enquiry_settings`, scoped
  to an organisation. Any organisation can use it; Tidy Enterprise is the first.
  - The public sends an enquiry only through `public.property_enquiry(slug, …)`, and only when the organisation has
    switched enquiries on. It is throttled (3 an hour from one source, 40 in total) and one email address can have at
    most two new enquiries waiting.
  - Consent is required, and when it was given is stored.
  - An enquiry names the situation (the seven problems the founder listed, or something else), how the person is
    connected to the property, roughly where it is, and a description. The description and area must not carry ID
    numbers, phone numbers or email addresses; contact details have their own fields.
  - Only the organisation's admins and operators read enquiries; viewers don't (they hold personal details).
  - new → contacted → closed, or new → closed, always with a note. Nothing else changes.
  - An admin may delete one when the person asks. The audit trail records each enquiry's reference, situation and
    status but never the person's details or words, so a deletion leaves nothing behind.
  - Tidy Enterprise's settings row is created switched off; its admin switches it on in TEBOS → Enquiries.
- TEBOS gets an **Enquiries** page (shown to organisations that take enquiries): the switch, the open enquiries with
  email and phone links, the note and status, and deletion on request for admins.
- Tidy Enterprise's website is its own build (`vite.tidy.config.ts`, output `dist-tidy`). It carries the founder's
  description, the seven problems, the six stages, the positioning statement and what Tidy Enterprise is not, word
  for word where possible. No clients, figures or reviews. Until the form is switched on it shows the email address
  instead.

## Consequences

- Live, the site's form works only after the migration is applied and the form is switched on. Hosting and a domain
  need the founder's choice (decision 31's host).
- The consent wording on the form is outward-facing text: the founder approves it before the form goes live.
