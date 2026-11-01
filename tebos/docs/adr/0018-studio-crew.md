# ADR 0018: Studio crew, the shoot-day checklist and paid delivery

Date: 2026-11-01 · Status: built; goes live when the founder approves the migration (operator log, decision 37).

## Context

The founder asked, on 1 Nov, that Grape Studios "operate like a company", running smoothly even when Teboho (its CEO)
isn't there, and to "continue building Grape Studios full stack". ADR 0016 built bookings: a customer requests a time,
the team confirms once the deposit has arrived. The photography-studio blueprint (PR #116) wrote down who does what.
What was missing was the database holding those rules for each shoot. Before this change any booking could be
confirmed with nobody named to shoot it, marked shot with no backup, and delivered with no gallery or balance.

## Decision

Migration `20261102150000_studio_crew.sql` adds the following; the domain mirror is in `src/domain/bookings.ts`, with
tests in `99zzi_studio_crew.sql`, `test/bookings.test.ts` and the parity checks.

1. **Each booking names who does it.** That person is chosen from the business's admins and operators (`booking_crew`
   lists them with their names).
   - A booking is confirmed only once someone is assigned.
   - The assignment can change until the shoot is marked done.
   - This is what lets a second photographer cover a shoot without the owner.
2. **The shoot-day checklist is part of the record.** The team records three things:
   - the call sheet sent;
   - the releases (who signed, or why none were needed);
   - the files backed up.

   Each is stamped once, never in the future, and the backup only after the shoot has started. A shoot is marked
   done only once it is backed up and its releases are noted.
3. **Paid delivery.** A shoot is delivered only with a gallery link (https). When a balance is owed, its payment
   reference must be recorded first.
   - The customer's private page shows the balance due after the shoot.
   - It shows the gallery link only once the shoot is delivered.
4. **History stays history.** A declined, cancelled, missed or delivered booking's records can't be changed.
   - Only admins and operators can write these columns.
   - Every change is on the audit trail.
5. **In TEBOS → Bookings:**
   - assign the photographer;
   - see the checklist;
   - record each step;
   - see "My shoots": each team member's own confirmed and shot bookings.

## Not done

- **Automatic messages** (the call sheet, the balance reminder, the gallery email). These need the sending domain and
  key (decision 2), and outward messages are founder-approved drafts.
- **A gallery host.** The team pastes the link from whatever Grape uses (e.g. Pixieset or Google Drive). TEBOS doesn't
  store the photos.
- **Several shoots at the same time.** The no-overlap rule from ADR 0016 still holds: one shoot at a time.
