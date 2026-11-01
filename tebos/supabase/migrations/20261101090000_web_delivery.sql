-- The Web Delivery Division, milestone 1 (founder's operating specification, 1 Nov 2026; docs/web-delivery/,
-- ADR 0011): the project record, its state machine, immutable scope revisions held to the purchased package, the
-- client's approvals, the readiness checklist and the independent QA verdict. Additive only.
--
-- The rules (mirrored in src/domain/web-delivery.ts and src/domain/states.ts):
--   * A project belongs to one TEBOS client organisation. TEBOS's maintainers run it; the client's members read it.
--   * Every change of state says why (a new status note), and the audit trail records who, when, from and to.
--   * Scope is a numbered, insert-only revision. Its workflows and parts must fit the package's ceiling (the board
--     limits: Small 4/10, Medium 10/30, Company 40/120); more needs a revised quote, a smaller scope or a later phase.
--   * Only the client's own admin approves scope, design and release. TEBOS can't approve on the client's behalf.
--   * Build starts only when the project is ready: the package is the client's active plan, the latest scope and its
--     design are approved by the client, it has acceptance criteria, and every readiness item is met with evidence
--     (only missing assets may be knowingly waived). The three-business-day clock starts then, and pauses while the
--     client blocks it.
--   * Client review needs a QA pass on the latest scope with no critical defect open; release also needs the
--     client's release approval. A QA verdict and an approval can't be edited or removed.

insert into public.state_transitions (machine, from_state, to_state) values
  ('web_project', '(initial)', 'lead'),
  ('web_project', '(initial)', 'intake'),
  ('web_project', 'lead', 'intake'),
  ('web_project', 'lead', 'cancelled'),
  ('web_project', 'intake', 'scope_review'),
  ('web_project', 'intake', 'blocked_client'),
  ('web_project', 'intake', 'cancelled'),
  ('web_project', 'scope_review', 'approval'),
  ('web_project', 'scope_review', 'intake'),
  ('web_project', 'scope_review', 'blocked_client'),
  ('web_project', 'scope_review', 'cancelled'),
  ('web_project', 'approval', 'build'),
  ('web_project', 'approval', 'scope_review'),
  ('web_project', 'approval', 'blocked_client'),
  ('web_project', 'approval', 'cancelled'),
  ('web_project', 'build', 'qa'),
  ('web_project', 'build', 'blocked_client'),
  ('web_project', 'build', 'blocked_technical'),
  ('web_project', 'build', 'scope_change'),
  ('web_project', 'build', 'cancelled'),
  ('web_project', 'qa', 'client_review'),
  ('web_project', 'qa', 'qa_failed'),
  ('web_project', 'qa', 'cancelled'),
  ('web_project', 'qa_failed', 'build'),
  ('web_project', 'qa_failed', 'cancelled'),
  ('web_project', 'client_review', 'release'),
  ('web_project', 'client_review', 'build'),
  ('web_project', 'client_review', 'scope_change'),
  ('web_project', 'client_review', 'blocked_client'),
  ('web_project', 'client_review', 'cancelled'),
  ('web_project', 'release', 'handover'),
  ('web_project', 'release', 'build'),
  ('web_project', 'handover', 'closed'),
  ('web_project', 'blocked_client', 'intake'),
  ('web_project', 'blocked_client', 'scope_review'),
  ('web_project', 'blocked_client', 'approval'),
  ('web_project', 'blocked_client', 'build'),
  ('web_project', 'blocked_client', 'client_review'),
  ('web_project', 'blocked_client', 'cancelled'),
  ('web_project', 'blocked_technical', 'build'),
  ('web_project', 'blocked_technical', 'cancelled'),
  ('web_project', 'scope_change', 'scope_review'),
  ('web_project', 'scope_change', 'cancelled');

-- ---------------------------------------------------------------------------
-- Business days (Africa/Johannesburg; weekends only: public holidays are not yet counted)
-- ---------------------------------------------------------------------------
create function tebos_private.add_business_days(p_from date, p_days integer) returns date
language plpgsql immutable set search_path = '' as $$
declare
  v date := p_from;
  n integer := 0;
begin
  while n < p_days loop
    v := v + 1;
    if extract(isodow from v) < 6 then n := n + 1; end if;
  end loop;
  return v;
end $$;

-- business days after p_from up to and including p_to (0 when p_to is not after p_from)
create function tebos_private.business_days_between(p_from date, p_to date) returns integer
language sql immutable set search_path = '' as $$
  select count(*)::integer from generate_series(p_from + 1, p_to, interval '1 day') d where extract(isodow from d) < 6
$$;

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------
create sequence public.web_project_ref_seq;

create table public.web_projects (
  id                uuid primary key default gen_random_uuid(),
  ref               text not null unique default 'WP-' || lpad(nextval('public.web_project_ref_seq')::text, 4, '0'),
  org_id            uuid not null references public.organisations (id),
  name              text not null check (length(trim(name)) between 2 and 120),
  website_type      text not null check (website_type in ('landing_page', 'corporate', 'service_business', 'portfolio',
                      'ecommerce', 'booking', 'property', 'membership', 'saas_dashboard', 'custom_application')),
  primary_objective text not null check (primary_objective in ('leads', 'sell_online', 'bookings', 'showcase',
                      'corporate_presence', 'content', 'client_portal', 'web_application', 'other')),
  plan              text not null check (plan in ('starter', 'growth', 'company')),
  status            text not null default 'intake',
  status_note       text not null check (length(trim(status_note)) between 10 and 1000),
  deadline_on       date,
  clock_paused_on   date,
  created_by        uuid references auth.users (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, org_id),
  check (not tebos_private.looks_personal(name) and not tebos_private.looks_personal(status_note)),
  check (not tebos_private.looks_secret(status_note))
);
create index web_projects_org_idx on public.web_projects (org_id);
create index web_projects_open_idx on public.web_projects (deadline_on) where status not in ('closed', 'cancelled');

-- ---------------------------------------------------------------------------
-- Scope revisions: insert-only, numbered, held to the package
-- ---------------------------------------------------------------------------
create table public.web_scope_revisions (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null,
  org_id              uuid not null,
  revision            integer not null check (revision >= 1),
  pages               text[] not null check (cardinality(pages) between 1 and 120),
  features            text[] not null default '{}',
  workflows           text[] not null default '{}',
  exclusions          text not null check (length(trim(exclusions)) between 10 and 2000),
  primary_conversion  text not null check (length(trim(primary_conversion)) between 10 and 300),
  acceptance_criteria text[] not null check (cardinality(acceptance_criteria) between 1 and 60),
  recurring_costs     text not null check (length(trim(recurring_costs)) between 4 and 1000),
  created_by          uuid references auth.users (id),
  created_at          timestamptz not null default now(),
  unique (project_id, revision),
  unique (id, project_id),
  foreign key (project_id, org_id) references public.web_projects (id, org_id),
  check (not tebos_private.looks_secret(exclusions) and not tebos_private.looks_secret(recurring_costs))
);

-- ---------------------------------------------------------------------------
-- The client's approvals: scope, design direction, production release
-- ---------------------------------------------------------------------------
create table public.web_project_approvals (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null,
  org_id      uuid not null,
  revision_id uuid not null,
  kind        text not null check (kind in ('scope', 'design', 'release')),
  approved_by uuid references auth.users (id),
  note        text check (note is null or length(note) <= 1000),
  created_at  timestamptz not null default now(),
  unique (revision_id, kind),
  foreign key (project_id, org_id) references public.web_projects (id, org_id),
  foreign key (revision_id, project_id) references public.web_scope_revisions (id, project_id),
  check (not tebos_private.looks_secret(note))
);

-- ---------------------------------------------------------------------------
-- Readiness: the checklist items a person must confirm with evidence
-- ---------------------------------------------------------------------------
create table public.web_readiness_items (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null,
  org_id      uuid not null,
  item        text not null check (item in ('commercial_terms', 'intake_complete', 'assets', 'technical_access',
                'dependencies', 'delivery_window', 'security_privacy', 'release_authority')),
  status      text not null check (status in ('missing', 'met', 'waived')),
  evidence    text check (evidence is null or length(evidence) <= 2000),
  updated_by  uuid references auth.users (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (project_id, item),
  foreign key (project_id, org_id) references public.web_projects (id, org_id),
  check (status = 'missing' or length(trim(coalesce(evidence, ''))) >= 10),
  check (status <> 'waived' or item = 'assets'),
  check (not tebos_private.looks_secret(evidence))
);

-- ---------------------------------------------------------------------------
-- Independent QA verdicts: insert-only
-- ---------------------------------------------------------------------------
create table public.web_qa_runs (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null,
  org_id        uuid not null,
  revision_id   uuid not null,
  verdict       text not null check (verdict in ('pass', 'conditional_pass', 'fail')),
  critical_open integer not null check (critical_open >= 0),
  checked       text[] not null check (cardinality(checked) between 1 and 60),
  evidence      text not null check (length(trim(evidence)) between 20 and 4000),
  tested_url    text check (tested_url is null or (tested_url ~ '^https://' and length(tested_url) <= 400)),
  run_by        uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  foreign key (project_id, org_id) references public.web_projects (id, org_id),
  foreign key (revision_id, project_id) references public.web_scope_revisions (id, project_id),
  check (verdict = 'fail' or critical_open = 0),
  check (not tebos_private.looks_secret(evidence))
);
create index web_qa_runs_project_idx on public.web_qa_runs (project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Readiness and gates
-- ---------------------------------------------------------------------------
create function tebos_private.web_latest_revision(p_project uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.web_scope_revisions where project_id = p_project order by revision desc limit 1
$$;

create function tebos_private.web_approved(p_revision uuid, p_kind text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_revision is not null and exists (select 1 from public.web_project_approvals where revision_id = p_revision and kind = p_kind)
$$;

-- what still stands between a project and its build, in plain words; empty means ready
create function tebos_private.web_readiness_gaps(p_project uuid) returns text[]
language plpgsql stable security definer set search_path = '' as $$
declare
  p public.web_projects;
  v_rev uuid;
  v_gaps text[] := '{}';
  v_item text;
begin
  select * into p from public.web_projects where id = p_project;
  if tebos_private.active_plan(p.org_id) is distinct from p.plan then
    v_gaps := array_append(v_gaps, 'package: the project''s package is not the client''s active plan'::text);
  end if;
  v_rev := tebos_private.web_latest_revision(p_project);
  if v_rev is null then
    v_gaps := array_append(v_gaps, 'scope: no scope has been written'::text);
  else
    if not tebos_private.web_approved(v_rev, 'scope') then
      v_gaps := array_append(v_gaps, 'scope: the client has not approved the latest scope, its exclusions and recurring costs'::text);
    end if;
    if not tebos_private.web_approved(v_rev, 'design') then
      v_gaps := array_append(v_gaps, 'design: the client has not approved the design direction for the latest scope'::text);
    end if;
  end if;
  foreach v_item in array array['commercial_terms', 'intake_complete', 'assets', 'technical_access', 'dependencies',
                                'delivery_window', 'security_privacy', 'release_authority'] loop
    if not exists (select 1 from public.web_readiness_items r where r.project_id = p_project and r.item = v_item
                    and r.status in ('met', 'waived')) then
      v_gaps := array_append(v_gaps, (v_item || ': not confirmed with evidence')::text);
    end if;
  end loop;
  return v_gaps;
end $$;

-- the latest QA verdict on the latest scope passes with nothing critical open
create function tebos_private.web_qa_passed(p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select q.verdict in ('pass', 'conditional_pass') and q.critical_open = 0
                     from public.web_qa_runs q
                    where q.project_id = p_project and q.revision_id = tebos_private.web_latest_revision(p_project)
                    order by q.created_at desc, q.id desc limit 1), false)
$$;

-- which app an organisation belongs to, read with the definer's rights (TEBOS staff aren't members of client orgs)
create function tebos_private.web_org_app(p_org uuid) returns text
language sql stable security definer set search_path = '' as $$
  select app from public.organisations where id = p_org
$$;

create function tebos_private.guard_web_project() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_gaps text[];
  v_today date := tebos_private.sa_today();
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.deadline_on := null;
    new.clock_paused_on := null;
    if tebos_private.web_org_app(new.org_id) is distinct from 'tebos' then
      raise exception 'a web project belongs to a TEBOS client organisation' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    return new;
  end if;

  if (new.org_id, new.ref, new.created_by) is distinct from (old.org_id, old.ref, old.created_by) then
    raise exception 'a project''s client, reference and creator don''t change' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  -- the clock is the database's, not anyone's to edit
  new.deadline_on := old.deadline_on;
  new.clock_paused_on := old.clock_paused_on;
  if new.plan is distinct from old.plan and old.status not in ('lead', 'intake', 'scope_review', 'scope_change') then
    raise exception 'the package is fixed once scope is approved; change it through a scope change' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;

  if new.status is distinct from old.status then
    if new.status_note is not distinct from old.status_note then
      raise exception 'every change of state says why' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    if new.status = 'build' then
      v_gaps := tebos_private.web_readiness_gaps(new.id);
      if cardinality(v_gaps) > 0 then
        raise exception 'not ready to build: %', array_to_string(v_gaps, '; ') using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
      end if;
      if old.deadline_on is null then
        new.deadline_on := tebos_private.add_business_days(v_today, 3);
      elsif old.clock_paused_on is not null then
        new.deadline_on := tebos_private.add_business_days(old.deadline_on, tebos_private.business_days_between(old.clock_paused_on, v_today));
      end if;
      new.clock_paused_on := null;
    elsif new.status = 'blocked_client' and old.deadline_on is not null then
      new.clock_paused_on := v_today;
    elsif old.status = 'blocked_client' and old.clock_paused_on is not null and old.deadline_on is not null then
      -- leaving the pause for anything but build (e.g. client review): the client's days still don't count
      new.deadline_on := tebos_private.add_business_days(old.deadline_on, tebos_private.business_days_between(old.clock_paused_on, v_today));
      new.clock_paused_on := null;
    end if;
    if new.status = 'client_review' and not tebos_private.web_qa_passed(new.id) then
      raise exception 'client review needs a QA pass on the latest scope with no critical defect open' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    if new.status = 'release' then
      if not tebos_private.web_qa_passed(new.id) then
        raise exception 'release needs a QA pass on the latest scope with no critical defect open' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
      end if;
      if not tebos_private.web_approved(tebos_private.web_latest_revision(new.id), 'release') then
        raise exception 'release needs the client''s release approval on the latest scope' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
      end if;
    end if;
  end if;
  return new;
end $$;

-- scope: numbered by the database, written while scope is open, and inside the package
create function tebos_private.guard_web_scope() returns trigger
language plpgsql set search_path = '' as $$
declare
  p public.web_projects;
  v_flows integer;
  v_parts integer;
begin
  if tg_op <> 'INSERT' then
    raise exception 'a scope revision can''t be changed or removed; write a new revision' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  select * into p from public.web_projects where id = new.project_id;
  if p.status not in ('intake', 'scope_review', 'scope_change') then
    raise exception 'scope is written in intake, scope review or a scope change, not in %', p.status using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  new.created_by := auth.uid();
  new.created_at := now();
  new.revision := coalesce((select max(revision) from public.web_scope_revisions where project_id = new.project_id), 0) + 1;
  v_flows := tebos_private.plan_board_limit(p.plan, 'flows');
  v_parts := tebos_private.plan_board_limit(p.plan, 'pieces');
  if cardinality(new.workflows) > v_flows or cardinality(new.pages) + cardinality(new.features) > v_parts then
    raise exception 'the % package holds up to % workflows and % parts (pages and features); offer a revised quote, a smaller launch scope or a later phase',
      case p.plan when 'growth' then 'Medium' when 'company' then 'Company' else 'Small' end, v_flows, v_parts
      using errcode = 'P0001', hint = 'TEBOS_OUT_OF_PLAN';
  end if;
  return new;
end $$;

-- approvals: the client's own admin, on a revision of this project, once; never edited
create function tebos_private.guard_web_approval() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'an approval can''t be changed or withdrawn; a new scope revision needs its own' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  new.approved_by := auth.uid();
  new.created_at := now();
  if new.approved_by is null or not exists (select 1 from public.memberships m
       where m.org_id = new.org_id and m.user_id = new.approved_by and m.role = 'org_admin') then
    raise exception 'only the client''s own admin approves their project' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  if new.kind = 'release' and not tebos_private.web_qa_passed(new.project_id) then
    raise exception 'a release is approved only after a QA pass on the latest scope' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  return new;
end $$;

create function tebos_private.guard_web_readiness() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.project_id, new.item) is distinct from (old.project_id, old.item) then
    raise exception 'a readiness item stays on its project' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  new.updated_by := auth.uid();
  return new;
end $$;

create function tebos_private.guard_web_qa() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'a QA verdict can''t be changed or removed; run QA again' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  new.run_by := auth.uid();
  new.created_at := now();
  if not exists (select 1 from public.web_projects p where p.id = new.project_id and p.status in ('qa', 'client_review', 'release')) then
    raise exception 'QA is recorded while the project is in QA, client review or release' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  return new;
end $$;

create trigger enforce_state_machine before insert or update of status on public.web_projects
  for each row execute function tebos_private.guard_status('web_project');
create trigger guard_web_project before insert or update on public.web_projects
  for each row execute function tebos_private.guard_web_project();
create trigger touch before update on public.web_projects
  for each row execute function tebos_private.touch_updated_at();
create trigger audit after insert or update or delete on public.web_projects
  for each row execute function tebos_private.audit_row();

create trigger guard_web_scope before insert or update or delete on public.web_scope_revisions
  for each row execute function tebos_private.guard_web_scope();
create trigger audit after insert or update or delete on public.web_scope_revisions
  for each row execute function tebos_private.audit_row();

create trigger guard_web_approval before insert or update or delete on public.web_project_approvals
  for each row execute function tebos_private.guard_web_approval();
create trigger audit after insert or update or delete on public.web_project_approvals
  for each row execute function tebos_private.audit_row();

create trigger guard_web_readiness before insert or update on public.web_readiness_items
  for each row execute function tebos_private.guard_web_readiness();
create trigger touch before update on public.web_readiness_items
  for each row execute function tebos_private.touch_updated_at();
create trigger audit after insert or update or delete on public.web_readiness_items
  for each row execute function tebos_private.audit_row();

create trigger guard_web_qa before insert or update or delete on public.web_qa_runs
  for each row execute function tebos_private.guard_web_qa();
create trigger audit after insert or update or delete on public.web_qa_runs
  for each row execute function tebos_private.audit_row();

-- ---------------------------------------------------------------------------
-- Access: TEBOS's maintainers run projects; the client's members read their own; the client's admin approves
-- ---------------------------------------------------------------------------
alter table public.web_projects enable row level security;
create policy read on public.web_projects for select to authenticated
  using (tebos_private.is_staff(array['maintainer']) or tebos_private.is_member(org_id));
create policy staff_insert on public.web_projects for insert to authenticated
  with check (tebos_private.is_staff(array['maintainer']));
create policy staff_update on public.web_projects for update to authenticated
  using (tebos_private.is_staff(array['maintainer'])) with check (tebos_private.is_staff(array['maintainer']));
grant select, insert on public.web_projects to authenticated;
grant update (name, website_type, primary_objective, plan, status, status_note) on public.web_projects to authenticated;
grant usage on sequence public.web_project_ref_seq to authenticated;

alter table public.web_scope_revisions enable row level security;
create policy read on public.web_scope_revisions for select to authenticated
  using (tebos_private.is_staff(array['maintainer']) or tebos_private.is_member(org_id));
create policy staff_insert on public.web_scope_revisions for insert to authenticated
  with check (tebos_private.is_staff(array['maintainer']));
grant select, insert on public.web_scope_revisions to authenticated;

alter table public.web_project_approvals enable row level security;
create policy read on public.web_project_approvals for select to authenticated
  using (tebos_private.is_staff(array['maintainer']) or tebos_private.is_member(org_id));
create policy client_admin_insert on public.web_project_approvals for insert to authenticated
  with check (tebos_private.has_role(org_id, array['org_admin']));
grant select, insert on public.web_project_approvals to authenticated;

alter table public.web_readiness_items enable row level security;
create policy read on public.web_readiness_items for select to authenticated
  using (tebos_private.is_staff(array['maintainer']) or tebos_private.is_member(org_id));
create policy staff_insert on public.web_readiness_items for insert to authenticated
  with check (tebos_private.is_staff(array['maintainer']));
create policy staff_update on public.web_readiness_items for update to authenticated
  using (tebos_private.is_staff(array['maintainer'])) with check (tebos_private.is_staff(array['maintainer']));
grant select, insert on public.web_readiness_items to authenticated;
grant update (status, evidence) on public.web_readiness_items to authenticated;

alter table public.web_qa_runs enable row level security;
create policy read on public.web_qa_runs for select to authenticated
  using (tebos_private.is_staff(array['maintainer']) or tebos_private.is_member(org_id));
create policy staff_insert on public.web_qa_runs for insert to authenticated
  with check (tebos_private.is_staff(array['maintainer']));
grant select, insert on public.web_qa_runs to authenticated;

grant all on public.web_projects, public.web_scope_revisions, public.web_project_approvals,
  public.web_readiness_items, public.web_qa_runs to service_role;
grant usage on sequence public.web_project_ref_seq to service_role;

-- what still stands between a project and its build, for anyone who can read the project
create function public.web_project_readiness(p_project uuid) returns text[]
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid;
begin
  select org_id into v_org from public.web_projects where id = p_project;
  if v_org is null or not (tebos_private.is_staff(array['maintainer']) or tebos_private.is_member(v_org)) then
    raise exception 'no such project' using errcode = '42501';
  end if;
  return tebos_private.web_readiness_gaps(p_project);
end $$;
revoke all on function public.web_project_readiness(uuid) from public, anon;
grant execute on function public.web_project_readiness(uuid) to authenticated, service_role;
