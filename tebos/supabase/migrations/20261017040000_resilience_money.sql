-- Strategic Resilience, slice 1: financial resilience in the founder's private
-- organisation (docs/resilience/blueprint.md; founder's answers, 17 Oct 2026:
-- inside TEBOS for free, only the founder, personal vaults later).
--
-- Private organisations:
--   * An organisation is private from creation (create_private_organisation)
--     and stays private. It has exactly one member, its creator, as org_admin:
--     no invitations, no second member, whatever path tries (threat model T1).
--   * Resilience records live only in private organisations.
--
-- Money items (mirrored in src/domain/resilience.ts):
--   * Unknown is not zero: an item may be recorded without an amount.
--   * Reliable income is verified and names its document; trading income and
--     lump sums are always speculative. Fields belong to their kind.
--   * Secret-shaped text (keys, tokens, "password: …") is refused (T10).
--   * Auditing is redacted: the trail records who changed which fields and
--     when, never the amounts or text, so a deleted record is really gone (T7).
--   * Only the organisation's admin (its one member) reads or writes them.

alter table public.organisations add column private boolean not null default false;

create function tebos_private.guard_organisation_private() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.private is distinct from old.private then
    raise exception 'whether an organisation is private is set when it is created'
      using errcode = 'P0001', hint = 'TEBOS_TENANT_KEY_FROZEN';
  end if;
  return new;
end $$;
create trigger guard_private before update on public.organisations
  for each row execute function tebos_private.guard_organisation_private();

create function tebos_private.is_private_org(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select private from public.organisations where id = p_org), false)
$$;

-- one member, its admin; nobody else, by any path
create function tebos_private.guard_private_membership() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tebos_private.is_private_org(new.org_id) then
    if new.role <> 'org_admin' or exists (
      select 1 from public.memberships where org_id = new.org_id and user_id <> new.user_id
    ) then
      raise exception 'a private organisation has one member, its owner' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
    end if;
  end if;
  return new;
end $$;
create trigger guard_private_membership before insert or update on public.memberships
  for each row execute function tebos_private.guard_private_membership();

create function tebos_private.guard_private_invitation() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tebos_private.is_private_org(new.org_id) then
    raise exception 'nobody can be invited to a private organisation' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
  end if;
  return new;
end $$;
create trigger guard_private_invitation before insert on public.invitations
  for each row execute function tebos_private.guard_private_invitation();

create function public.create_private_organisation(p_name text, p_slug text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  insert into public.organisations (name, slug, private) values (p_name, p_slug, true) returning id into new_id;
  insert into public.memberships (org_id, user_id, role) values (new_id, auth.uid(), 'org_admin');
  return new_id;
end $$;
revoke execute on function public.create_private_organisation(text, text) from public, anon;
grant execute on function public.create_private_organisation(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Secrets never go into notes
-- ---------------------------------------------------------------------------

create function tebos_private.looks_secret(p_text text) returns boolean
language sql immutable set search_path = '' as $$
  select p_text is not null and (
       p_text ~ '-----BEGIN [A-Z ]*PRIVATE KEY-----'
    or p_text ~ '\y(sk|rk|pk)_(live|test)_[A-Za-z0-9]{8,}'
    or p_text ~ '\yAKIA[0-9A-Z]{16}\y'
    or p_text ~ '\ygh[pousr]_[A-Za-z0-9]{20,}'
    or p_text ~ '\yxox[abprs]-[A-Za-z0-9-]{10,}'
    or p_text ~ '\yeyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.'
    or p_text ~* '\y(password|passwd|pwd|pin|passcode|secret|api[ _-]?key)\s*[:=]\s*\S+'
  )
$$;

-- ---------------------------------------------------------------------------
-- Redacted audit: who changed which fields, and when; never the content
-- ---------------------------------------------------------------------------

create function tebos_private.audit_row_redacted() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_fields text[];
begin
  select coalesce(array_agg(k order by k), '{}') into v_fields
  from (select key as k from jsonb_each(coalesce(v_new, '{}'::jsonb))
        union select key from jsonb_each(coalesce(v_old, '{}'::jsonb))) keys
  where k not in ('id', 'org_id', 'created_at', 'updated_at')
    and (v_new -> k) is distinct from (v_old -> k);
  perform tebos_private.write_audit(
    (v_row ->> 'org_id')::uuid,
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    (v_row ->> 'id')::uuid,
    case when tg_op = 'INSERT' then null else jsonb_build_object('redacted', true) end,
    case when tg_op = 'DELETE' then null else jsonb_build_object('redacted', true, 'fields', to_jsonb(v_fields)) end
  );
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- Money items
-- ---------------------------------------------------------------------------

create table public.res_money_items (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organisations (id) on delete cascade,
  entity       text not null check (entity in ('tidy', 'tidy_capital', 'tidy_enterprise', 'tebos', 'irekun', 'personal')),
  kind         text not null check (kind in ('essential_cost', 'other_cost', 'income', 'reserve', 'debt', 'commitment')),
  label        text not null check (length(trim(label)) between 1 and 160),
  amount       numeric check (amount is null or amount >= 0),
  cadence      text check (cadence in ('daily', 'weekly', 'monthly', 'yearly', 'lump_sum')),
  stream       text check (stream in ('forex_trading', 'tebos_retainer', 'agent_commission', 'pra_retainer', 'other')),
  reliability  text check (reliability in ('reliable', 'speculative')),
  liquid       boolean,
  basis        text not null default 'stated' check (basis in ('verified', 'stated', 'estimated')),
  evidence_ref text check (evidence_ref is null or length(evidence_ref) <= 300),
  due_on       date,
  as_of        date not null default current_date,
  note         text check (note is null or length(note) <= 1000),
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- fields belong to their kind
  check ((kind in ('income', 'essential_cost', 'other_cost')) = (cadence is not null)),
  check (cadence is distinct from 'lump_sum' or kind = 'income'),
  check ((kind = 'income') = (stream is not null)),
  check ((kind = 'income') = (reliability is not null)),
  check ((kind = 'reserve') = (liquid is not null)),
  -- speculative income never counts as cash; reliable income is verified
  check (reliability is distinct from 'reliable'
         or (stream not in ('forex_trading') and cadence <> 'lump_sum' and basis = 'verified')),
  check (basis <> 'verified' or (evidence_ref is not null and length(trim(evidence_ref)) > 0))
);
create index res_money_items_org_idx on public.res_money_items (org_id, kind);

create function tebos_private.guard_res_record() returns trigger
language plpgsql set search_path = '' as $$
declare
  v jsonb := to_jsonb(new);
  k text;
begin
  if not tebos_private.is_private_org(new.org_id) then
    raise exception 'resilience records live only in a private organisation' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
  end if;
  foreach k in array array['label', 'note', 'evidence_ref'] loop
    if tebos_private.looks_secret(v ->> k) then
      raise exception 'this looks like a password, key or token; secrets are never stored here'
        using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
  end loop;
  if tg_op = 'INSERT' and tebos_private.is_client() then
    new.created_by := auth.uid();
  elsif tg_op = 'UPDATE' then
    new.created_by := old.created_by;
  end if;
  return new;
end $$;

create trigger guard_res_record before insert or update on public.res_money_items
  for each row execute function tebos_private.guard_res_record();
create trigger touch before update on public.res_money_items
  for each row execute function tebos_private.touch_updated_at();
create trigger freeze_tenant_keys before update on public.res_money_items
  for each row execute function tebos_private.freeze_tenant_keys();
create trigger audit after insert or update or delete on public.res_money_items
  for each row execute function tebos_private.audit_row_redacted();

alter table public.res_money_items enable row level security;
create policy owner_all on public.res_money_items for all to authenticated
  using (tebos_private.has_role(org_id, array['org_admin']))
  with check (tebos_private.has_role(org_id, array['org_admin']));
grant select, insert, update, delete on public.res_money_items to authenticated;
grant all on public.res_money_items to service_role;
