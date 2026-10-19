-- The agent's office (TEPOS, Real Estate Job portal; ROADMAP priority 3), slice 1: every listing, buyer and
-- seller with its next step and date (founder, 17 Oct 2026).
--
-- The agency's principal has not yet said whether client details may be kept outside the agency's own
-- system (operator log, decision 12), and POPIA comes first. So nothing here identifies a person:
--   * People are references only (B-001, S-001, ...) with a short description, never a name or contact.
--   * Text that looks like an email address, a South African phone number or an ID number is refused.
--   * Secret-shaped text is refused too (looks_secret).
--
-- The rules (mirrored in src/domain/agent.ts):
--   * Nothing open is left without a next step and its date; anything closed says how it ended.
--   * A stage change is timestamped. References and creation are fixed.
--   * A contact's listing is in the same organisation.
--   * Records live only in a private organisation, read and written only by its owner in a session that
--     passed two-step sign-in. The audit trail is redacted (who changed which fields, and when), so a
--     deleted record is really gone.

create function tebos_private.looks_personal(p_text text) returns boolean
language sql immutable set search_path = '' as $$
  select p_text is not null and (
       p_text ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'
    or p_text ~ '(\+27|\m0)[ -]?[1-9][0-9][ -]?[0-9]{3}[ -]?[0-9]{4}\M'
    or p_text ~ '\m[0-9]{13}\M'
  )
$$;

create table public.agent_listings (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organisations (id) on delete cascade,
  ref             text not null,
  label           text not null check (length(trim(label)) between 1 and 160),
  deal            text not null default 'sale' check (deal in ('sale', 'rental')),
  stage           text not null default 'prospect' check (stage in ('prospect', 'mandate', 'marketed', 'under_offer', 'agreed', 'completed', 'withdrawn', 'lost')),
  price           numeric check (price is null or price >= 0),
  mandate         text check (mandate in ('sole', 'open')),
  mandate_ends_on date,
  next_step       text check (next_step is null or length(next_step) <= 300),
  next_step_on    date,
  outcome         text check (outcome is null or length(outcome) <= 1000),
  note            text check (note is null or length(note) <= 1000),
  stage_at        timestamptz not null default now(),
  created_by      uuid references auth.users (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (org_id, ref),
  unique (id, org_id),
  check (stage in ('completed', 'withdrawn', 'lost')
         or (length(trim(coalesce(next_step, ''))) > 0 and next_step_on is not null)),
  check (stage not in ('completed', 'withdrawn', 'lost') or length(trim(coalesce(outcome, ''))) > 0)
);
create index agent_listings_org_idx on public.agent_listings (org_id, next_step_on);

create table public.agent_contacts (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organisations (id) on delete cascade,
  ref          text not null,
  role         text not null check (role in ('buyer', 'seller', 'tenant', 'landlord')),
  label        text not null check (length(trim(label)) between 1 and 160),
  listing_id   uuid,
  source       text check (source in ('portal', 'referral', 'board', 'walk_in', 'social', 'other')),
  stage        text not null default 'new' check (stage in ('new', 'contacted', 'viewing', 'offer', 'agreed', 'completed', 'lost')),
  next_step    text check (next_step is null or length(next_step) <= 300),
  next_step_on date,
  outcome      text check (outcome is null or length(outcome) <= 1000),
  note         text check (note is null or length(note) <= 1000),
  stage_at     timestamptz not null default now(),
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (org_id, ref),
  foreign key (listing_id, org_id) references public.agent_listings (id, org_id) on delete set null (listing_id),
  check (stage in ('completed', 'lost')
         or (length(trim(coalesce(next_step, ''))) > 0 and next_step_on is not null)),
  check (stage not in ('completed', 'lost') or length(trim(coalesce(outcome, ''))) > 0)
);
create index agent_contacts_org_idx on public.agent_contacts (org_id, next_step_on);

create function tebos_private.guard_agent_record() returns trigger
language plpgsql set search_path = '' as $$
declare
  v jsonb := to_jsonb(new);
  k text;
  v_prefix text;
  v_n integer;
begin
  if not tebos_private.is_private_org(new.org_id) then
    raise exception 'the agent''s office lives only in a private organisation' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
  end if;
  foreach k in array array['label', 'next_step', 'outcome', 'note'] loop
    if tebos_private.looks_secret(v ->> k) then
      raise exception 'this looks like a password, key or token; secrets are never stored here'
        using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    if tebos_private.looks_personal(v ->> k) then
      raise exception 'no contact details or ID numbers here until the agency allows it: use the reference'
        using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
  end loop;
  if tg_op = 'INSERT' then
    -- the reference is the next number for its kind: L-001 for listings, B-/S-/T-/O- for contacts
    v_prefix := case when tg_table_name = 'agent_listings' then 'L'
                     else case v ->> 'role' when 'buyer' then 'B' when 'seller' then 'S' when 'tenant' then 'T' else 'O' end end;
    if tg_table_name = 'agent_listings' then
      select coalesce(max(substring(ref from 3)::integer), 0) + 1 into v_n
        from public.agent_listings where org_id = new.org_id and ref ~ '^L-[0-9]+$';
    else
      select coalesce(max(substring(ref from 3)::integer), 0) + 1 into v_n
        from public.agent_contacts where org_id = new.org_id and ref ~ ('^' || v_prefix || '-[0-9]+$');
    end if;
    new.ref := v_prefix || '-' || lpad(v_n::text, 3, '0');
    new.stage_at := now();
    if tebos_private.is_client() then
      new.created_by := auth.uid();
    end if;
    return new;
  end if;
  if new.ref is distinct from old.ref or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'a record''s reference and creation are fixed' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  if tg_table_name = 'agent_contacts' and (v ->> 'role') is distinct from (to_jsonb(old) ->> 'role') then
    raise exception 'a contact''s role is fixed: add a new contact instead' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  if new.stage is distinct from old.stage then
    new.stage_at := now();
  else
    new.stage_at := old.stage_at;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['agent_listings', 'agent_contacts'] loop
    execute format('create trigger guard_agent_record before insert or update on public.%I for each row execute function tebos_private.guard_agent_record()', t);
    execute format('create trigger touch before update on public.%I for each row execute function tebos_private.touch_updated_at()', t);
    execute format('create trigger freeze_tenant_keys before update on public.%I for each row execute function tebos_private.freeze_tenant_keys()', t);
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function tebos_private.audit_row_redacted()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format($p$create policy owner_all on public.%I for all to authenticated
                      using (tebos_private.has_role(org_id, array['org_admin']) and tebos_private.two_step())
                      with check (tebos_private.has_role(org_id, array['org_admin']) and tebos_private.two_step())$p$, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
