# ADR 0020: The AI crew, and publishing consent at intake

Date: 2026-11-01 · Status: built; live when the founder approves the migration (operator log, decision 38) and the
worker has a reasoning key (decision 36 for Grok).

## Context

The founder, on 1 Nov: Grape Studios' "roles are done by hyper efficient agents from grok and Teboho overseas whilst
TEBOS handles the technology. The agents must work in teams and must have day and night shift agents. And yes before
publishing clients work there will be a disclose or consent that clients must acknowledge during the intake."

The standing rules apply:
- AI may draft, remind, coordinate and recommend.
- It must not send external communications, make payments, change legal terms or publish on its own.
- Founder approval is needed for outward-facing communications. For a client's business, that approval is the
  client's admin's.

## Decision

Migration `20261102170000_ai_crew.sql`; domain `src/domain/aiCrew.ts`; worker `src/crew/`; page TEBOS → Crew.

1. **Agents in teams and shifts.**
   - Each agent belongs to one team (bookings, admin, social) and one shift: day 06:00 to 18:00, night 18:00 to
     06:00, South African time.
   - Only the business's admins add agents, or pause and resume them. Agents are never deleted, for the record.
   - TEBOS → Crew shows the roster, who is on duty now, and any team without someone on a shift.
2. **Work arrives by itself.** Each step of a booking queues the next piece of work for the team that does it, when
   that team has an active agent:
   - a request queues a reply;
   - a confirmation queues a call sheet;
   - a shoot marked done with a balance owed queues a reminder;
   - a delivery the customer agreed to publish queues a caption.

   The brief carries what the work needs (the reference, service, time and the customer's own brief). It never
   carries an email address or phone number. The agent sees the customer's first name only.
3. **Agents draft; people decide.**
   - The worker drafts each piece through TEBOS's reasoning provider: Grok when `XAI_API_KEY` is set (ADR 0017).
     The team's agent on shift is named on the draft.
   - Only a signed-in admin of the business approves or rejects a draft. The worker can't, and neither can an
     operator. Anyone on the team may edit it first.
   - A person sends the approved draft themselves, then records how.
   - Drafts are checked for secrets, and a decided draft can't be edited.
4. **Agents never shoot.** A booking's photographer is always a person (ADR 0018).
5. **Publishing consent at intake.**
   - Grape's booking form explains where photos may appear (website, Instagram, Behance), without contact details,
     and that a customer can change their mind.
   - The customer must answer yes or no; the database refuses a request without an answer. The answer and its time
     are kept on the booking.
   - Social work (captions, posts) can only be created for a shoot whose customer said yes.

## Not done

- **Changing a publishing answer after booking.** Today it's by email to the studio. A self-service switch on the
  customer's page is next.
- **Sending from TEBOS** (email, WhatsApp, Instagram). That needs the sending setup (decision 2). Even then, sending
  stays a person's approved act.
- **Agents for editing photos.** That needs an image provider and a budget (ADR 0015).
