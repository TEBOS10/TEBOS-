-- Channel referrals (founder, 7 Nov 2026; ADR 0025). The founder works through three channels:
-- Pelser Real Estate (employer, property sales and lettings), Real Estate Assist (specialist landlord services, a
-- referral partner) and Tidy Enterprise (property finance and business architecture). When a landlord or other party
-- met in the agency's work needs help the agency doesn't give, it may be referred on, but only through a record that
-- proves the boundaries were kept:
--   * The person agreed to be introduced, and how and when that was recorded. Nothing goes further without it.
--   * Real Estate Assist: no introduction until the written referral arrangement is on record (its reference).
--   * Tidy Enterprise: someone met through the agency is not Tidy Enterprise's pipeline. No introduction until the
--     agency's written permission is on record (its reference). A lead that is the founder's own says so.
--   * Fees: only whether one is agreed in writing, and where. No amounts; money is the founder's decision.
--   * Like the rest of the agent's office: private organisation, owner only in a two-step session, references not
--     people (no contact details, ID numbers or secrets), a redacted audit trail. Nothing is sent from here.
-- The status machine and the checks are mirrored in src/domain/referrals.ts and src/domain/states.ts.

create table public.agent_referrals (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references public.organisations (id) on delete cascade,
  ref                     text not null,
  contact_id              uuid references public.agent_contacts (id) on delete set null,
  destination             text not null check (destination in ('real_estate_assist', 'tidy_enterprise')),
  via_agency              boolean not null default true,
  problem                 text not null check (length(btrim(problem)) between 5 and 600),
  status                  text not null default 'identified',
  consent_on              date,
  consent_how             text check (consent_how in ('in_writing', 'email', 'message', 'verbal_noted')),
  agency_permission_ref   text check (agency_permission_ref is null or length(btrim(agency_permission_ref)) between 3 and 300),
  partner_terms_ref       text check (partner_terms_ref is null or length(btrim(partner_terms_ref)) between 3 and 300),
  fee_terms               text not null default 'not_agreed' check (fee_terms in ('none', 'agreed_in_writing', 'not_agreed')),
  fee_terms_ref           text check (fee_terms_ref is null or length(btrim(fee_terms_ref)) between 3 and 300),
  next_step               text check (next_step is null or length(next_step) <= 300),
  next_step_on            date,
  outcome                 text check (outcome is null or length(outcome) <= 1000),
  note                    text check (note is null or length(note) <= 1000),
  status_at               timestamptz not null default now(),
  created_by              uuid references auth.users (id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (org_id, ref),
  -- open: a next step and its date; closed: how it ended
  check (status in ('declined', 'resolved', 'not_resolved', 'withdrawn')
         or (length(btrim(coalesce(next_step, ''))) > 0 and next_step_on is not null)),
  check (status not in ('declined', 'resolved', 'not_resolved', 'withdrawn') or length(btrim(coalesce(outcome, ''))) >= 3),
  -- consent before anything moves
  check (status in ('identified', 'withdrawn') or (consent_on is not null and consent_how is not null)),
  -- no introduction without the written basis for it
  check (status in ('identified', 'consent_given', 'withdrawn')
         or destination <> 'real_estate_assist' or partner_terms_ref is not null),
  check (status in ('identified', 'consent_given', 'withdrawn')
         or destination <> 'tidy_enterprise' or not via_agency or agency_permission_ref is not null),
  check (fee_terms <> 'agreed_in_writing' or fee_terms_ref is not null),
  -- a person from the agency's book is always "via the agency"
  check (contact_id is null or via_agency)
);
create index agent_referrals_org_idx on public.agent_referrals (org_id, next_step_on);

insert into public.state_transitions (machine, from_state, to_state) values
  ('channel_referral', '(initial)', 'identified'),
  ('channel_referral', 'identified', 'consent_given'),
  ('channel_referral', 'identified', 'withdrawn'),
  ('channel_referral', 'consent_given', 'introduced'),
  ('channel_referral', 'consent_given', 'withdrawn'),
  ('channel_referral', 'introduced', 'accepted'),
  ('channel_referral', 'introduced', 'declined'),
  ('channel_referral', 'introduced', 'withdrawn'),
  ('channel_referral', 'accepted', 'served'),
  ('channel_referral', 'accepted', 'withdrawn'),
  ('channel_referral', 'served', 'resolved'),
  ('channel_referral', 'served', 'not_resolved');

create function tebos_private.guard_agent_referral() returns trigger
language plpgsql set search_path = '' as $$
declare
  v jsonb := to_jsonb(new);
  k text;
  v_n integer;
begin
  if not tebos_private.is_private_org(new.org_id) then
    raise exception 'the agent''s office lives only in a private organisation' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
  end if;
  foreach k in array array['problem', 'next_step', 'outcome', 'note', 'agency_permission_ref', 'partner_terms_ref', 'fee_terms_ref'] loop
    if tebos_private.looks_secret(v ->> k) then
      raise exception 'this looks like a password, key or token; secrets are never stored here'
        using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    if tebos_private.looks_personal(v ->> k) then
      raise exception 'no contact details or ID numbers here: use the reference'
        using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
  end loop;
  if new.consent_on is not null and new.consent_on > current_date then
    raise exception 'consent is recorded once it has been given, not in advance' using errcode = 'P0001', hint = 'TEBOS_CONSENT_REQUIRED';
  end if;
  if new.status not in ('identified', 'withdrawn') and (new.consent_on is null or new.consent_how is null) then
    raise exception 'record when and how the person agreed to be introduced first' using errcode = 'P0001', hint = 'TEBOS_CONSENT_REQUIRED';
  end if;
  if new.contact_id is not null
     and not exists (select 1 from public.agent_contacts c where c.id = new.contact_id and c.org_id = new.org_id) then
    raise exception 'the contact is not in this office' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
  end if;
  if tg_op = 'INSERT' then
    select coalesce(max(substring(ref from 3)::integer), 0) + 1 into v_n
      from public.agent_referrals where org_id = new.org_id and ref ~ '^R-[0-9]+$';
    new.ref := 'R-' || lpad(v_n::text, 3, '0');
    new.status_at := now();
    if tebos_private.is_client() then
      new.created_by := auth.uid();
    end if;
    return new;
  end if;
  if new.ref is distinct from old.ref or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'a record''s reference and creation are fixed' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  if new.destination is distinct from old.destination or new.via_agency is distinct from old.via_agency then
    raise exception 'where a referral goes, and whether it came through the agency, are fixed: add a new referral instead'
      using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  if old.status <> 'identified' and (new.consent_on is distinct from old.consent_on or new.consent_how is distinct from old.consent_how) then
    raise exception 'recorded consent is fixed once the referral has moved on' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  if new.status is distinct from old.status then
    new.status_at := now();
  else
    new.status_at := old.status_at;
  end if;
  return new;
end $$;

create trigger guard_agent_referral before insert or update on public.agent_referrals
  for each row execute function tebos_private.guard_agent_referral();
create trigger guard_status before insert or update on public.agent_referrals
  for each row execute function tebos_private.guard_status('channel_referral');
create trigger touch before update on public.agent_referrals
  for each row execute function tebos_private.touch_updated_at();
create trigger freeze_tenant_keys before update on public.agent_referrals
  for each row execute function tebos_private.freeze_tenant_keys();
create trigger audit after insert or update or delete on public.agent_referrals
  for each row execute function tebos_private.audit_row_redacted();

alter table public.agent_referrals enable row level security;
revoke all on public.agent_referrals from anon, authenticated;
create policy owner_all on public.agent_referrals for all to authenticated
  using (tebos_private.has_role(org_id, array['org_admin']) and tebos_private.two_step())
  with check (tebos_private.has_role(org_id, array['org_admin']) and tebos_private.two_step());
grant select, insert, update, delete on public.agent_referrals to authenticated;
grant all on public.agent_referrals to service_role;
