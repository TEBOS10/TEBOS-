-- The Property Revenue Architect Platform, Release 1: the property journey (founder's build directive, 29 Oct 2026;
-- docs/pra-platform/release-1.md, ADR 0010). Additive: one new table, new columns, and guards. The landlord's
-- workspace is the existing property case, in the landlord's own organisation; nothing here reads another's.
--
-- The rules (mirrored in src/domain/journey.ts and src/domain/states.ts):
--   * A property keeps a register of problems. Each says what is happening; its consequence, workaround,
--     intervention, specialist and measure may be unknown, and unknown stays empty, never assumed.
--   * No email addresses, phone numbers or ID numbers in a problem's text: tenant details wait for the POPIA review.
--   * A problem moves open → investigating → planned → resolved / not resolved, or is parked, and can reopen: the
--     journey has no artificial end.
--   * Resolved needs a written result, a completed action on the problem, and checked evidence on the problem:
--     the evidence that shows the intervention worked. Not resolved and parked say why.
--   * An action for a problem gives its reason and how we'll know it's done. Done needs its proof: evidence from the
--     same property that was received or checked.
--   * Evidence that proves a finished action or a resolved problem can't quietly be downgraded or removed.

insert into public.state_transitions (machine, from_state, to_state) values
  ('property_problem', '(initial)', 'open'),
  ('property_problem', 'open', 'investigating'),
  ('property_problem', 'open', 'planned'),
  ('property_problem', 'open', 'parked'),
  ('property_problem', 'investigating', 'planned'),
  ('property_problem', 'investigating', 'parked'),
  ('property_problem', 'planned', 'investigating'),
  ('property_problem', 'planned', 'resolved'),
  ('property_problem', 'planned', 'not_resolved'),
  ('property_problem', 'planned', 'parked'),
  ('property_problem', 'not_resolved', 'investigating'),
  ('property_problem', 'not_resolved', 'planned'),
  ('property_problem', 'parked', 'open'),
  ('property_problem', 'resolved', 'open');

alter table public.property_cases
  add column area        text check (area is null or length(trim(area)) between 2 and 120),
  add column current_use text check (current_use is null or length(current_use) <= 1000);

create table public.property_problems (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  case_id         uuid not null,
  category        text not null check (category in ('income', 'arrears', 'vacancy', 'expenses', 'maintenance', 'security',
                    'tenancy', 'records', 'approvals', 'other')),
  title           text not null check (length(trim(title)) between 3 and 160),
  experienced     text not null check (length(trim(experienced)) between 10 and 2000),
  consequence     text check (consequence is null or length(consequence) <= 2000),
  workaround      text check (workaround is null or length(workaround) <= 1000),
  intervention    text check (intervention is null or length(intervention) <= 2000),
  specialist      text check (specialist is null or length(trim(specialist)) between 2 and 120),
  expected_result text check (expected_result is null or length(expected_result) <= 1000),
  measure         text check (measure is null or length(measure) <= 500),
  status          text not null default 'open',
  result_note     text check (result_note is null or length(result_note) <= 2000),
  closed_on       date,
  created_by      uuid references auth.users (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, case_id),
  foreign key (case_id, org_id) references public.property_cases (id, org_id) on delete cascade,
  check (status <> 'planned' or length(trim(coalesce(intervention, ''))) >= 10),
  check (status not in ('resolved', 'not_resolved', 'parked') or (length(trim(coalesce(result_note, ''))) >= 10 and closed_on is not null)),
  check (not tebos_private.looks_personal(title) and not tebos_private.looks_personal(experienced)
     and not tebos_private.looks_personal(consequence) and not tebos_private.looks_personal(workaround)
     and not tebos_private.looks_personal(intervention) and not tebos_private.looks_personal(result_note))
);
create index property_problems_case_idx on public.property_problems (case_id, status);

alter table public.property_evidence
  add column problem_id uuid,
  add constraint property_evidence_problem_fk foreign key (problem_id, case_id) references public.property_problems (id, case_id);
create index property_evidence_problem_idx on public.property_evidence (problem_id) where problem_id is not null;

alter table public.property_workstreams
  add column problem_id uuid,
  add column reason text check (reason is null or length(reason) <= 1000),
  add column done_when text check (done_when is null or length(done_when) <= 500),
  add column completion_evidence_id uuid,
  add constraint property_workstreams_problem_fk foreign key (problem_id, case_id) references public.property_problems (id, case_id),
  add constraint property_workstreams_proof_fk foreign key (completion_evidence_id, case_id) references public.property_evidence (id, case_id),
  add constraint property_workstreams_explained check (problem_id is null
    or (length(trim(coalesce(reason, ''))) >= 10 and length(trim(coalesce(done_when, ''))) >= 5)),
  add constraint property_workstreams_proved check (status <> 'done' or problem_id is null or completion_evidence_id is not null);
create index property_workstreams_problem_idx on public.property_workstreams (problem_id) where problem_id is not null;

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------

-- a problem stays on its property; resolved rests on a finished action and checked evidence
create function tebos_private.guard_property_problem() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.case_id, new.org_id) is distinct from (old.case_id, old.org_id) then
    raise exception 'a problem belongs to its property' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  -- the creator is whoever is signed in, whatever was sent
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  elsif new.created_by is distinct from old.created_by then
    raise exception 'who recorded a problem doesn''t change' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  -- back in progress: the earlier result stays in the history, not on the open problem
  if tg_op = 'UPDATE' and new.status in ('open', 'investigating', 'planned') and old.status in ('resolved', 'not_resolved', 'parked') then
    new.result_note := null;
    new.closed_on := null;
  end if;
  if new.status = 'resolved' and (tg_op = 'INSERT' or old.status is distinct from 'resolved') then
    if not exists (select 1 from public.property_workstreams w where w.problem_id = new.id and w.status = 'done') then
      raise exception 'a problem is resolved only once an action on it is done' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    if not exists (select 1 from public.property_evidence e where e.problem_id = new.id and e.status = 'checked') then
      raise exception 'a problem is resolved only with checked evidence that it worked' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
  end if;
  return new;
end $$;

-- an action's proof is evidence that was actually received
create function tebos_private.guard_property_action_proof() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_status text;
begin
  if new.completion_evidence_id is not null
     and (tg_op = 'INSERT' or new.completion_evidence_id is distinct from old.completion_evidence_id or new.status is distinct from old.status) then
    select status into v_status from public.property_evidence where id = new.completion_evidence_id;
    if v_status not in ('received', 'checked') then
      raise exception 'an action''s proof must be evidence that was received or checked' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
  end if;
  return new;
end $$;

-- evidence that proves finished work can't quietly stop being evidence
create function tebos_private.guard_property_proof() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- the whole property is being removed (an organisation's deletion cascades): nothing is left to prove
  if tg_op = 'DELETE' and not exists (select 1 from public.property_cases c where c.id = old.case_id) then
    return old;
  end if;
  if tg_op = 'DELETE' or new.status not in ('received', 'checked') then
    if exists (select 1 from public.property_workstreams w where w.completion_evidence_id = old.id and w.status = 'done') then
      raise exception 'this evidence proves a finished action; reopen the action first' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
  end if;
  if old.problem_id is not null and old.status = 'checked'
     and (tg_op = 'DELETE' or new.status <> 'checked' or new.problem_id is distinct from old.problem_id)
     and exists (select 1 from public.property_problems p where p.id = old.problem_id and p.status = 'resolved')
     and not exists (select 1 from public.property_evidence e where e.problem_id = old.problem_id and e.status = 'checked' and e.id <> old.id) then
    raise exception 'this is the checked evidence for a resolved problem; reopen the problem first' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger enforce_state_machine before insert or update of status on public.property_problems
  for each row execute function tebos_private.guard_status('property_problem');
create trigger guard_property_problem before insert or update on public.property_problems
  for each row execute function tebos_private.guard_property_problem();
create trigger guard_property_action_proof before insert or update on public.property_workstreams
  for each row execute function tebos_private.guard_property_action_proof();
create trigger guard_property_proof before update or delete on public.property_evidence
  for each row execute function tebos_private.guard_property_proof();
create trigger touch before update on public.property_problems
  for each row execute function tebos_private.touch_updated_at();
create trigger freeze_tenant_keys before update on public.property_problems
  for each row execute function tebos_private.freeze_tenant_keys();
create trigger audit after insert or update or delete on public.property_problems
  for each row execute function tebos_private.audit_row();

-- members read; admins and operators work; no one deletes a problem (its history is the record)
alter table public.property_problems enable row level security;
create policy member_read on public.property_problems for select to authenticated using (tebos_private.is_member(org_id));
create policy operator_insert on public.property_problems for insert to authenticated
  with check (tebos_private.has_role(org_id, array['org_admin', 'operator']));
create policy operator_update on public.property_problems for update to authenticated
  using (tebos_private.has_role(org_id, array['org_admin', 'operator']))
  with check (tebos_private.has_role(org_id, array['org_admin', 'operator']));
grant select, insert, update on public.property_problems to authenticated;
grant all on public.property_problems to service_role;
