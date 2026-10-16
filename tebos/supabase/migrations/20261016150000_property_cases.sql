-- Property Revenue Architecture (Tidy Enterprise): the first milestone, a
-- reliable single-case workflow from intake to a decision-ready assessment
-- (founder's dossier and build brief, 16 Oct 2026; docs/property-revenue-architecture.md).
--
-- The rules that protect the assessment's integrity live here, mirrored in
-- src/domain/property.ts:
--   * Unknown is not zero: a figure that wasn't supplied has no row.
--   * Every figure says what it is (verified, owner-reported, estimated). A
--     verified figure names evidence from the same case that was checked.
--     Forecasts are always estimates. Values are never negative.
--   * A disposition always carries its reason and is timestamped when it
--     changes; PROCEED needs the owner's authority confirmed.
--   * At most one recommended pathway per case, and it explains itself.
--   * Gates pass in order, with an owner and evidence; the evidence gate needs
--     authority confirmed and no conflicting evidence; a gate can't reopen
--     while a later one stands passed.
--   * Every change is audited (audit_row), so a changed figure or disposition
--     keeps its history. Members read; admins and operators write.

create table public.property_cases (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organisations (id) on delete cascade,
  ref                text not null,
  label              text not null check (length(trim(label)) between 1 and 160),
  property_type      text check (property_type in ('residential_multi', 'single_residential', 'mixed_use', 'commercial', 'other')),
  problem            text not null check (problem in ('underperforming_income', 'arrears_distress', 'underutilised', 'unclear_strategy')),
  objective          text not null check (objective in ('improve_cash_flow', 'resolve_arrears', 'long_term_value', 'release_capital')),
  suspected_cause    text not null default 'unknown' check (suspected_cause in ('unknown', 'collection', 'vacancy', 'pricing', 'expenses', 'debt')),
  authority          text not null default 'unconfirmed' check (authority in ('unconfirmed', 'confirmed', 'issue')),
  authority_note     text check (authority_note is null or length(authority_note) <= 1000),
  constraints        text check (constraints is null or length(constraints) <= 4000),
  desired_outcome    text check (desired_outcome is null or length(desired_outcome) <= 2000),
  disposition        text not null default 'hold_optimise' check (disposition in ('proceed', 'nurture', 'hold_optimise', 'do_nothing', 'reject')),
  disposition_reason text not null check (length(trim(disposition_reason)) between 10 and 2000),
  disposition_at     timestamptz not null default now(),
  created_by         uuid references auth.users (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (org_id, ref),
  unique (id, org_id),
  check (disposition <> 'proceed' or authority = 'confirmed')
);
create index property_cases_org_idx on public.property_cases (org_id, updated_at desc);

create table public.property_evidence (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  case_id       uuid not null,
  category      text not null check (category in ('income', 'expenses_debt', 'asset_operations', 'market', 'authority')),
  kind          text not null check (kind ~ '^[a-z][a-z_]{1,39}$'),
  title         text not null check (length(trim(title)) between 1 and 200),
  source        text check (source is null or length(source) <= 300),
  period_start  date,
  period_end    date,
  received_on   date,
  responsible   text check (responsible is null or length(responsible) <= 120),
  status        text not null default 'missing' check (status in ('missing', 'requested', 'received', 'checked', 'conflicting')),
  confidence    text check (confidence in ('high', 'medium', 'low')),
  document_ref  text check (document_ref is null or length(document_ref) <= 500),
  notes         text check (notes is null or length(notes) <= 2000),
  follow_up     text check (follow_up is null or length(follow_up) <= 1000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (case_id, org_id) references public.property_cases (id, org_id) on delete cascade,
  unique (id, case_id),
  check (period_start is null or period_end is null or period_start <= period_end),
  check (status not in ('received', 'checked', 'conflicting') or received_on is not null),
  check (status <> 'checked' or (source is not null and length(trim(source)) > 0 and confidence is not null)),
  check (status <> 'conflicting' or (notes is not null and length(trim(notes)) > 0))
);
create index property_evidence_case_idx on public.property_evidence (case_id);

create table public.property_figures (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  case_id      uuid not null,
  key          text not null check (key in ('units', 'vacant_units', 'scheduled_rent', 'other_income', 'vacancy_loss', 'rent_due',
                 'rent_collected', 'operating_expenses', 'debt_service', 'reserve', 'one_off_capex', 'uplift', 'implementation_cost', 'downside_impact')),
  value        numeric not null check (value >= 0),
  basis        text not null check (basis in ('verified', 'owner_reported', 'estimated')),
  evidence_id  uuid,
  as_of        date not null,
  note         text check (note is null or length(note) <= 1000),
  recorded_by  uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (case_id, key),
  foreign key (case_id, org_id) references public.property_cases (id, org_id) on delete cascade,
  foreign key (evidence_id, case_id) references public.property_evidence (id, case_id),
  check (basis <> 'verified' or evidence_id is not null),
  check (key not in ('uplift', 'implementation_cost', 'downside_impact') or basis = 'estimated'),
  check (key not in ('units', 'vacant_units') or value = trunc(value))
);

create table public.property_pathways (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null,
  case_id          uuid not null,
  pathway          text not null check (pathway in ('keep_optimise', 'stabilise_resolve', 'refinance_capital', 'develop_convert', 'sell_redeploy', 'exit_resolve', 'do_nothing')),
  status           text not null default 'considered' check (status in ('considered', 'recommended', 'rejected')),
  rationale        text check (rationale is null or length(rationale) <= 2000),
  why_preferred    text check (why_preferred is null or length(why_preferred) <= 2000),
  evidence_summary text check (evidence_summary is null or length(evidence_summary) <= 2000),
  cost_once_off    numeric check (cost_once_off is null or cost_once_off >= 0),
  timeline         text check (timeline is null or length(timeline) <= 300),
  risks            text check (risks is null or length(risks) <= 2000),
  specialists      text[] not null default '{}' check (specialists <@ array['letting', 'accounting', 'legal', 'technical', 'lender']),
  downside         text check (downside is null or length(downside) <= 2000),
  disqualifiers    text check (disqualifiers is null or length(disqualifiers) <= 2000),
  decision_owner   text check (decision_owner is null or length(decision_owner) <= 120),
  would_change     text check (would_change is null or length(would_change) <= 2000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (case_id, pathway),
  foreign key (case_id, org_id) references public.property_cases (id, org_id) on delete cascade,
  check (status <> 'recommended' or (
    length(trim(coalesce(rationale, ''))) > 0 and length(trim(coalesce(why_preferred, ''))) > 0
    and length(trim(coalesce(evidence_summary, ''))) > 0 and length(trim(coalesce(decision_owner, ''))) > 0
    and length(trim(coalesce(would_change, ''))) > 0)),
  check (status <> 'rejected' or length(trim(coalesce(rationale, ''))) > 0)
);
create unique index property_pathways_one_recommended on public.property_pathways (case_id) where status = 'recommended';

create table public.property_gates (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  case_id     uuid not null,
  gate        text not null check (gate in ('evidence', 'root_cause', 'feasibility', 'authorisation', 'outcome')),
  status      text not null default 'not_started' check (status in ('not_started', 'in_progress', 'passed', 'blocked')),
  owner       text check (owner is null or length(owner) <= 120),
  note        text check (note is null or length(note) <= 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (case_id, gate),
  foreign key (case_id, org_id) references public.property_cases (id, org_id) on delete cascade,
  check (status <> 'passed' or (length(trim(coalesce(owner, ''))) > 0 and length(trim(coalesce(note, ''))) > 0)),
  check (status <> 'blocked' or length(trim(coalesce(note, ''))) > 0)
);

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------
create function tebos_private.guard_property_case() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_n integer;
begin
  if tg_op = 'INSERT' then
    -- the case reference is the organisation's next number: PA-001, PA-002, ...
    select coalesce(max(substring(ref from 4)::integer), 0) + 1 into v_n
      from public.property_cases where org_id = new.org_id and ref ~ '^PA-[0-9]+$';
    new.ref := 'PA-' || lpad(v_n::text, 3, '0');
    new.disposition_at := now();
    if tebos_private.is_client() then
      new.created_by := auth.uid();
    end if;
    return new;
  end if;
  if new.ref is distinct from old.ref or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'a case''s reference and creation are fixed' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  if new.disposition is distinct from old.disposition then
    if new.disposition_reason is not distinct from old.disposition_reason then
      raise exception 'a change of disposition needs its own reason' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    new.disposition_at := now();
  elsif new.disposition_at is distinct from old.disposition_at then
    new.disposition_at := old.disposition_at;
  end if;
  return new;
end $$;

create function tebos_private.guard_property_figure() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_status text;
begin
  if new.evidence_id is not null then
    select status into v_status from public.property_evidence where id = new.evidence_id and case_id = new.case_id;
    if new.basis = 'verified' and v_status is distinct from 'checked' then
      raise exception 'only evidence marked checked can verify a figure' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
  end if;
  if tebos_private.is_client() then
    new.recorded_by := auth.uid();
  end if;
  return new;
end $$;

-- evidence that verifies a figure can't quietly stop being checked
create function tebos_private.guard_property_evidence() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status = 'checked' and new.status <> 'checked'
     and exists (select 1 from public.property_figures where evidence_id = old.id and basis = 'verified') then
    raise exception 'this evidence verifies a figure; change the figure''s basis first' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  return new;
end $$;

create function tebos_private.guard_property_gate() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_order text[] := array['evidence', 'root_cause', 'feasibility', 'authorisation', 'outcome'];
  v_i integer := array_position(v_order, new.gate);
  v_case public.property_cases;
begin
  if tg_op = 'UPDATE' and (new.gate, new.case_id, new.org_id) is distinct from (old.gate, old.case_id, old.org_id) then
    raise exception 'a gate belongs to its case' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  if new.status = 'passed' and (tg_op = 'INSERT' or old.status is distinct from 'passed') then
    if v_i > 1 and not exists (select 1 from public.property_gates
                                where case_id = new.case_id and gate = v_order[v_i - 1] and status = 'passed') then
      raise exception 'gates pass in order: % must pass first', v_order[v_i - 1] using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    if new.gate = 'evidence' then
      select * into v_case from public.property_cases where id = new.case_id;
      if v_case.authority <> 'confirmed' then
        raise exception 'the evidence gate needs the owner''s authority confirmed' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
      end if;
      if exists (select 1 from public.property_evidence where case_id = new.case_id and status = 'conflicting') then
        raise exception 'resolve conflicting evidence before passing the evidence gate' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
      end if;
    end if;
  end if;
  if tg_op = 'UPDATE' and old.status = 'passed' and new.status <> 'passed'
     and exists (select 1 from public.property_gates
                  where case_id = new.case_id and status = 'passed' and array_position(v_order, gate) > v_i) then
    raise exception 'reopen the later gates first' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  return new;
end $$;

create trigger guard_property_case before insert or update on public.property_cases
  for each row execute function tebos_private.guard_property_case();
create trigger guard_property_figure before insert or update on public.property_figures
  for each row execute function tebos_private.guard_property_figure();
create trigger guard_property_evidence before update on public.property_evidence
  for each row execute function tebos_private.guard_property_evidence();
create trigger guard_property_gate before insert or update on public.property_gates
  for each row execute function tebos_private.guard_property_gate();

do $$
declare t text;
begin
  foreach t in array array['property_cases', 'property_evidence', 'property_figures', 'property_pathways', 'property_gates'] loop
    execute format('create trigger touch before update on public.%I for each row execute function tebos_private.touch_updated_at()', t);
    execute format('create trigger freeze_tenant_keys before update on public.%I for each row execute function tebos_private.freeze_tenant_keys()', t);
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function tebos_private.audit_row()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Access: members read their organisation's cases; admins and operators work them.
-- A case is never deleted from the interface: its history is the record.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['property_cases', 'property_evidence', 'property_figures', 'property_pathways', 'property_gates'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('create policy member_read on public.%I for select to authenticated using (tebos_private.is_member(org_id))', t);
    execute format($p$create policy operator_insert on public.%I for insert to authenticated
                      with check (tebos_private.has_role(org_id, array['org_admin', 'operator']))$p$, t);
    execute format($p$create policy operator_update on public.%I for update to authenticated
                      using (tebos_private.has_role(org_id, array['org_admin', 'operator']))
                      with check (tebos_private.has_role(org_id, array['org_admin', 'operator']))$p$, t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
-- a figure can go back to unknown, and an evidence item entered in error can be removed (both audited)
create policy operator_delete on public.property_figures for delete to authenticated
  using (tebos_private.has_role(org_id, array['org_admin', 'operator']));
create policy operator_delete on public.property_evidence for delete to authenticated
  using (tebos_private.has_role(org_id, array['org_admin', 'operator']));
grant delete on public.property_figures, public.property_evidence to authenticated;
