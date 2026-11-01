# ADR 0016: Bookings, with Grape Studios as the first business to use them

Date: 2026-11-01 · Status: built (stage 1). It goes live for Grape Studios once the steps under "Going live" are done.

## Context

The founder asked, on 1 Nov: "Build Grape Studios' booking platform, stage 1 and create a schedule that both the
client and the Grape Studios team can view … Grape Studios needs an iconic 3D visual hero page." They also shared
Grape Studios' Instagram (@grape.studios_) for its look: high-contrast editorial fashion photographs, black, white
and bold colour, posts in threes.

## Decision

1. **Bookings are a TEBOS capability, not Grape-only code.** Any business that sells time can use them (a salon, a
   tutor, a studio), which fits the template factory. Grape Studios is the first.
   - Migration: `20261102120000_bookings.sql`.
   - Domain mirror: `src/domain/bookings.ts`.
   - Tests: `99zzh_bookings.sql`, `test/bookings.test.ts`, and parity checks.
2. **The database holds the rules.**
   - **Services and rates.** A custom rate is a booking without a package, and is quoted before it can be confirmed.
   - **When a booking can be made.** It must fall:
     - inside working hours, in South African time;
     - outside the business's time off;
     - at least 24 hours ahead and at most 6 months ahead;
     - on a single day;
     - without overlapping a requested or confirmed booking (one photographer, one shoot).
   - **Concurrency.** A lock per business stops two people taking the same slot at the same moment.
   - **The stages:**
     - requested, then confirmed, declined or cancelled;
     - confirmed, then completed (shot), cancelled or no-show;
     - completed, then delivered.

     Every change needs a reason.
   - **Confirming** needs the price and the reference of the deposit that arrived. The deposit is half the price,
     non-refundable. TEBOS never takes, holds or sees the money; the team records what arrived.
   - **Other rules.** A shoot counts as shot only once it has ended, and delivering needs a note of how the images were
     sent. A listed rate's price is fixed, and nothing is ever deleted.
   - **Public requests** go through `booking_request` only:
     - the customer must consent;
     - requests are throttled to 3 an hour per source and 40 in total;
     - one email can have at most 2 requests waiting.
3. **One schedule, two views.**
   - **The team** sees it in TEBOS → Bookings (`/bookings`):
     - the week, with each booking placed by its time;
     - the requests waiting for an answer;
     - each booking's actions: quote, confirm with the deposit reference, decline, cancel, shot, no-show, delivered;
     - time off;
     - working hours.

     Admins and operators see who booked. Viewers see only when.
   - **The customer** sees their booking through the private link they get on booking (`/b/<link>` on Grape's site):
     - the status, and what happens next;
     - the schedule: requested, deposit, the shoot, and the window for their images (in working days);
     - the deposit instructions, once a deposit is due;
     - the studio's week, with their own slot marked and everything else shown only as "booked".

     The link never shows anyone's contact details, theirs included. A wrong link shows nothing.
4. **Grape Studios' site** is its own build (`vite.grape.config.ts`, `dist-grape`). It talks to TEBOS only the way the
   public does: a publishable key and four functions, never a privileged key (the bundle check enforces this).
   - **The look:** black, white and a pinch of purple; Grape's photographs, shown in threes; light, large type.
   - **The 3D hero:** a black lacquer GP coin turning in the dark, with Grape's six photographs orbiting it like prints,
     lit by a purple rim light. The pointer tilts the camera.
   - **Who gets the 3D hero:** phones, reduced motion and computers without a graphics chip get a still version made
     of three photographs instead.
   - **Before Grape is set up in TEBOS,** the site shows the rate cards and says that online booking opens soon, with
     the booking email. It never pretends a booking was made.
   - **No bank details** appear in the site's code (the bundle check refuses them). Grape writes its own deposit
     instructions in TEBOS, and they are shown only on a customer's booking page.

## What stage 1 does not do

- **Online payment.** The deposit is paid the way Grape Studios already takes it, and the team records it.
- **Emails or reminders.** Nothing is sent until an email provider is connected (operator log, decision 2). The
  customer keeps their link; the team sees new requests in TEBOS.
- **The AI editing** (ADR 0015, stage 3).

## Going live (founder decisions 34 and 35)

1. Grape Studios signs its agreement.
2. Its organisation is created with the slug `grape-studios`, and its owner is invited as admin.
3. Run `scripts/seed-grape-bookings.sql` to load its six services and rates.
4. Grape Studios sets its working hours and deposit instructions in TEBOS → Bookings, then switches on online booking
   (`booking_settings.accepting`).
5. `dist-grape` is deployed on Grape Studios' own hosting account and domain (ADR 0012), on a host that allows
   commercial use (decision 31).

## Privacy

Customers' names, emails and phone numbers are stored for the booking and are visible only to Grape Studios' admin and
operators. Grape Studios' privacy notice must say how long they are kept. Until it does, TEBOS keeps them for as long
as the booking record exists.
