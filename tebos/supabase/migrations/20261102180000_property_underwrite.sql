-- Underwrite: the sixth stage of Property Revenue Architecture (ADR 0021; founder, 2 Nov 2026). The journey becomes
-- Discover → Assess → Underwrite → Strategise → Execute → Optimise. Underwriting tests whether fixing a problem is
-- commercially worth it before anyone agrees an action: is it viable, what are the risks, what might it return, and
-- is the financing ready.
--
-- The rules (mirrored in src/domain/journey.ts):
--   * An underwrite is a record about one problem, written by a signed-in admin or operator, and kept as written:
--     a changed view is a new underwrite, never an edit. The latest one is the one that counts.
--   * It rests on evidence that has been checked, attached to the same problem. Received-but-unchecked evidence is
--     not enough to underwrite on.
--   * Its verdict is proceed, hold and optimise first, or not viable. It always says why (viability) and what could
--     go wrong (risks).
--   * An estimated return is optional. When given it is a range (low to high, monthly net effect in cents) with how
--     it was reached; it is an estimate, never a promise, and the interface labels it so.
--   * Financing readiness is stated: ready, needs work (saying what), or not needed.
--   * Strategise waits for a proceed: a new action on the problem, or moving the problem to planned, needs the
--     latest underwrite to say proceed.
--   * Evidence an underwrite rests on can't quietly be removed or downgraded from checked.

create table public.property_underwrites (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null,
  case_id           uuid not null,
  problem_id        uuid not null,
  verdict           text not null check (verdict in ('proceed', 'hold_optimise', 'not_viable')),
  viability         text not null check (length(trim(viability)) between 10 and 2000),
  risks             text not null check (length(trim(risks)) between 10 and 2000),
  effect_low_cents  bigint,
  effect_high_cents bigint,
  effect_basis      text check (effect_basis is null or length(effect_basis) <= 1000),
  financing         text not null check (financing in ('ready', 'needs_work', 'not_needed')),
  financing_note    text check (financing_note is null or length(financing_note) <= 1000),
  evidence_id       uuid not null,
  created_by        uuid references auth.users (id),
  created_at        timestamptz not null default now(),
  foreign key (case_id, org_id) references public.property_cases (id, org_id) on delete cascade,
  foreign key (problem_id, case_id) references public.property_problems (id, case_id) on delete cascade,
  foreign key (evidence_id, case_id) references public.property_evidence (id, case_id),
  check ((effect_low_cents is null) = (effect_high_cents is null)),
  check (effect_low_cents is null or (effect_low_cents <= effect_high_cents and length(trim(coalesce(effect_basis, ''))) >= 10)),
  check (financing <> 'needs_work' or length(trim(coalesce(financing_note, ''))) >= 10),
  check (not tebos_private.looks_personal(viability) and not tebos_private.looks_personal(risks)
     and not tebos_private.looks_personal(effect_basis) and not tebos_private.looks_personal(financing_note))
);
create index property_underwrites_problem_idx on public.property_underwrites (problem_id, created_at desc);

-- an underwrite rests on checked evidence for its own problem, on a problem still being worked; it is kept as written
create function tebos_private.guard_property_underwrite() returns trigger
language plpgsql set search_path = '' as $$
declare v_ev record; v_status text;
begin
  if tg_op = 'DELETE' then
    -- the whole property is being removed (an organisation's deletion cascades)
    if not exists (select 1 from public.property_cases c where c.id = old.case_id) then return old; end if;
    raise exception 'an underwrite is kept as written; record a new one instead' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  if tg_op = 'UPDATE' then
    raise exception 'an underwrite is kept as written; record a new one instead' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  -- permission first, so an outsider learns nothing from the other checks
  if not tebos_private.has_role(new.org_id, array['org_admin', 'operator']) then
    raise exception 'only the property''s admins and operators underwrite' using errcode = '42501';
  end if;
  new.created_by := auth.uid();
  new.created_at := now();
  select status into v_status from public.property_problems where id = new.problem_id;
  if v_status in ('resolved', 'parked') then
    raise exception 'underwrite a problem that is still being worked' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  select e.status, e.problem_id into v_ev from public.property_evidence e where e.id = new.evidence_id;
  if v_ev.problem_id is distinct from new.problem_id then
    raise exception 'an underwrite rests on evidence for the same problem' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  if v_ev.status is distinct from 'checked' then
    raise exception 'underwrite on checked evidence: check the evidence first' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  return new;
end $$;

-- Strategise waits for a proceed: a new action on a problem, or the problem planned. The latest underwrite counts.
create function tebos_private.underwritten_to_proceed(p_problem uuid) returns boolean
language sql stable set search_path = '' as $$
  select coalesce((select u.verdict = 'proceed' from public.property_underwrites u
                    where u.problem_id = p_problem order by u.created_at desc, u.id desc limit 1), false)
$$;

create function tebos_private.guard_action_after_underwrite() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.problem_id is not null and (tg_op = 'INSERT' or new.problem_id is distinct from old.problem_id)
     and not tebos_private.underwritten_to_proceed(new.problem_id) then
    raise exception 'agree an action once the problem is underwritten to proceed' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  return new;
end $$;

create function tebos_private.guard_plan_after_underwrite() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'planned' and (tg_op = 'INSERT' or old.status is distinct from 'planned')
     and not tebos_private.underwritten_to_proceed(new.id) then
    raise exception 'plan the problem once it is underwritten to proceed' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  return new;
end $$;

-- evidence an underwrite rests on stays checked and stays
create function tebos_private.guard_underwritten_evidence() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.property_cases c where c.id = old.case_id) then
    return old;
  end if;
  if (tg_op = 'DELETE' or new.status <> 'checked' or new.problem_id is distinct from old.problem_id)
     and exists (select 1 from public.property_underwrites u where u.evidence_id = old.id) then
    raise exception 'an underwrite rests on this evidence; it stays checked' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- resolved still means checked evidence that the fix worked: the evidence a problem was underwritten on shows the
-- problem, not the result, so it doesn't count (same function, replaced in place; mirrors checkProblemStatus)
create or replace function tebos_private.guard_property_problem() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.case_id, new.org_id) is distinct from (old.case_id, old.org_id) then
    raise exception 'a problem belongs to its property' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  elsif new.created_by is distinct from old.created_by then
    raise exception 'who recorded a problem doesn''t change' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  if tg_op = 'UPDATE' and new.status in ('open', 'investigating', 'planned') and old.status in ('resolved', 'not_resolved', 'parked') then
    new.result_note := null;
    new.closed_on := null;
  end if;
  if new.status = 'resolved' and (tg_op = 'INSERT' or old.status is distinct from 'resolved') then
    if not exists (select 1 from public.property_workstreams w where w.problem_id = new.id and w.status = 'done') then
      raise exception 'a problem is resolved only once an action on it is done' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    if not exists (select 1 from public.property_evidence e where e.problem_id = new.id and e.status = 'checked'
                     and not exists (select 1 from public.property_underwrites u where u.evidence_id = e.id)) then
      raise exception 'a problem is resolved only with checked evidence that it worked' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
  end if;
  return new;
end $$;

-- likewise, the last checked evidence that a resolved problem is fixed can't quietly go; the evidence it was
-- underwritten on doesn't count as that proof (same function, replaced in place)
create or replace function tebos_private.guard_property_proof() returns trigger
language plpgsql set search_path = '' as $$
begin
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
     and not exists (select 1 from public.property_evidence e where e.problem_id = old.problem_id and e.status = 'checked' and e.id <> old.id
                       and not exists (select 1 from public.property_underwrites u where u.evidence_id = e.id)) then
    raise exception 'this is the checked evidence for a resolved problem; reopen the problem first' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger guard_property_underwrite before insert or update or delete on public.property_underwrites
  for each row execute function tebos_private.guard_property_underwrite();
create trigger guard_strategise before insert or update on public.property_workstreams
  for each row execute function tebos_private.guard_action_after_underwrite();
create trigger guard_strategise before insert or update of status on public.property_problems
  for each row execute function tebos_private.guard_plan_after_underwrite();
create trigger guard_underwritten_evidence before update or delete on public.property_evidence
  for each row execute function tebos_private.guard_underwritten_evidence();
create trigger audit after insert or update or delete on public.property_underwrites
  for each row execute function tebos_private.audit_row();

-- members read; admins and operators record; no one edits or deletes (a changed view is a new underwrite)
alter table public.property_underwrites enable row level security;
revoke all on public.property_underwrites from anon, authenticated;
create policy member_read on public.property_underwrites for select to authenticated using (tebos_private.is_member(org_id));
create policy operator_insert on public.property_underwrites for insert to authenticated
  with check (tebos_private.has_role(org_id, array['org_admin', 'operator']));
grant select on public.property_underwrites to authenticated;
grant insert (org_id, case_id, problem_id, verdict, viability, risks, effect_low_cents, effect_high_cents, effect_basis,
              financing, financing_note, evidence_id) on public.property_underwrites to authenticated;
grant all on public.property_underwrites to service_role;
revoke all on function tebos_private.guard_property_underwrite(), tebos_private.guard_action_after_underwrite(),
  tebos_private.guard_plan_after_underwrite(), tebos_private.guard_underwritten_evidence() from public;
-- called inside the guards as the signed-in person, so it stays executable; it reads only what RLS lets them see
revoke all on function tebos_private.underwritten_to_proceed(uuid) from public, anon;
grant execute on function tebos_private.underwritten_to_proceed(uuid) to authenticated, service_role;
