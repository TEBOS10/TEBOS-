# ADR 0024: The operating picture, and comparing a business with its industry's leader

Date: 5 Nov 2026. Status: part 1 built; part 2 proposed.

## Context

The founder, quality-checking a scan (5 Nov): a website scan shows the outside of a business, but not who owns it, how
it operates, the amounts involved or how long things take. TEBOS should show that inside picture, and compare the
business with the most profitable company in its field, to understand scale and what must be built internally.

## Decision

**Part 1 (built, no database change).** Each business page shows an *operating picture* in four parts: ownership and
decisions, how the work flows, the money, and how long things take (`src/domain/operatingPicture.ts`). Each part says
what was seen on the website (with the evidence), what the owner said in the diagnostic interview (kept as their
statement), or that it is not known, why a website can't show it, and the questions that would answer it. Nothing is
estimated. The small-business interview gains version 2 with two time questions (`time.response`, `time.delivery`);
version 1 stays for interviews already taken.

**Part 2 (proposed, needs an additive migration).** A benchmark record per industry: the leading company that
publishes its figures (for example a JSE-listed company's annual report), each figure with its source URL, period and
unit, entered by TEBOS staff and checked. The business is compared only on measures both sides actually have (revenue
per employee, margin, locations, channels, visible roles and systems). Private companies' profits are not public, so
where no published figure exists the comparison says so. The gaps become proposed actions, each traced to the
comparison that produced it.

## Consequences

- The picture is honest by construction: an unknown is shown as unknown, with the way to find it out.
- Part 2 must never fill a figure from a guess or a model; every number carries its source.
