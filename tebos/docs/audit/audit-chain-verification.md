# Checking the audit trail

`audit_events` is append-only and hash-chained: one chain per organisation, plus one for platform events.
The verifier recomputes every event's hash and checks each link. It only reads. It never rewrites, deletes or
"repairs" an event.

- **Migration:** `supabase/migrations/20261019090000_audit_verify.sql`.
- **Tests:**
  - `supabase/tests/99zl_audit_verify.sql`: tampering, removal, forgery, missing history, time zones, permissions;
  - `test/integration/audit-chain-pg.test.ts`: concurrent writers;
  - `test/audit.test.ts`: the statuses mirrored in `src/domain/audit.ts`.

## Running it

| Who | How | Sees |
|---|---|---|
| A signed-in person | `select * from public.audit_chain_status();` | Their own organisations' chains, and the platform chain if they're a platform admin (the same rule as reading `audit_events`) |
| The server (`service_role`) | `select * from tebos_private.audit_verify();` (all chains) or `audit_verify(array['<org>']::uuid[], false)` | What it asks for |

Visitors can't run either function. Signed-in people can't call `tebos_private.audit_verify` directly.

## What each status means

| Status | Meaning | First bad event |
|---|---|---|
| `intact` | Every event matches its recorded fields and points to the event before it | — |
| `broken_link` | An event doesn't point to the event before it: an event was removed or reordered, or the one before it was changed and rehashed | The event after the gap |
| `content_mismatch` | An event's recorded fields no longer give its hash: it was changed after it was written | The changed event |
| `unverifiable_start` | The chain's first event points to an earlier event that isn't there. Everything after it was checked; what came before can't be. | — |

**Time zones:**
- `timezone_hint` is filled in only for `content_mismatch`. The writer hashes the event's time as the *writing session* renders it.
- TEBOS's server and roles are UTC, so the verifier checks in UTC.
- If an event matches only at another offset (e.g. `+02`), it was most likely written by a session set to another time zone. It is still reported as a mismatch, to be looked into, never silently passed.

## What it cannot prove

- That a chain's **newest** events weren't removed.
- That someone with **owner access to the database** didn't rewrite a whole chain and recompute every hash.

To catch both later, record each chain's `last_id` and `last_hash` somewhere outside the database (for example in the
weekly brief) and compare them on the next run.

## Rules for using it

- A failed check is investigated and recorded. History is never edited to make it pass.
- "The live trail is intact" is said only after the verifier has run against the live database and its result has been
  recorded, with the date, in `docs/operator-log.md`.
