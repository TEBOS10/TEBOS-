-- The weekly signal brief (ADR 0007): REEDS reads the company's signals (demand, cash, delivery, reliability,
-- security) from its own records once a week and reports which ones crossed their threshold.
--
-- A request still comes only from a person. An admin or operator switches on a *standing* weekly brief for
-- their organisation; from then on the server may file that one kind of request for them, at most once in six
-- days, while they still hold the role and the standing request is on. Nothing else changes: no other kind can
-- be filed by the server, and a brief never creates further work.

alter table public.work_requests drop constraint work_requests_kind_check,
  add constraint work_requests_kind_check check (kind in ('attention_today', 'business_status', 'external_task', 'signal_brief'));

create table public.reeds_standing_requests (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organisations (id) on delete cascade,
  kind         text not null check (kind = 'signal_brief'),
  active       boolean not null default true,
  requested_by uuid not null references auth.users (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (org_id, kind)
);

create function tebos_private.guard_standing_request() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tebos_private.is_client() then
    if auth.uid() is null or not tebos_private.has_role(new.org_id, array['org_admin', 'operator']) then
      raise exception 'an admin or operator of the organisation sets up a standing request'
        using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
    end if;
    if exists (select 1 from public.organisations o where o.id = new.org_id and o.app = 'tepos') then
      raise exception 'standing requests are for TEBOS organisations, not private ones'
        using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    -- whoever switches it on is the person the weekly briefs are filed for
    new.requested_by := auth.uid();
  end if;
  if tg_op = 'UPDATE' and (new.org_id, new.kind, new.created_at) is distinct from (old.org_id, old.kind, old.created_at) then
    raise exception 'a standing request''s organisation and kind are fixed' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  return new;
end $$;

create trigger guard_standing_request before insert or update on public.reeds_standing_requests
  for each row execute function tebos_private.guard_standing_request();
create trigger touch before update on public.reeds_standing_requests
  for each row execute function tebos_private.touch_updated_at();
create trigger freeze_tenant_keys before update on public.reeds_standing_requests
  for each row execute function tebos_private.freeze_tenant_keys();
create trigger audit after insert or update or delete on public.reeds_standing_requests
  for each row execute function tebos_private.audit_row();

alter table public.reeds_standing_requests enable row level security;
revoke all on public.reeds_standing_requests from anon, authenticated;
grant select on public.reeds_standing_requests to authenticated;
grant insert (org_id, kind, active) on public.reeds_standing_requests to authenticated;
grant update (active) on public.reeds_standing_requests to authenticated;
grant all on public.reeds_standing_requests to service_role;
create policy member_read on public.reeds_standing_requests for select to authenticated
  using (tebos_private.is_member(org_id));
create policy operator_set on public.reeds_standing_requests for insert to authenticated
  with check (tebos_private.has_role(org_id, array['org_admin', 'operator']));
create policy operator_change on public.reeds_standing_requests for update to authenticated
  using (tebos_private.has_role(org_id, array['org_admin', 'operator']))
  with check (tebos_private.has_role(org_id, array['org_admin', 'operator']));

-- The request guard, as in model_bridge, with one addition: the server may file a weekly signal brief that a
-- person set up as a standing request.
create or replace function tebos_private.guard_work_request() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_tasks integer;
  v_unverified integer;
begin
  if tg_op = 'INSERT' then
    if not tebos_private.is_client() then
      -- the server files only a standing weekly brief, for the person who set it up, while they may still ask
      if new.kind <> 'signal_brief'
         or not exists (select 1 from public.reeds_standing_requests s
                         where s.org_id = new.org_id and s.kind = 'signal_brief' and s.active and s.requested_by = new.requested_by)
         or not exists (select 1 from public.memberships m join public.organisations o on o.id = m.org_id
                         where m.org_id = new.org_id and m.user_id = new.requested_by
                           and m.role in ('org_admin', 'operator') and o.app <> 'tepos') then
        raise exception 'a request comes from an admin or operator of its organisation'
          using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
      end if;
      if exists (select 1 from public.work_requests r
                  where r.org_id = new.org_id and r.kind = 'signal_brief' and r.created_at > now() - interval '6 days') then
        raise exception 'a weekly brief was already filed in the last six days'
          using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
      end if;
      new.note := null;
      new.report := null;
      new.failure_detail := null;
      new.planned_at := null;
      new.finished_at := null;
      return new;
    end if;
    -- only a signed-in admin or operator of the organisation asks for work
    if auth.uid() is null or not tebos_private.has_role(new.org_id, array['org_admin', 'operator']) then
      raise exception 'a request comes from an admin or operator of its organisation'
        using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
    end if;
    if tebos_private.looks_secret(concat_ws(' ', new.note, new.task_title, new.task_acceptance)) then
      raise exception 'the request looks like it contains a secret; never put passwords or keys in a task'
        using errcode = 'P0001', hint = 'TEBOS_SECRET_REFUSED';
    end if;
    new.requested_by := auth.uid();
    new.report := null;
    new.failure_detail := null;
    new.planned_at := null;
    new.finished_at := null;
    return new;
  end if;

  if (new.org_id, new.kind, new.note, new.requested_by, new.max_tasks, new.created_at, new.task_title, new.task_acceptance, new.task_executor)
     is distinct from
     (old.org_id, old.kind, old.note, old.requested_by, old.max_tasks, old.created_at, old.task_title, old.task_acceptance, old.task_executor) then
    raise exception 'what was asked, by whom and for which organisation is fixed'
      using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;

  if tebos_private.is_client() then
    -- a person can only cancel; planning, running and reporting are the server's
    if new.status is distinct from old.status and new.status <> 'cancelled'
       or (new.report, new.failure_detail) is distinct from (old.report, old.failure_detail) then
      raise exception 'only TEBOS plans, runs and reports a request; you can cancel it'
        using errcode = '42501', hint = 'TEBOS_SERVER_ONLY';
    end if;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'planned' then
      new.planned_at := now();
      if not exists (select 1 from public.work_tasks where request_id = new.id) then
        raise exception 'a request is planned only once it has tasks' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
      end if;
    end if;
    if new.status = 'completed' then
      select count(*), count(*) filter (where status <> 'verified') into v_tasks, v_unverified
        from public.work_tasks where request_id = new.id;
      if v_tasks = 0 or v_unverified > 0 then
        raise exception 'a request is complete only when every task is verified (% of % are not)', v_unverified, v_tasks
          using errcode = 'P0001', hint = 'TEBOS_WORK_UNVERIFIED';
      end if;
    end if;
    if new.status in ('completed', 'failed', 'cancelled') then
      new.finished_at := now();
    end if;
  end if;
  return new;
end $$;
