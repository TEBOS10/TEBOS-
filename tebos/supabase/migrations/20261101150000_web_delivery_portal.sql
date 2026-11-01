-- The Web Delivery Division, milestone 3 (founder, 1 Nov 2026: "capacity for 50 clients at one go", "accounts for
-- clients, with TEBOS having access to modify their systems", "should they need to modify something they are directly
-- in communication with TEBOS, and TEBOS delivers"; docs/web-delivery/, ADR 0012). Additive only.
--
-- The rules (mirrored in src/domain/web-delivery.ts):
--   * Every project has a TEBOS maintainer: by default the client's assigned maintainer from the pipeline. A maintainer
--     holds at most 8 open projects, so capacity is set by the team, not by the founder: 50 clients need 7 maintainers.
--   * A client asks for a change to their website from their own account: a change request linked to the project,
--     counted against their plan's monthly allowance, as every change request is.
--   * Accounts belong to the client. TEBOS records each service the site uses, who owns the account, the access TEBOS
--     was given and how that access is revoked. An account TEBOS holds for a client needs a plan to hand it over.
--     Passwords and keys are never stored here.
--   * Costs are recorded per project. A recurring cost the client pays must have been disclosed to them.
--   * A project's history is read from the audit trail, for TEBOS's maintainers and the client's own members.

-- ---------------------------------------------------------------------------
-- Maintainers and capacity
-- ---------------------------------------------------------------------------
alter table public.web_projects add column maintainer_id uuid references auth.users (id);
create index web_projects_maintainer_idx on public.web_projects (maintainer_id) where status not in ('closed', 'cancelled');

create function tebos_private.web_open_load(p_user uuid, p_except uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.web_projects
   where maintainer_id = p_user and status not in ('lead', 'closed', 'cancelled') and id is distinct from p_except
$$;

-- the client's maintainer from the pipeline, if one was assigned
create function tebos_private.web_client_maintainer(p_org uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select maintainer_id from public.opportunities where org_id = p_org and maintainer_id is not null order by updated_at desc limit 1
$$;

create function tebos_private.guard_web_assignment() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.maintainer_id is null then
    new.maintainer_id := tebos_private.web_client_maintainer(new.org_id);
  end if;
  if new.maintainer_id is not null and (tg_op = 'INSERT' or new.maintainer_id is distinct from old.maintainer_id
       or (old.status in ('lead', 'closed', 'cancelled') and new.status not in ('lead', 'closed', 'cancelled'))) then
    if not tebos_private.user_has_staff_role(new.maintainer_id, 'maintainer') then
      raise exception 'a project is run by one of TEBOS''s maintainers' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    if new.status not in ('lead', 'closed', 'cancelled') and tebos_private.web_open_load(new.maintainer_id, new.id) >= 8 then
      raise exception 'that maintainer already runs 8 open projects; assign another maintainer, or invite one' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
  end if;
  return new;
end $$;

create trigger guard_web_assignment before insert or update of maintainer_id, status on public.web_projects
  for each row execute function tebos_private.guard_web_assignment();
grant update (maintainer_id) on public.web_projects to authenticated;

-- each maintainer's load: open projects, in build or QA, and late
create function public.web_team_load()
returns table (user_id uuid, open_projects integer, building integer, overdue integer, capacity integer)
language sql stable security definer set search_path = '' as $$
  select s.user_id,
         (select count(*)::integer from public.web_projects p where p.maintainer_id = s.user_id and p.status not in ('lead', 'closed', 'cancelled')),
         (select count(*)::integer from public.web_projects p where p.maintainer_id = s.user_id and p.status in ('build', 'qa', 'qa_failed')),
         (select count(*)::integer from public.web_projects p where p.maintainer_id = s.user_id and p.status in ('build', 'qa', 'qa_failed', 'blocked_technical')
            and p.clock_paused_on is null and p.deadline_on < tebos_private.sa_today()),
         8
    from (select distinct user_id from public.platform_staff where role = 'maintainer') s
   where tebos_private.is_staff(array['maintainer'])
   order by 2 desc
$$;
revoke all on function public.web_team_load() from public, anon;
grant execute on function public.web_team_load() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- A client's change request about their website lands on the project
-- ---------------------------------------------------------------------------
alter table public.change_requests
  add column web_project_id uuid,
  add constraint change_requests_web_project_fk foreign key (web_project_id, org_id) references public.web_projects (id, org_id);
create index change_requests_web_project_idx on public.change_requests (web_project_id) where web_project_id is not null;
grant insert (web_project_id) on public.change_requests to authenticated;

-- ---------------------------------------------------------------------------
-- The accounts a site depends on: owned by the client, with TEBOS's delegated access recorded
-- ---------------------------------------------------------------------------
create table public.web_integrations (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null,
  org_id          uuid not null,
  service         text not null check (service in ('hosting', 'domain', 'dns', 'repository', 'database', 'email', 'payments',
                    'analytics', 'cms', 'booking', 'maps', 'other')),
  provider        text not null check (length(trim(provider)) between 2 and 80),
  account_owner   text not null default 'client' check (account_owner in ('client', 'tebos')),
  tebos_access    text not null default 'none' check (tebos_access in ('none', 'read', 'deploy', 'admin')),
  purpose         text not null check (length(trim(purpose)) between 10 and 500),
  status          text not null default 'requested' check (status in ('requested', 'granted', 'verified', 'revoked')),
  verified_on     date,
  revocation_plan text check (revocation_plan is null or length(revocation_plan) <= 1000),
  transfer_plan   text check (transfer_plan is null or length(transfer_plan) <= 1000),
  created_by      uuid references auth.users (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (project_id, org_id) references public.web_projects (id, org_id),
  check (tebos_access = 'none' or length(trim(coalesce(revocation_plan, ''))) >= 10),
  check (account_owner = 'client' or length(trim(coalesce(transfer_plan, ''))) >= 10),
  check (status <> 'verified' or verified_on is not null),
  check (status <> 'revoked' or tebos_access = 'none'),
  check (not tebos_private.looks_secret(provider) and not tebos_private.looks_secret(purpose)
     and not tebos_private.looks_secret(revocation_plan) and not tebos_private.looks_secret(transfer_plan))
);
create index web_integrations_project_idx on public.web_integrations (project_id);

-- ---------------------------------------------------------------------------
-- Costs per project
-- ---------------------------------------------------------------------------
create table public.web_project_costs (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null,
  org_id              uuid not null,
  kind                text not null check (kind in ('hosting', 'domain', 'software', 'assets', 'ai_usage', 'labour', 'other')),
  description         text not null check (length(trim(description)) between 5 and 300),
  amount_cents        integer not null check (amount_cents >= 0),
  currency            text not null default 'ZAR' check (currency = 'ZAR'),
  recurrence          text not null check (recurrence in ('once', 'monthly', 'yearly')),
  paid_by             text not null check (paid_by in ('client', 'tebos')),
  disclosed_to_client boolean not null default false,
  incurred_on         date not null default (now() at time zone 'Africa/Johannesburg')::date,
  recorded_by         uuid references auth.users (id),
  created_at          timestamptz not null default now(),
  foreign key (project_id, org_id) references public.web_projects (id, org_id),
  check (paid_by = 'tebos' or recurrence = 'once' or disclosed_to_client),
  check (not tebos_private.looks_secret(description))
);
create index web_project_costs_project_idx on public.web_project_costs (project_id);

create function tebos_private.guard_web_record() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if tg_table_name = 'web_integrations' then new.created_by := auth.uid(); else new.recorded_by := auth.uid(); end if;
    return new;
  end if;
  if (new.project_id, new.org_id) is distinct from (old.project_id, old.org_id) then
    raise exception 'a record stays on its project' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  return new;
end $$;

create trigger guard_web_record before insert or update on public.web_integrations
  for each row execute function tebos_private.guard_web_record();
create trigger touch before update on public.web_integrations
  for each row execute function tebos_private.touch_updated_at();
create trigger audit after insert or update or delete on public.web_integrations
  for each row execute function tebos_private.audit_row();
create trigger guard_web_record before insert or update on public.web_project_costs
  for each row execute function tebos_private.guard_web_record();
create trigger audit after insert or update or delete on public.web_project_costs
  for each row execute function tebos_private.audit_row();

alter table public.web_integrations enable row level security;
create policy read on public.web_integrations for select to authenticated
  using (tebos_private.is_staff(array['maintainer']) or tebos_private.is_member(org_id));
create policy staff_insert on public.web_integrations for insert to authenticated
  with check (tebos_private.is_staff(array['maintainer']));
create policy staff_update on public.web_integrations for update to authenticated
  using (tebos_private.is_staff(array['maintainer'])) with check (tebos_private.is_staff(array['maintainer']));
grant select, insert on public.web_integrations to authenticated;
grant update (provider, account_owner, tebos_access, purpose, status, verified_on, revocation_plan, transfer_plan) on public.web_integrations to authenticated;

alter table public.web_project_costs enable row level security;
create policy read on public.web_project_costs for select to authenticated
  using (tebos_private.is_staff(array['maintainer']) or tebos_private.is_member(org_id));
create policy staff_insert on public.web_project_costs for insert to authenticated
  with check (tebos_private.is_staff(array['maintainer']));
create policy staff_update on public.web_project_costs for update to authenticated
  using (tebos_private.is_staff(array['maintainer'])) with check (tebos_private.is_staff(array['maintainer']));
grant select, insert on public.web_project_costs to authenticated;
grant update (disclosed_to_client) on public.web_project_costs to authenticated;

grant all on public.web_integrations, public.web_project_costs to service_role;

-- ---------------------------------------------------------------------------
-- A project's history, from the audit trail
-- ---------------------------------------------------------------------------
create function public.web_project_history(p_project uuid)
returns table (occurred_at timestamptz, by_tebos boolean, action text, entity_type text, from_status text, to_status text, note text)
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid;
begin
  select org_id into v_org from public.web_projects where id = p_project;
  if v_org is null or not (tebos_private.is_staff(array['maintainer']) or tebos_private.is_member(v_org)) then
    raise exception 'no such project' using errcode = '42501';
  end if;
  return query
    select e.occurred_at,
           e.actor_type <> 'user' or exists (select 1 from public.platform_staff s where s.user_id::text = e.actor_id)
             or exists (select 1 from public.platform_admins a where a.user_id::text = e.actor_id),
           e.action, e.entity_type,
           e.before ->> 'status', e.after ->> 'status',
           coalesce(e.after ->> 'status_note', e.after ->> 'title', e.after ->> 'label', e.after ->> 'kind')
      from public.audit_events e
     where e.org_id = v_org and e.entity_type like 'web\_%'
       and (e.entity_id = p_project or e.after ->> 'project_id' = p_project::text or e.before ->> 'project_id' = p_project::text)
     order by e.id desc
     limit 200;
end $$;
revoke all on function public.web_project_history(uuid) from public, anon;
grant execute on function public.web_project_history(uuid) to authenticated, service_role;
