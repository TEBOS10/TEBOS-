-- Property Revenue Architecture, the next step: execution workstreams and the
-- outcome scorecard (founder, 16 Oct 2026; docs/property-revenue-architecture.md).
-- Additive: new tables, one new column, one more accepted figure key, and the
-- gate guard extended for the outcome gate. Mirrored in src/domain/property.ts.
--
--   * A workstream has an accountable owner, a task, a deadline and a status.
--     It can't start or finish before the workstream it depends on is done
--     (same case, no cycles); a budget is spent only once approved; done needs
--     evidence of completion and a date; blocked says why.
--   * The baseline is frozen: the database copies the case's figures as they
--     stand when it is captured, so it can't be typed in, and they can't
--     change afterwards. Only the target and its note may be revised.
--   * An outcome review records what actually happened: measured actuals,
--     verified or stated by the owner, never estimated; dated on or after the
--     baseline and not in the future. Verified actuals rest on checked evidence.
--   * The outcome gate passes only with a baseline and at least one review.

-- arrears outstanding becomes a figure, so it can be baselined and tracked
alter table public.property_figures drop constraint property_figures_key_check,
  add constraint property_figures_key_check check (key in ('units', 'vacant_units', 'scheduled_rent', 'other_income', 'vacancy_loss', 'rent_due',
    'rent_collected', 'operating_expenses', 'debt_service', 'reserve', 'one_off_capex', 'arrears_balance', 'uplift', 'implementation_cost', 'downside_impact'));

-- when the case's performance is next to be reviewed
alter table public.property_cases add column next_review_on date;

create table public.property_workstreams (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null,
  case_id             uuid not null,
  title               text not null check (length(trim(title)) between 1 and 200),
  owner               text not null check (length(trim(owner)) between 1 and 120),
  due_on              date not null,
  status              text not null default 'planned' check (status in ('planned', 'in_progress', 'blocked', 'done', 'cancelled')),
  depends_on          uuid,
  budget              numeric check (budget is null or budget >= 0),
  approval            text not null default 'not_needed' check (approval in ('not_needed', 'pending', 'approved')),
  approved_by         text check (approved_by is null or length(approved_by) <= 120),
  approved_on         date,
  completion_evidence text check (completion_evidence is null or length(completion_evidence) <= 2000),
  completed_on        date,
  note                text check (note is null or length(note) <= 2000),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, case_id),
  foreign key (case_id, org_id) references public.property_cases (id, org_id) on delete cascade,
  foreign key (depends_on, case_id) references public.property_workstreams (id, case_id),
  check (depends_on is null or depends_on <> id),
  check (approval <> 'approved' or (length(trim(coalesce(approved_by, ''))) > 0 and approved_on is not null)),
  check (coalesce(budget, 0) = 0 or approval <> 'not_needed'),
  check (status <> 'done' or (length(trim(coalesce(completion_evidence, ''))) > 0 and completed_on is not null)),
  check (status <> 'blocked' or length(trim(coalesce(note, ''))) > 0)
);
create index property_workstreams_case_idx on public.property_workstreams (case_id);

create table public.property_baselines (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null,
  case_id          uuid not null unique,
  captured_on      date not null default current_date,
  figures          jsonb not null default '[]'::jsonb check (jsonb_typeof(figures) = 'array'),
  target_cash_flow numeric,
  target_note      text check (target_note is null or length(target_note) <= 1000),
  captured_by      uuid references auth.users (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (case_id, org_id) references public.property_cases (id, org_id) on delete cascade
);

create table public.property_outcome_reviews (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  case_id      uuid not null,
  review_on    date not null,
  period_start date,
  period_end   date,
  note         text check (note is null or length(note) <= 2000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (case_id, review_on),
  unique (id, case_id),
  foreign key (case_id, org_id) references public.property_cases (id, org_id) on delete cascade,
  check (period_start is null or period_end is null or period_start <= period_end)
);

create table public.property_outcome_values (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  case_id      uuid not null,
  review_id    uuid not null,
  key          text not null check (key in ('units', 'vacant_units', 'scheduled_rent', 'other_income', 'vacancy_loss', 'rent_due', 'rent_collected',
                 'operating_expenses', 'debt_service', 'reserve', 'arrears_balance', 'implementation_spent')),
  value        numeric not null check (value >= 0),
  basis        text not null check (basis in ('verified', 'owner_reported')),
  evidence_id  uuid,
  note         text check (note is null or length(note) <= 1000),
  recorded_by  uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (review_id, key),
  foreign key (review_id, case_id) references public.property_outcome_reviews (id, case_id) on delete cascade,
  foreign key (case_id, org_id) references public.property_cases (id, org_id) on delete cascade,
  foreign key (evidence_id, case_id) references public.property_evidence (id, case_id),
  check (basis <> 'verified' or evidence_id is not null),
  check (key not in ('units', 'vacant_units') or value = trunc(value))
);

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------
create function tebos_private.guard_property_workstream() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_dep public.property_workstreams;
  v_next uuid;
  v_steps integer := 0;
begin
  if tg_op = 'UPDATE' and (new.case_id, new.org_id) is distinct from (old.case_id, old.org_id) then
    raise exception 'a workstream belongs to its case' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  -- no dependency cycles
  v_next := new.depends_on;
  while v_next is not null loop
    if v_next = new.id then
      raise exception 'a workstream can''t depend on itself through others' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    v_steps := v_steps + 1;
    exit when v_steps > 100;
    select depends_on into v_next from public.property_workstreams where id = v_next;
  end loop;
  if new.status in ('in_progress', 'done') then
    if coalesce(new.budget, 0) > 0 and new.approval <> 'approved' then
      raise exception 'a budget is spent only once it is approved' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    if new.depends_on is not null then
      select * into v_dep from public.property_workstreams where id = new.depends_on;
      if v_dep.status is distinct from 'done' then
        raise exception 'the workstream this depends on (%) isn''t done', v_dep.title using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
      end if;
    end if;
  end if;
  return new;
end $$;

-- the baseline is the case's figures as they stand when captured; then frozen
create function tebos_private.guard_property_baseline() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    select coalesce(jsonb_agg(jsonb_build_object('key', f.key, 'value', f.value, 'basis', f.basis, 'as_of', f.as_of, 'evidence_id', f.evidence_id) order by f.key), '[]'::jsonb)
      into new.figures
      from public.property_figures f
     where f.case_id = new.case_id and f.key not in ('uplift', 'implementation_cost', 'downside_impact');
    if jsonb_array_length(new.figures) = 0 then
      raise exception 'record the baseline figures before capturing the baseline' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    new.captured_on := current_date;
    if tebos_private.is_client() then
      new.captured_by := auth.uid();
    end if;
    return new;
  end if;
  if (new.case_id, new.org_id, new.captured_on, new.figures, new.captured_by, new.created_at)
     is distinct from (old.case_id, old.org_id, old.captured_on, old.figures, old.captured_by, old.created_at) then
    raise exception 'the baseline is frozen once captured; only the target may be revised' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  return new;
end $$;

create function tebos_private.guard_property_review() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_captured date;
begin
  if tg_op = 'UPDATE' and (new.case_id, new.org_id) is distinct from (old.case_id, old.org_id) then
    raise exception 'a review belongs to its case' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  select captured_on into v_captured from public.property_baselines where case_id = new.case_id;
  if v_captured is null then
    raise exception 'capture the baseline before reviewing outcomes' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  if new.review_on < v_captured or new.review_on > current_date then
    raise exception 'a review is dated between the baseline (%) and today', v_captured using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  return new;
end $$;

-- the outcome gate now also needs a baseline and a review with actuals
create or replace function tebos_private.guard_property_gate() returns trigger
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
    if new.gate = 'outcome' and not exists (
         select 1 from public.property_baselines b
          where b.case_id = new.case_id
            and exists (select 1 from public.property_outcome_values v where v.case_id = new.case_id)) then
      raise exception 'the outcome gate needs a captured baseline and a review of actual results' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
  end if;
  if tg_op = 'UPDATE' and old.status = 'passed' and new.status <> 'passed'
     and exists (select 1 from public.property_gates
                  where case_id = new.case_id and status = 'passed' and array_position(v_order, gate) > v_i) then
    raise exception 'reopen the later gates first' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  return new;
end $$;

create trigger guard_property_workstream before insert or update on public.property_workstreams
  for each row execute function tebos_private.guard_property_workstream();
create trigger guard_property_baseline before insert or update on public.property_baselines
  for each row execute function tebos_private.guard_property_baseline();
create trigger guard_property_review before insert or update on public.property_outcome_reviews
  for each row execute function tebos_private.guard_property_review();
-- actuals follow the figures' rule: verified only against checked evidence of the same case
create trigger guard_property_figure before insert or update on public.property_outcome_values
  for each row execute function tebos_private.guard_property_figure();

do $$
declare t text;
begin
  foreach t in array array['property_workstreams', 'property_baselines', 'property_outcome_reviews', 'property_outcome_values'] loop
    execute format('create trigger touch before update on public.%I for each row execute function tebos_private.touch_updated_at()', t);
    execute format('create trigger freeze_tenant_keys before update on public.%I for each row execute function tebos_private.freeze_tenant_keys()', t);
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function tebos_private.audit_row()', t);
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
-- an actual entered in error can be removed (audited); workstreams are cancelled, not deleted
create policy operator_delete on public.property_outcome_values for delete to authenticated
  using (tebos_private.has_role(org_id, array['org_admin', 'operator']));
grant delete on public.property_outcome_values to authenticated;
