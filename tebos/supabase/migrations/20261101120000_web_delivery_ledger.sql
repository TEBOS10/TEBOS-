-- The Web Delivery Division, milestone 2 (docs/web-delivery/, ADR 0011): the task ledger each role works from, the
-- dependencies between tasks, the asset register with its licences, and deployment records; plus one read for the
-- maintainers' dashboard. Additive only.
--
-- The rules (mirrored in src/domain/web-delivery.ts and src/domain/states.ts):
--   * A task belongs to one project and one role (the specification's twelve), says what "done" means, and moves
--     todo → in progress → review → done, or is blocked with a reason. Nobody passes their own review: the person who
--     moves a task from review to done is not the person it's assigned to. Done needs its evidence.
--   * A task can't start until every task it depends on is done, and dependencies never form a loop.
--   * An asset counts as received only with its source and licence written down; an unknown source is never received.
--   * A deployment records where it went, which commit, what was checked there and the outcome. Production needs the
--     client's release approval and a project in release. A live deployment can later be marked rolled back; nothing
--     else about it changes.
--   * Handover needs a live production deployment.

insert into public.state_transitions (machine, from_state, to_state) values
  ('web_task', '(initial)', 'todo'),
  ('web_task', 'todo', 'in_progress'),
  ('web_task', 'todo', 'blocked'),
  ('web_task', 'todo', 'cancelled'),
  ('web_task', 'in_progress', 'review'),
  ('web_task', 'in_progress', 'blocked'),
  ('web_task', 'in_progress', 'todo'),
  ('web_task', 'review', 'done'),
  ('web_task', 'review', 'in_progress'),
  ('web_task', 'blocked', 'todo'),
  ('web_task', 'blocked', 'in_progress'),
  ('web_task', 'blocked', 'cancelled'),
  ('web_task', 'done', 'in_progress');

-- ---------------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------------
create table public.web_tasks (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null,
  org_id         uuid not null,
  role           text not null check (role in ('director', 'intake', 'creative', 'ux', 'assets', 'architect', 'frontend',
                   'backend', 'content', 'qa', 'deployment', 'librarian')),
  title          text not null check (length(trim(title)) between 3 and 160),
  done_when      text not null check (length(trim(done_when)) between 5 and 500),
  due_on         date,
  assigned_to    uuid references auth.users (id),
  status         text not null default 'todo',
  blocked_reason text check (blocked_reason is null or length(blocked_reason) <= 1000),
  evidence       text check (evidence is null or length(evidence) <= 2000),
  created_by     uuid references auth.users (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, project_id),
  foreign key (project_id, org_id) references public.web_projects (id, org_id),
  check (status <> 'blocked' or length(trim(coalesce(blocked_reason, ''))) >= 10),
  check (status <> 'done' or length(trim(coalesce(evidence, ''))) >= 10),
  check (not tebos_private.looks_personal(title) and not tebos_private.looks_secret(evidence) and not tebos_private.looks_secret(blocked_reason))
);
create index web_tasks_project_idx on public.web_tasks (project_id, status);

create table public.web_task_dependencies (
  task_id    uuid not null,
  depends_on uuid not null,
  project_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (task_id, depends_on),
  foreign key (task_id, project_id) references public.web_tasks (id, project_id),
  foreign key (depends_on, project_id) references public.web_tasks (id, project_id),
  check (task_id <> depends_on)
);

-- ---------------------------------------------------------------------------
-- Assets
-- ---------------------------------------------------------------------------
create table public.web_assets (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null,
  org_id       uuid not null,
  label        text not null check (length(trim(label)) between 2 and 160),
  kind         text not null check (kind in ('logo', 'photo', 'video', 'model_3d', 'font', 'copy', 'icon', 'other')),
  source       text not null default 'unknown' check (source in ('client_supplied', 'licensed', 'commissioned', 'tebos_made', 'unknown')),
  status       text not null default 'missing' check (status in ('received', 'missing', 'client_approval_required', 'not_applicable')),
  licence_note text check (licence_note is null or length(licence_note) <= 1000),
  location     text check (location is null or length(location) <= 400),
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (project_id, org_id) references public.web_projects (id, org_id),
  check (status <> 'received' or (source <> 'unknown' and length(trim(coalesce(licence_note, ''))) >= 10)),
  check (not tebos_private.looks_secret(licence_note) and not tebos_private.looks_secret(location))
);
create index web_assets_project_idx on public.web_assets (project_id);

-- ---------------------------------------------------------------------------
-- Deployments
-- ---------------------------------------------------------------------------
create table public.web_deployments (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null,
  org_id        uuid not null,
  environment   text not null check (environment in ('preview', 'production')),
  url           text not null check (url ~ '^https://[^\s]+$' and length(url) <= 400),
  commit_ref    text not null check (commit_ref ~ '^[0-9a-f]{7,40}$'),
  outcome       text not null check (outcome in ('live', 'failed', 'rolled_back')),
  checked       text not null check (length(trim(checked)) between 10 and 2000),
  rollback_note text check (rollback_note is null or length(rollback_note) <= 1000),
  deployed_by   uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  foreign key (project_id, org_id) references public.web_projects (id, org_id),
  check (outcome <> 'rolled_back' or length(trim(coalesce(rollback_note, ''))) >= 10),
  check (not tebos_private.looks_secret(checked) and not tebos_private.looks_secret(rollback_note))
);
create index web_deployments_project_idx on public.web_deployments (project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------
create function tebos_private.web_project_open(p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.web_projects where id = p_project and status not in ('closed', 'cancelled'))
$$;

create function tebos_private.guard_web_task() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    if not tebos_private.web_project_open(new.project_id) then
      raise exception 'tasks are added to open projects only' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
  elsif (new.project_id, new.org_id, new.created_by) is distinct from (old.project_id, old.org_id, old.created_by) then
    raise exception 'a task stays on its project' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  if new.status = 'in_progress' and (tg_op = 'INSERT' or old.status is distinct from 'in_progress')
     and exists (select 1 from public.web_task_dependencies d join public.web_tasks t on t.id = d.depends_on
                  where d.task_id = new.id and t.status <> 'done') then
    raise exception 'this task waits on another that isn''t done yet' using errcode = 'P0001', hint = 'TEBOS_DEPENDENCY_UNMET';
  end if;
  if tg_op = 'UPDATE' and new.status = 'done' and old.status = 'review'
     and old.assigned_to is not null and old.assigned_to = auth.uid() then
    raise exception 'nobody passes their own review: someone else marks this done' using errcode = 'P0001', hint = 'TEBOS_SELF_APPROVAL';
  end if;
  if new.status <> 'blocked' then new.blocked_reason := null; end if;
  return new;
end $$;

-- a dependency stays inside one project and never closes a loop
create function tebos_private.guard_web_dependency() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (
    with recursive reach(id) as (
      select new.depends_on
      union
      select d.depends_on from public.web_task_dependencies d join reach r on d.task_id = r.id
    )
    select 1 from reach where id = new.task_id
  ) then
    raise exception 'that dependency would make a loop' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  new.created_at := now();
  return new;
end $$;

create function tebos_private.guard_web_asset() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  elsif (new.project_id, new.org_id, new.created_by) is distinct from (old.project_id, old.org_id, old.created_by) then
    raise exception 'an asset stays on its project' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  return new;
end $$;

-- deployments: production only with a release approved by the client; afterwards only a rollback is recorded
create function tebos_private.guard_web_deployment() returns trigger
language plpgsql set search_path = '' as $$
declare v_status text;
begin
  if tg_op = 'DELETE' then
    raise exception 'a deployment record is kept' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  if tg_op = 'UPDATE' then
    if (new.project_id, new.org_id, new.environment, new.url, new.commit_ref, new.checked, new.deployed_by, new.created_at)
       is distinct from (old.project_id, old.org_id, old.environment, old.url, old.commit_ref, old.checked, old.deployed_by, old.created_at)
       or not (old.outcome = 'live' and new.outcome = 'rolled_back') then
      raise exception 'a deployment record only changes to say it was rolled back' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
    end if;
    return new;
  end if;
  new.deployed_by := auth.uid();
  new.created_at := now();
  if new.outcome = 'rolled_back' then
    raise exception 'record the deployment first, then its rollback' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  select status into v_status from public.web_projects where id = new.project_id;
  if v_status in ('closed', 'cancelled') then
    raise exception 'this project is %', v_status using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  if new.environment = 'production' then
    if v_status not in ('release', 'handover') then
      raise exception 'production deploys happen in release' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    if not tebos_private.web_approved(tebos_private.web_latest_revision(new.project_id), 'release') then
      raise exception 'production needs the client''s release approval' using errcode = 'P0001', hint = 'TEBOS_APPROVAL_REQUIRED';
    end if;
  end if;
  return new;
end $$;

-- handover only once the site is live in production
create function tebos_private.guard_web_handover() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'handover' and old.status is distinct from 'handover'
     and not exists (select 1 from public.web_deployments d where d.project_id = new.id and d.environment = 'production' and d.outcome = 'live') then
    raise exception 'handover needs a live production deployment' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  return new;
end $$;

create trigger enforce_state_machine before insert or update of status on public.web_tasks
  for each row execute function tebos_private.guard_status('web_task');
create trigger guard_web_task before insert or update on public.web_tasks
  for each row execute function tebos_private.guard_web_task();
create trigger touch before update on public.web_tasks
  for each row execute function tebos_private.touch_updated_at();
create trigger audit after insert or update or delete on public.web_tasks
  for each row execute function tebos_private.audit_row();

create trigger guard_web_dependency before insert on public.web_task_dependencies
  for each row execute function tebos_private.guard_web_dependency();

create trigger guard_web_asset before insert or update on public.web_assets
  for each row execute function tebos_private.guard_web_asset();
create trigger touch before update on public.web_assets
  for each row execute function tebos_private.touch_updated_at();
create trigger audit after insert or update or delete on public.web_assets
  for each row execute function tebos_private.audit_row();

create trigger guard_web_deployment before insert or update or delete on public.web_deployments
  for each row execute function tebos_private.guard_web_deployment();
create trigger audit after insert or update or delete on public.web_deployments
  for each row execute function tebos_private.audit_row();

create trigger guard_web_handover before update of status on public.web_projects
  for each row execute function tebos_private.guard_web_handover();

-- ---------------------------------------------------------------------------
-- Access: maintainers work; the client's members read their own project's records
-- ---------------------------------------------------------------------------
alter table public.web_tasks enable row level security;
create policy read on public.web_tasks for select to authenticated
  using (tebos_private.is_staff(array['maintainer']) or tebos_private.is_member(org_id));
create policy staff_insert on public.web_tasks for insert to authenticated
  with check (tebos_private.is_staff(array['maintainer']));
create policy staff_update on public.web_tasks for update to authenticated
  using (tebos_private.is_staff(array['maintainer'])) with check (tebos_private.is_staff(array['maintainer']));
grant select, insert on public.web_tasks to authenticated;
grant update (title, done_when, due_on, assigned_to, status, blocked_reason, evidence) on public.web_tasks to authenticated;

alter table public.web_task_dependencies enable row level security;
create policy read on public.web_task_dependencies for select to authenticated
  using (tebos_private.is_staff(array['maintainer'])
      or exists (select 1 from public.web_projects p where p.id = project_id and tebos_private.is_member(p.org_id)));
create policy staff_insert on public.web_task_dependencies for insert to authenticated
  with check (tebos_private.is_staff(array['maintainer']));
grant select, insert on public.web_task_dependencies to authenticated;

alter table public.web_assets enable row level security;
create policy read on public.web_assets for select to authenticated
  using (tebos_private.is_staff(array['maintainer']) or tebos_private.is_member(org_id));
create policy staff_insert on public.web_assets for insert to authenticated
  with check (tebos_private.is_staff(array['maintainer']));
create policy staff_update on public.web_assets for update to authenticated
  using (tebos_private.is_staff(array['maintainer'])) with check (tebos_private.is_staff(array['maintainer']));
grant select, insert on public.web_assets to authenticated;
grant update (label, kind, source, status, licence_note, location) on public.web_assets to authenticated;

alter table public.web_deployments enable row level security;
create policy read on public.web_deployments for select to authenticated
  using (tebos_private.is_staff(array['maintainer']) or tebos_private.is_member(org_id));
create policy staff_insert on public.web_deployments for insert to authenticated
  with check (tebos_private.is_staff(array['maintainer']));
create policy staff_update on public.web_deployments for update to authenticated
  using (tebos_private.is_staff(array['maintainer'])) with check (tebos_private.is_staff(array['maintainer']));
grant select, insert on public.web_deployments to authenticated;
grant update (outcome, rollback_note) on public.web_deployments to authenticated;

grant all on public.web_tasks, public.web_task_dependencies, public.web_assets, public.web_deployments to service_role;

-- ---------------------------------------------------------------------------
-- The dashboard's one read: every project the caller may see, with its client's name and the counts that matter
-- ---------------------------------------------------------------------------
create function public.web_delivery_board()
returns table (
  id uuid, ref text, name text, org_id uuid, org_name text, website_type text, plan text, status text,
  status_note text, deadline_on date, clock_paused_on date, updated_at timestamptz,
  readiness_gaps integer, tasks_total integer, tasks_done integer, tasks_blocked integer,
  last_qa_verdict text, last_qa_at timestamptz, live_url text
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.ref, p.name, p.org_id, o.name, p.website_type, p.plan, p.status, p.status_note, p.deadline_on,
         p.clock_paused_on, p.updated_at,
         case when p.status in ('lead', 'intake', 'scope_review', 'approval', 'blocked_client', 'scope_change')
              then cardinality(tebos_private.web_readiness_gaps(p.id)) else 0 end,
         (select count(*)::integer from public.web_tasks t where t.project_id = p.id and t.status <> 'cancelled'),
         (select count(*)::integer from public.web_tasks t where t.project_id = p.id and t.status = 'done'),
         (select count(*)::integer from public.web_tasks t where t.project_id = p.id and t.status = 'blocked'),
         q.verdict, q.created_at,
         (select d.url from public.web_deployments d where d.project_id = p.id and d.environment = 'production' and d.outcome = 'live'
           order by d.created_at desc limit 1)
    from public.web_projects p
    join public.organisations o on o.id = p.org_id
    left join lateral (select verdict, created_at from public.web_qa_runs r where r.project_id = p.id
                        order by r.created_at desc limit 1) q on true
   where tebos_private.is_staff(array['maintainer']) or tebos_private.is_member(p.org_id)
   order by (p.status in ('closed', 'cancelled')), p.deadline_on nulls last, p.updated_at desc
$$;
revoke all on function public.web_delivery_board() from public, anon;
grant execute on function public.web_delivery_board() to authenticated, service_role;

-- the client organisations a maintainer can open a project for: TEBOS clients with an active plan
create function public.web_delivery_clients()
returns table (org_id uuid, org_name text, plan text)
language sql stable security definer set search_path = '' as $$
  select o.id, o.name, tebos_private.active_plan(o.id)
    from public.organisations o
   where tebos_private.is_staff(array['maintainer']) and o.app = 'tebos'
     and tebos_private.active_plan(o.id) in ('starter', 'growth', 'company')
   order by o.name
$$;
revoke all on function public.web_delivery_clients() from public, anon;
grant execute on function public.web_delivery_clients() to authenticated, service_role;
