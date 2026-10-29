-- The daily sales desk: TEBOS's own prospects, researched from public sources, called by a person.
--
-- The founder (27 Oct 2026): "TEBOS sales team must be the one getting clients every day". The desk does the
-- daily work a sales team needs: it keeps a list of businesses worth calling, each with where it was found and why
-- it fits, and it hands a person today's calls. The call itself is made by a person (the founder or an invited
-- salesperson): contacting a business is outward-facing, and South African law (POPIA s69) bars unsolicited
-- electronic marketing (email, SMS, WhatsApp) to anyone who hasn't agreed. A phone call that respects an opt-out
-- is the lawful first contact.
--
-- The rules (mirrored in src/domain/prospects.ts):
--   * Staff only: sales, maintainers and platform admins. No client ever sees the list.
--   * Every prospect says where it was found (an https link) and why it fits. Nothing is invented.
--   * Business details only: the business's own name, website and switchboard number. No personal email, ID numbers
--     or private details in the free text.
--   * "Do not contact" is final: once a business says no to calls, it never comes back onto the list.
--   * Interest, a meeting, or "not interested" needs the outcome written down; becoming an enquiry needs the
--     enquiry it became, so the pipeline takes over from there.
--   * One record per business: the same name and website can't be added twice.

insert into public.state_transitions (machine, from_state, to_state) values
  ('sales_prospect', '(initial)', 'new'),
  ('sales_prospect', 'new', 'no_answer'),
  ('sales_prospect', 'new', 'interested'),
  ('sales_prospect', 'new', 'not_interested'),
  ('sales_prospect', 'new', 'meeting_booked'),
  ('sales_prospect', 'new', 'do_not_contact'),
  ('sales_prospect', 'no_answer', 'interested'),
  ('sales_prospect', 'no_answer', 'not_interested'),
  ('sales_prospect', 'no_answer', 'meeting_booked'),
  ('sales_prospect', 'no_answer', 'do_not_contact'),
  ('sales_prospect', 'interested', 'meeting_booked'),
  ('sales_prospect', 'interested', 'not_interested'),
  ('sales_prospect', 'interested', 'became_enquiry'),
  ('sales_prospect', 'interested', 'do_not_contact'),
  ('sales_prospect', 'meeting_booked', 'interested'),
  ('sales_prospect', 'meeting_booked', 'not_interested'),
  ('sales_prospect', 'meeting_booked', 'became_enquiry'),
  ('sales_prospect', 'meeting_booked', 'do_not_contact'),
  ('sales_prospect', 'not_interested', 'interested'),
  ('sales_prospect', 'not_interested', 'do_not_contact');

create table public.sales_prospects (
  id             uuid primary key default gen_random_uuid(),
  business_name  text not null check (length(btrim(business_name)) between 2 and 120),
  industry       text not null check (length(btrim(industry)) between 2 and 60),
  area           text not null check (length(btrim(area)) between 2 and 80),
  website        text check (website is null or (website ~ '^https://' and length(website) <= 300)),
  phone          text check (phone is null or phone ~ '^\+?[0-9 ()-]{9,20}$'),
  source_url     text not null check (source_url ~ '^https://' and length(source_url) <= 400),
  why_fit        text not null check (length(btrim(why_fit)) between 10 and 600),
  status         text not null default 'new',
  next_call_on   date,
  last_outcome   text check (last_outcome is null or length(last_outcome) <= 600),
  enquiry_id     uuid references public.enquiries (id),
  added_by       text not null default 'staff' check (added_by in ('staff', 'reeds')),
  owner          uuid references auth.users (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (status <> 'became_enquiry' or enquiry_id is not null),
  check (status not in ('interested', 'meeting_booked', 'not_interested') or length(btrim(coalesce(last_outcome, ''))) >= 3),
  check (status <> 'do_not_contact' or next_call_on is null),
  check (not tebos_private.looks_personal(why_fit) and not tebos_private.looks_personal(last_outcome)),
  check (not tebos_private.looks_secret(why_fit) and not tebos_private.looks_secret(last_outcome))
);
create unique index sales_prospects_one_business_idx on public.sales_prospects (lower(btrim(business_name)), coalesce(lower(website), ''));
create index sales_prospects_due_idx on public.sales_prospects (next_call_on) where status in ('new', 'no_answer', 'interested', 'meeting_booked');

create trigger touch before update on public.sales_prospects
  for each row execute function tebos_private.touch_updated_at();
create trigger guard_status before insert or update of status on public.sales_prospects
  for each row execute function tebos_private.guard_status('sales_prospect');
create trigger audit after insert or update or delete on public.sales_prospects
  for each row execute function tebos_private.audit_row();

alter table public.sales_prospects enable row level security;
create policy staff_all on public.sales_prospects for all to authenticated
  using (tebos_private.is_staff(array['sales', 'maintainer']))
  with check (tebos_private.is_staff(array['sales', 'maintainer']));
grant select, insert on public.sales_prospects to authenticated;
grant update (status, next_call_on, last_outcome, enquiry_id, owner, phone, website) on public.sales_prospects to authenticated;
grant all on public.sales_prospects to service_role;

-- Today's calls: who is due (South African date), the ones already showing interest first, then new ones, at most
-- p_limit. "Do not contact", "not interested" and finished prospects never appear.
create function public.sales_calls_today(p_limit integer default 10)
returns setof public.sales_prospects
language sql stable security invoker set search_path = '' as $$
  select p.* from public.sales_prospects p
   where p.status in ('new', 'no_answer', 'interested', 'meeting_booked')
     and coalesce(p.next_call_on, tebos_private.sa_today()) <= tebos_private.sa_today()
   order by case p.status when 'meeting_booked' then 0 when 'interested' then 1 when 'no_answer' then 2 else 3 end,
            coalesce(p.next_call_on, p.created_at::date), p.created_at
   limit greatest(1, least(coalesce(p_limit, 10), 50))
$$;
revoke all on function public.sales_calls_today(integer) from public, anon;
grant execute on function public.sales_calls_today(integer) to authenticated, service_role;
