-- A client's diagnostic interview closes its own delivery step.
--
-- At onboarding the server opens a written diagnostic interview for the new
-- client (src/pipeline/pg-store.ts). When that interview is completed (the
-- owner submits their written answers, or TEBOS's server records a finished
-- call), the client's open "diagnostic" delivery step is closed as done, with
-- a note of what actually happened. Nobody has to remember to tick it, and it
-- can only close on a real completion: an interview reaches 'completed' only
-- through submit_interview_answers or the server (see guard_interview).
--
-- A step closed this way records no person in closed_by: TEBOS closed it, the
-- same as the draft board it lays at onboarding. A step a maintainer closes
-- still records the maintainer.

create or replace function tebos_private.guard_delivery_task() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tebos_private.is_client() then
    if tg_op <> 'UPDATE' then
      raise exception 'delivery steps are set by TEBOS when a client is onboarded'
        using errcode = '42501', hint = 'TEBOS_SERVER_ONLY';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if (new.opportunity_id, new.org_id, new.key, new.position, new.title, new.done_means, new.due_at, new.created_at)
       is distinct from
       (old.opportunity_id, old.org_id, old.key, old.position, old.title, old.done_means, old.due_at, old.created_at) then
      raise exception 'a delivery step''s title, meaning and due date are fixed'
        using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
    end if;
    if old.status <> 'open' then
      raise exception 'a closed delivery step stays closed' using errcode = 'P0001', hint = 'TEBOS_ILLEGAL_TRANSITION';
    end if;
    if new.status is distinct from old.status then
      new.closed_at := now();
      -- a person closing it is recorded; TEBOS closing it (the server, or a database rule) records no one
      new.closed_by := case when tebos_private.is_client() then auth.uid() end;
    elsif (new.note, new.closed_by, new.closed_at) is distinct from (old.note, old.closed_by, old.closed_at) then
      raise exception 'a note is recorded when the step is closed' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
  end if;
  return new;
end $$;

create function tebos_private.close_diagnostic_step() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_answers integer;
  v_note text;
begin
  if new.status <> 'completed' or old.status = 'completed' then
    return new;
  end if;
  if new.channel = 'form' then
    select count(*) into v_answers from public.evidence
     where business_id = new.business_id and structured_value ->> 'interview_id' = new.id::text;
    v_note := format('The owner answered %s questions of the written diagnostic interview on TEBOS (%s); the answers are recorded as their own statements.',
                     v_answers, new.playbook_key || '@' || new.playbook_version);
  else
    v_note := format('The diagnostic call with the owner was completed on TEBOS (%s); the answers are taken from the recorded transcript as their own statements.',
                     coalesce((new.duration_seconds / 60)::text || ' min', 'length not reported'));
  end if;
  update public.delivery_tasks t set status = 'done', note = v_note
    from public.opportunities o
   where o.business_id = new.business_id and t.opportunity_id = o.id
     and t.key = 'diagnostic' and t.status = 'open';
  return new;
end $$;
revoke all on function tebos_private.close_diagnostic_step() from public, anon, authenticated;

create trigger close_diagnostic_step after update of status on public.interview_sessions
  for each row execute function tebos_private.close_diagnostic_step();
