-- The sales playbook, kept in the database so only TEBOS's staff can read
-- it. It is not in the web app's code, which anyone can download.
--
--   * Staff (sales, maintainers, platform admins) read it; nobody else can.
--   * Platform admins edit it in the app, so the material stays current
--     without a release. Each edit is audited.
--   * Prices and deliverables are never typed in here: {{placeholders}} are
--     filled from the same plan terms as the pricing page and every contract
--     (src/domain/plans.ts), so the playbook can't quote a different price.

create table public.sales_playbook (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique check (key ~ '^[a-z][a-z0-9_-]{1,40}$'),
  position   integer not null,
  title      text not null check (length(trim(title)) between 1 and 120),
  body       text not null check (length(body) between 1 and 20000),
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);

create function tebos_private.touch_playbook() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if tebos_private.is_client() then
    new.updated_by := auth.uid();
  end if;
  return new;
end $$;

create trigger touch before insert or update on public.sales_playbook
  for each row execute function tebos_private.touch_playbook();
create trigger audit after insert or update or delete on public.sales_playbook
  for each row execute function tebos_private.audit_row();

alter table public.sales_playbook enable row level security;
revoke all on public.sales_playbook from anon, authenticated;
create policy staff_read on public.sales_playbook for select to authenticated
  using (tebos_private.is_staff(array['sales', 'maintainer']));
create policy admin_write on public.sales_playbook for all to authenticated
  using (tebos_private.is_platform_admin()) with check (tebos_private.is_platform_admin());
grant select, insert, delete on public.sales_playbook to authenticated;
grant update (position, title, body) on public.sales_playbook to authenticated;
grant all on public.sales_playbook to service_role;

-- The first edition.
insert into public.sales_playbook (key, position, title, body) values
  ('what', 10, 'What TEBOS is', $pb$**TEBOS is business operating architecture.** We build how a growing business runs, then run it with them: its objectives, how work flows, who owns each step, and the rules and systems that carry it.

The problem we solve: growing businesses rarely lack tools. They lack structure. The founder is the middleware: leads, prices, handovers and decisions all pass through one person's memory. When the founder is busy, sick or on leave, the business slows down or stops.

What the client gets: a business that is **structurally capable of producing its intended outcomes with less dependence on individual people, memory, improvisation and founder intervention**.

## Say it in one line

"We map how your business really runs, show you where it still runs through you, and then build and run the structure so it doesn't."

## What TEBOS is not

- **Not an AI agency.** AI, automation and integrations are tools we use inside the architecture, where they earn their place, and only with the client's approval.
- **Not another platform that replaces your systems.** The client's existing providers (web studio, bookkeeper, CRM) are pieces on their board, not competitors. We connect to what they already use.
- **Not a consultant's report that sits in a drawer.** Every finding shows its evidence, every change is proposed and approved, and progress is measured on the client's real numbers.$pb$),
  ('who', 20, 'Who to sell to', $pb$## A good fit

- An owner-run business with roughly 5 to 50 people, growing, and feeling it.
- The owner says things like "everything comes to me", "I can't take leave", "we keep dropping handovers", "I hired people but I'm still doing the work".
- They already pay for tools and suppliers (a website, a CRM, a bookkeeper) and still feel disorganised.
- Service businesses do especially well: agencies, consultancies, clinics, sports and talent management, trades with a back office.

## Not a fit (be polite, move on)

- Businesses looking for someone to "do AI" for them, or for a quick website or marketing campaign.
- Anyone who wants a free assessment, a sample report, or "just to see how you do it" before paying.
- Other agencies, consultancies or software builders asking how TEBOS works. They may be researching us. Keep it to what's on the public website.
- Businesses that can't name a decision-maker who will be on the calls.$pb$),
  ('plans', 30, 'Plans and prices', $pb$Prices are fixed. Don't discount, don't bundle, don't promise extras: the contract the client signs lists exactly these deliverables.

## {{starter_name}}: {{starter_fee}}

Where every client starts. We map how the business really runs.

{{starter_deliverables}}

## {{growth_name}}: {{growth_fee}}

For clients ready to have the structure built and run.

{{growth_deliverables}}

## {{equity_name}}: {{equity_share}} equity instead of fees

For strong businesses that can't pay upfront. It needs a valuation and a shareholder agreement, so it takes longer and TEBOS's founders decide each one. Don't promise it: say "you can apply, and the team decides".

{{equity_deliverables}}

## How payment works

- Monthly, in advance, month to month. Either side can end it with 30 days' notice.
- The first month is paid online (card or instant EFT) before anything starts, including the first call.
- Once the payment is confirmed, TEBOS emails the agreement automatically. When the client accepts it, their account is set up and their TEBOS maintainer is assigned.$pb$),
  ('process', 40, 'How a sale works', $pb$You find and qualify the lead. TEBOS does the rest, on proof, so you never chase paperwork.

- **1. Add the lead** on the Pipeline page (Add a lead). It is yours from then on: nobody else can take it.
- **2. Screening.** TEBOS checks every lead automatically: personal email address, no website, a website that doesn't match the email, words that suggest a competitor, repeat enquiries. A flag is a reason to look closer, not a verdict.
- **3. Decide.** Approve or decline. A flagged lead needs a written reason to approve ("Spoke to the owner: a genuine buyer for their own business").
- **4. Payment.** TEBOS creates the payment page and emails it to the client. You'll see when it's sent.
- **5. Agreement.** When the payment is confirmed, TEBOS sends the agreement. The client reads and accepts it online.
- **6. Onboarding.** TEBOS sets up the client's account and invites them. Their maintainer takes over from there.

Your job ends at the payment. You don't send contracts, promise start dates, or set up accounts.$pb$),
  ('calls', 50, 'Call script', $pb$A first conversation takes 15 minutes. It is free because it is about **them**, not a free consultation: you ask, you listen, you explain the plans. The diagnostic itself is paid.

## Opening

"Hi [name], it's [your name] from TEBOS. We help growing businesses stop running everything through the owner. Is now a bad time for ten minutes?"

## Discovery (ask, then be quiet)

- "Walk me through what happens when a new client says yes. Who does what?"
- "What still has to come to you personally before it can happen?"
- "When you were last away for a week, what slowed down or went wrong?"
- "Which tools and suppliers do you already pay for? Do they talk to each other?"
- "If this was fixed a year from now, what would be different?"
- "Who else would be part of a decision like this?"

## Bridge to TEBOS

"What you're describing is common: the business has grown, but the structure is still in your head. TEBOS maps how the business really runs, shows you where it depends on you, and then builds and runs the structure so it doesn't. We start with the {{starter_name}}, at {{starter_fee}}."

## Close

"The next step is the {{starter_name}}. I'll send you the payment link now; once it's paid, the agreement comes straight through and your maintainer arranges your first session. Shall I send it to this email address?"

If they need to think: "Of course. What would you need to see to decide?" Then book a follow-up date before you hang up.$pb$),
  ('messages', 60, 'Message templates', $pb$Copy, then make them personal. Never attach TEBOS documents: link to the public website only.

## First message (email or LinkedIn)

"Hi [name], I noticed [something specific about their business]. Businesses at your stage often find that everything still runs through the owner: leads, prices, handovers. TEBOS maps how your business really runs and builds the structure so it doesn't depend on you. Would a 15-minute call next week be useful? You can see how it works at tebos-demo.vercel.app."

## Follow-up (after 4 working days)

"Hi [name], following up on my note. One question: if you were away for two weeks, what would stop? If the answer is 'quite a lot', it's worth 15 minutes."

## After a good call

"Thanks for the time today, [name]. As discussed, the next step is the {{starter_name}} at {{starter_fee}}. You'll receive the payment link from TEBOS shortly; the agreement follows automatically once it's paid. Here's the plan page: tebos-demo.vercel.app/pricing."

## Polite no

"Thanks for your interest, [name]. From what you've described, TEBOS isn't the right fit right now, and I'd rather tell you that than sell you something you don't need. If things change, I'm happy to talk again."$pb$),
  ('objections', 70, 'Handling objections', $pb$## "It's too expensive."

"Compared to what it costs you now? Think about the hours you spend being the middleware, and the work that stalls when you're away. The {{starter_name}} is month to month: if it's not earning its place, you stop."

## "Can you show me a sample report or do a quick assessment first?"

"The assessment is the product, so it's paid, and the first month is how you try it: month to month, 30 days' notice. What I can show you is the public demo, on a fictional agency: tebos-demo.vercel.app/demo."

## "We already have a CRM / an agency / a consultant."

"Good: they stay. TEBOS doesn't replace your suppliers. They become pieces on your board, with clear owners and handovers, and we connect to the tools you already use."

## "Is this AI?"

"AI is one of the tools we use, where it helps, and only with your approval. What you're buying is the structure: objectives, flows, owners and rules. The technology serves that."

## "What results will we get?"

"We don't promise revenue numbers, and be careful of anyone who does. What we do is set objectives with you and measure them on your real numbers, not estimates, so you'll see exactly what changes."

## "Send me more information."

"Happy to. The plans and what's included are at tebos-demo.vercel.app/pricing. What's the one thing you'd need to know to decide?" Then book the follow-up.

## "Let me think about it."

"Of course. What's the part you're unsure about?" Answer that, then agree a date to speak again.$pb$),
  ('demo', 80, 'Showing TEBOS', $pb$Show only the public demo. It runs on a fictional agency, Brightline Creative, and every name and figure in it is invented. Say so.

- **Start:** tebos-demo.vercel.app/demo
- **1. The business:** what TEBOS knows about the agency, and the evidence behind it.
- **2. The operating board:** objectives, pieces and flows. Point out the steps that depend on the founder.
- **3. A finding:** open one and show its evidence. "Nothing here is an opinion without proof."
- **4. Approvals:** a change is proposed, then approved by a person. "Nothing changes in your business without your say."
- **5. The one-minute tour** is at tebos-demo.vercel.app/tour if they want to watch on their own.

Never share your screen on the pipeline, on a real client's account, or anywhere else inside TEBOS.$pb$),
  ('rules', 90, 'Rules: what never to do', $pb$These protect our clients, and TEBOS. Breaking them ends the arrangement.

- **Nothing of value before payment.** No free diagnostic, no call to map their business, no sample report, no board, no templates. Discovery questions are fine; working on their business is not.
- **No promised results.** Don't promise revenue, savings or growth figures, or dates for outcomes.
- **Don't call TEBOS an AI agency**, or promise to "automate everything".
- **No discounts, side deals or custom terms.** The price and deliverables are the ones on the plan; the contract says so.
- **No internal material leaves TEBOS.** Not this playbook, not the pipeline, not screenshots, not clients' names or details. The public website and the demo are all you share.
- **Watch for competitors.** Agencies, consultants or software builders asking how TEBOS works, what we use, or for our templates: keep it to the public website, and say so in the decision note when you decide on the lead.
- **Client data is private.** Our clients are confidential, and personal information is handled under POPIA. Don't name clients to prospects.
- **Don't handle money.** Clients only pay through TEBOS's payment page (or an EFT that an admin confirms). Never take payment yourself.$pb$);
