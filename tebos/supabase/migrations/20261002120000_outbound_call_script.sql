-- The playbook's call script becomes an outbound script (cold calls, the waiting
-- list as a close, voicemail, POPIA), and five more objection answers.
-- Prices stay {{placeholders}}, filled from the plan terms.

update public.sales_playbook set title='Outbound call script', body=$pb$Outbound: you are calling someone who didn't ask to hear from you. Earn the next 60 seconds, then the next 10 minutes. The call is free because it is about **them**; the diagnostic is paid. Never walk through how TEBOS builds a board, never send documents, and never do a "quick assessment" on the call.

**Your goal on every call is one of three outcomes:**
1. They pay for the {{starter_name}} (best).
2. They join the waiting list at tebos-demo.vercel.app/waitlist (good: they're in the pipeline, and TEBOS starts by itself once they're accepted).
3. A booked follow-up with a date and time in both diaries.

"I'll think about it" with no date is not an outcome.

## Before you dial (2 minutes)

- Open their website. Note one specific thing: a recent hire, a new branch, an award, how many services they sell.
- Know their segment's pain (see "Who to sell to"). Agencies: work stuck waiting for approval. Firms: partner-dependent client work. Trades and logistics: jobs and quotes living in the owner's phone.
- Ask for the owner, founder or managing director by name if the website gives it.

## Getting past the front desk

"Hi, it's [your name] from TEBOS. Could you put me through to [name]? It's about how work gets handed over in the business. It's a short call."

If asked "What is it regarding?": "We help owner-run businesses stop routing everything through the owner. I'd like two minutes to see if it's relevant. When is [name] usually free?"

Get a name and a time, and thank them. The front desk is not the place to pitch.

## Opening (first 20 seconds)

"Hi [name], it's [your name] from TEBOS. I'll be honest: this is a cold call. Can I take 30 seconds to tell you why I called, and you tell me if it's worth a conversation?"

If yes: "We work with [agencies / firms / businesses] around your size where the business has grown but still runs through the owner: leads, prices, approvals, handovers. I noticed [their specific thing]. Usually that's the point where the owner becomes the bottleneck. Is that true for you, or have you got that solved?"

Then stop talking.

## Discovery (ask, then be quiet)

- "Walk me through what happens when a new client says yes. Who does what?"
- "What still has to come to you personally before it can happen?"
- "Where does that live today: a system, or someone's head or phone?"
- "When you were last away for a week, what slowed down or went wrong?"
- "Which tools and suppliers do you already pay for? Do they talk to each other?"
- "If this was fixed, what would you do with the time?"
- "Who else would be part of a decision like this?"

Write their words down. You'll use them in the bridge.

## Bridge to TEBOS

"What you've described ([their words]) is the most common thing we see: the business grew, but the structure stayed in your head. TEBOS maps how your business really runs and shows you where it depends on you. Then we build and run the structure so it doesn't.

It's fast. Your draft operating system is on your board in the first day, and we confirm it with you by day three. After that you're measured on your real numbers, not on promises."

## Close: ask for the outcome

**Payment close (they're the decision-maker and the pain is clear):**
"The way to start is the {{starter_name}} at {{starter_fee}}. I'll have the payment link sent to you now; once it's paid the agreement comes straight through, and TEBOS starts on your business the same day. Which email should it go to?"

**Waiting-list close (interested, but not ready to pay today):**
"We take on a limited number of businesses at a time. Join the waiting list now (it takes two minutes at tebos-demo.vercel.app/waitlist) and pick your kind of business. When we accept you, TEBOS starts by itself. Can you do it while we're on the phone?"

**Follow-up close (another decision-maker, or timing):**
"Let's put 15 minutes in the diary with [other person]. Does Tuesday at 10 or Thursday at 2 work better?" Send the invite before you move to the next call.

## Voicemail (under 20 seconds)

"Hi [name], [your name] from TEBOS. I'm calling because businesses like [company] often find everything still runs through the owner. We fix that in days, not months. I'll try you again on [day]. If you'd rather, the waiting list is at tebos-demo.vercel.app/waitlist."

Try three times over two weeks, at different times of day, then close the lead with a reason.

## Respect and the law (POPIA)

- If they say "don't call me again" or "take me off your list", agree straight away, apologise for the interruption, and mark the lead closed with "asked not to be contacted". Never contact them again on any channel.
- Calls by a person are fine. Do **not** add anyone to an email or SMS campaign unless they have said yes to it. A one-to-one email after a call they took is fine.
- Never record a call without telling them first.
- If they ask where you got their number: "From your company's public website."

## After every call (2 minutes)

Log the outcome on the lead in the Pipeline: paid link sent, waiting list, follow-up booked (with the date), or closed (with a reason). A lead with no next step and no reason is a lost lead.$pb$ where key='calls';
update public.sales_playbook set body = body || $pb$
## "I'm busy." / "Not a good time."

"Understood. That's usually the problem we fix. When's a better 10 minutes: tomorrow morning or Thursday afternoon?" Book it, then hang up.

## "Just send me an email."

"I will. So it's useful and not just another email: what's the one thing that eats most of your week right now?" Then send one short email that uses their answer, with the waiting-list link.

## "We're too small." / "We're too big."

Too small: "Most of the businesses we work with are 5 to 50 people, which is exactly when the owner becomes the bottleneck." Too big: "Then we'd start with the {{company_name}}: a {{company_diagnostic_fee}} Company Diagnostic first, then department by department."

## "How long does it take?"

"Your draft operating system is on your board on day one, and it's confirmed with you by day three. Then we run it with you month by month."

## "Not interested."

"Fair enough. Can I ask: is it that it's not a problem for you, or not a priority right now?" If it's not a problem, thank them and close the lead. If it's not a priority, offer the waiting list and move on.$pb$ where key='objections' and body not like '%"Not interested."%';
