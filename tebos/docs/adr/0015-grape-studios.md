# ADR 0015: Grape Studios: a booking and photo-editing platform (concept, then client build)

Date: 2026-11-01 · Status: proposed. The concept is built. The client build waits on the decisions below.

## Context

The founder, 1 Nov:
- "a new client … Grape Studios, it's a photography business where a client books the type of photoshoot that they
  want based on the categories that Grape Studios has";
- "the platform must also have an editing feature where it edits images and converts those pictures into videos";
- "[it] can also turn a picture into day/night";
- "[it] does a careful assessment of someone's pictures and the reference [they] give it and it auto edits with
  premium quality and it can also edit a batch of images";
- "clients needing studios and photographers that want an editing system can use Grape Studios."

The founder also asked for quality on the level of GetLayers (cinematic web templates) and for the work to be shown.

## Decision

1. **Shown now, as a concept** (`/work/grape-studios`, labelled "Concept · sample content").
   - **Booking:** pick a category, a day and a time. The categories are samples, and it books nothing.
   - **Editing in the browser, on the visitor's own photos, with nothing uploaded:**
     - three looks: bright day, golden hour and night;
     - matching a reference photo's colours (colour transfer, per channel);
     - a whole batch at once, saving every photo;
     - a slideshow video made from the photos.
   - It says plainly that these are a colour grade, a colour match and a slideshow. It does not claim the AI edits
     (point 3).
2. **The client build** is Grape Studios' own platform: its own app, its own database, its own account (ADR 0012),
   delivered through TEBOS's web delivery. The project is a `booking` website with the `bookings` objective, and
   starts as a new build. In stages:
   - **Stage 1, booking:**
     - categories, packages and prices set by Grape Studios;
     - the studio's availability;
     - booking requests, held until confirmed, with a deposit through the client's own payment account;
     - confirmations;
     - each client's gallery of their delivered photos.
   - **Stage 2, editing for customers:**
     - upload a shoot, then edit it with looks, a reference match or a whole batch;
     - download the results;
     - photos stay private to their owner and are kept for a set period.
   - **Stage 3, AI studio edits** (point 3).
   - **Stage 4, for other studios and photographers:** accounts, a monthly plan, and usage limits.
3. **The AI edits need a provider, and money.** These are:
   - a true relight from day to night;
   - careful retouching judged against a reference;
   - photos turned into video with generated motion;
   - batch "premium" edits.

   Each edit costs per image or per second of video, and the price varies by provider. TEBOS:
   - adds no provider without the founder's approval of the spend, and Grape Studios' approval of the provider's
     terms (who owns the output, and whether customer photos may be kept or used for training);
   - meters each edit against a monthly budget, and stops when the budget is reached;
   - keeps a person's photos only as long as Grape Studios' privacy notice says, never for training without consent;
   - labels AI-edited images as edited.

## Update, 1 Nov: Grape Studios' own material

The founder sent Grape Studios':
- logo, a black circle with the GP monogram;
- six photos;
- five rate cards.

The brand is black, white and a little purple. The concept now uses all of these:
- **Six categories, each with Grape's photo as its cover:** studio shoots, on location, corporate, graduation,
  property listing and events.
- **The rates from the cards** (`web/src/lib/grapeRates.ts`, with tests):

  | Category | Rates | Pictures | Images in | Travel around Johannesburg |
  |---|---|---|---|---|
  | Studio shoots | R2 600 for 1 h (2 outfits), R3 400 for 2 h (3 outfits), R6 400 half day, R12 300 full day | 20 to 25 edited an hour | 2 to 4 days | — |
  | On location | R1 800 for 1 h, R2 300 for 2 h, R5 200 half day | Unlimited | 2 to 4 days | R300 to R400 extra |
  | Corporate | R1 800 an hour, R6 500 half day, R9 650 full day | Unlimited | 2 to 4 days | R300 to R400 extra |
  | Graduation | R1 500 for 1 h, R2 300 for 2 h, R5 200 half day | Unlimited | 2 to 4 days | R300 to R400 extra |
  | Property listing | R800 a unit | No limit | 1 to 2 days | R300 to R450 extra |
  | Events | Quoted only | — | — | — |

- **A custom rate in every category,** for tailored work.
- **A 50% non-refundable deposit** holds the date, and the rest is paid on the day.

The banking details printed on the rate cards are deliberately kept off the website. They belong in a booking
confirmation sent to a client, not on a public page.

To check with Grape Studios:
- On location and graduation both charge R2 300 for 2 hours and R5 200 for a half day, but different prices for
  1 hour (R1 800 and R1 500). Is that intended?
- The cards give two social handles, @grape.studios_ and @grape.the.creator. Which one goes on the site?
- Which photo goes with which category? This mapping is TEBOS's choice:
  - the red-carpet photo for corporate;
  - the balloon arch for events;
  - the lounge for property.
- Do the people in the photos agree to them being used on the platform?

## What is needed before the client build

- ~~Categories, prices, photos, logo and colours~~ (received 1 Nov). Still needed: availability (days and hours), cancellation and rescheduling rules beyond the deposit, and the answers above.
- Their plan with TEBOS: a paid package, or the equity programme (ADR 0013), if they qualify.
- The signed client agreement (`docs/drafts/client-service-agreement.md`, once the attorney approves it).
- For stage 3: the founder's choice of AI provider and a monthly budget.

## Tests

- `web/src/lib/grade.test.ts`: the looks and the reference match.
- `web/e2e/work.spec.ts`: the labels; booking books nothing; editing makes no network request.
