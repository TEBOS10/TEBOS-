-- The template catalogue and the factory's run log (founder's master blueprint, 23 Oct 2026, §5 and §7.2; started on
-- the founder's word, 26 Oct). A template is an internal product first: it is never offered to a client because it
-- was built, only once a person has approved it with its tests, and sold only with evidence that the problem is real.
--
-- Two records:
--   template_catalogue  one industry archetype at one version, with the three tiers' workflow and part counts (each
--                       inside its plan's ceiling, tebos_private.plan_board_limit) and the evidence behind it.
--                       Draft -> Ready for QA -> Approved internal template -> Available for sale -> Deprecated, or
--                       Blocked (with the blocker named) and back to Draft. Only a signed-in platform admin approves,
--                       puts on sale or deprecates; REEDS and staff prepare. An approved template is fixed: a change
--                       is a new version.
--   factory_runs        what each day's factory run did to one template: why it was chosen, the outcome, the evidence
--                       or the blocker, the next action. Written once, never edited; dated by the database, so no run
--                       can be back-dated. "Completed" needs evidence and a template that has at least reached QA.
-- Both are TEBOS's own internal records: staff (maintainers) and the server see them; clients don't.
-- Mirrored by src/domain/catalogue.ts.

insert into public.state_transitions (machine, from_state, to_state) values
  ('catalogue_template', '(initial)', 'draft'),
  ('catalogue_template', 'draft', 'ready_for_qa'),
  ('catalogue_template', 'draft', 'blocked'),
  ('catalogue_template', 'ready_for_qa', 'approved_internal'),
  ('catalogue_template', 'ready_for_qa', 'draft'),
  ('catalogue_template', 'ready_for_qa', 'blocked'),
  ('catalogue_template', 'blocked', 'draft'),
  ('catalogue_template', 'approved_internal', 'available_for_sale'),
  ('catalogue_template', 'approved_internal', 'deprecated'),
  ('catalogue_template', 'available_for_sale', 'deprecated');

create table public.template_catalogue (
  id                   uuid primary key default gen_random_uuid(),
  blueprint_key        text not null check (blueprint_key ~ '^[a-z][a-z0-9-]{1,48}$'),
  version              integer not null check (version >= 1),
  industry             text not null check (length(btrim(industry)) between 1 and 80),
  archetype_name       text not null check (length(btrim(archetype_name)) between 1 and 120),
  problem_statement    text check (problem_statement is null or length(problem_statement) <= 1000),
  target_customer      text check (target_customer is null or length(target_customer) <= 300),
  buyer                text check (buyer is null or length(buyer) <= 300),
  success_metric       text check (success_metric is null or length(success_metric) <= 300),
  evidence             text check (evidence is null or length(evidence) <= 2000),
  validation_state     text not null default 'speculative'
                         check (validation_state in ('evidence_backed', 'promising', 'speculative')),
  status               text not null default 'draft',
  starter_workflows    smallint not null default 0 check (starter_workflows >= 0),
  starter_parts        smallint not null default 0 check (starter_parts >= 0),
  growth_workflows     smallint not null default 0 check (growth_workflows >= 0),
  growth_parts         smallint not null default 0 check (growth_parts >= 0),
  company_workflows    smallint not null default 0 check (company_workflows >= 0),
  company_parts        smallint not null default 0 check (company_parts >= 0),
  setup_steps          text check (setup_steps is null or length(setup_steps) <= 4000),
  test_report          text check (test_report is null or length(test_report) <= 4000),
  known_limitations    text check (known_limitations is null or length(known_limitations) <= 2000),
  rollback_plan        text check (rollback_plan is null or length(rollback_plan) <= 2000),
  maintenance_estimate text check (maintenance_estimate is null or length(maintenance_estimate) <= 500),
  blocker              text check (blocker is null or length(blocker) <= 1000),
  owner_id             uuid references auth.users (id),
  approved_by          uuid references auth.users (id),
  approved_at          timestamptz,
  last_verified_at     timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (blueprint_key, version)
);

-- A person's text, or nothing.
create function tebos_private.filled(p text) returns boolean
language sql immutable set search_path = '' as $$ select coalesce(length(btrim(p)), 0) > 0 $$;

create function tebos_private.guard_template_catalogue() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_human_admin boolean := tebos_private.is_client() and auth.uid() is not null and tebos_private.is_platform_admin();
begin
  if tg_op = 'DELETE' then
    raise exception 'a template stays in the catalogue; deprecate it instead' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  if tebos_private.is_client() and not tebos_private.is_staff(array['maintainer']) then
    raise exception 'the catalogue is kept by TEBOS''s maintainers' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
  end if;
  if tebos_private.looks_secret(concat_ws(' ', new.problem_statement, new.evidence, new.setup_steps, new.test_report,
                                          new.known_limitations, new.rollback_plan, new.blocker)) then
    raise exception 'a template record looks like it contains a password or key; never put secrets in the catalogue'
      using errcode = 'P0001', hint = 'TEBOS_SECRET_REFUSED';
  end if;

  if tg_op = 'INSERT' then
    new.owner_id := case when tebos_private.is_client() then auth.uid() else new.owner_id end;
    new.approved_by := null;
    new.approved_at := null;
    new.last_verified_at := null;
    new.created_at := now();
    new.updated_at := now();
  else
    if (new.blueprint_key, new.version, new.created_at, new.approved_by, new.approved_at)
       is distinct from (old.blueprint_key, old.version, old.created_at, old.approved_by, old.approved_at) then
      raise exception 'a template''s identity and approval record are fixed' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
    end if;
    -- An approved template is fixed; only the evidence may grow before it goes on sale. A change is a new version.
    if old.status in ('approved_internal', 'available_for_sale', 'deprecated')
       and (new.industry, new.archetype_name, new.problem_statement, new.target_customer, new.buyer, new.success_metric,
            new.starter_workflows, new.starter_parts, new.growth_workflows, new.growth_parts, new.company_workflows,
            new.company_parts, new.setup_steps, new.test_report, new.known_limitations, new.rollback_plan,
            new.maintenance_estimate, new.blocker, new.owner_id)
       is distinct from
           (old.industry, old.archetype_name, old.problem_statement, old.target_customer, old.buyer, old.success_metric,
            old.starter_workflows, old.starter_parts, old.growth_workflows, old.growth_parts, old.company_workflows,
            old.company_parts, old.setup_steps, old.test_report, old.known_limitations, old.rollback_plan,
            old.maintenance_estimate, old.blocker, old.owner_id) then
      raise exception 'an approved template is fixed; make a new version to change it'
        using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
    end if;
    if old.status in ('available_for_sale', 'deprecated')
       and (new.evidence, new.validation_state) is distinct from (old.evidence, old.validation_state) then
      raise exception 'the evidence a template was sold on is fixed; make a new version'
        using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
    end if;
    new.last_verified_at := old.last_verified_at;
    new.updated_at := now();
  end if;

  -- Each tier is a total inside its plan's ceiling, and each larger tier holds at least what the smaller one does.
  if new.starter_workflows > tebos_private.plan_board_limit('starter', 'flows')
     or new.starter_parts > tebos_private.plan_board_limit('starter', 'pieces')
     or new.growth_workflows > tebos_private.plan_board_limit('growth', 'flows')
     or new.growth_parts > tebos_private.plan_board_limit('growth', 'pieces')
     or new.company_workflows > tebos_private.plan_board_limit('company', 'flows')
     or new.company_parts > tebos_private.plan_board_limit('company', 'pieces') then
    raise exception 'a tier is over its plan''s ceiling (Small 4 workflows / 10 parts, Medium 10 / 30, Company 40 / 120)'
      using errcode = 'P0001', hint = 'TEBOS_OUT_OF_PLAN';
  end if;
  if new.starter_workflows > new.growth_workflows or new.growth_workflows > new.company_workflows
     or new.starter_parts > new.growth_parts or new.growth_parts > new.company_parts then
    raise exception 'a larger tier includes the smaller one, so its counts can''t be lower'
      using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;

  -- The gates, checked as the status changes.
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'ready_for_qa' then
      if not (tebos_private.filled(new.problem_statement) and tebos_private.filled(new.target_customer)
              and tebos_private.filled(new.buyer) and tebos_private.filled(new.success_metric)) then
        raise exception 'before QA, say whose problem it is, who pays, and how success is measured'
          using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
      end if;
      if new.starter_workflows = 0 or new.starter_parts = 0 then
        raise exception 'before QA, every tier needs at least one workflow and one part' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
      end if;
    elsif new.status = 'blocked' then
      if not tebos_private.filled(new.blocker) then
        raise exception 'name what is blocking the template' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
      end if;
    elsif new.status = 'draft' and old.status = 'blocked' then
      new.blocker := null;
    elsif new.status in ('approved_internal', 'available_for_sale', 'deprecated') then
      if not v_human_admin then
        raise exception 'only a signed-in platform admin approves, sells or retires a template'
          using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
      end if;
      if new.status = 'approved_internal' then
        if not (tebos_private.filled(new.test_report) and tebos_private.filled(new.setup_steps)
                and tebos_private.filled(new.known_limitations) and tebos_private.filled(new.rollback_plan)) then
          raise exception 'approval needs the test report, setup steps, known limitations and rollback plan'
            using errcode = 'P0001', hint = 'TEBOS_EVIDENCE_REQUIRED';
        end if;
        new.approved_by := auth.uid();
        new.approved_at := now();
        new.last_verified_at := now();
      elsif new.status = 'available_for_sale' then
        if new.validation_state <> 'evidence_backed' or not tebos_private.filled(new.evidence) then
          raise exception 'a template goes on sale only with evidence that the customer''s problem is real'
            using errcode = 'P0001', hint = 'TEBOS_EVIDENCE_REQUIRED';
        end if;
      end if;
    end if;
  end if;
  return new;
end $$;

create trigger guard_template_catalogue before insert or update or delete on public.template_catalogue
  for each row execute function tebos_private.guard_template_catalogue();
create trigger enforce_state_machine before insert or update of status on public.template_catalogue
  for each row execute function tebos_private.guard_status('catalogue_template');
create trigger audit after insert or update on public.template_catalogue
  for each row execute function tebos_private.audit_row();

alter table public.template_catalogue enable row level security;
revoke all on public.template_catalogue from anon, authenticated;
grant select on public.template_catalogue to authenticated;
grant insert (blueprint_key, version, industry, archetype_name, problem_statement, target_customer, buyer,
              success_metric, evidence, validation_state, starter_workflows, starter_parts, growth_workflows,
              growth_parts, company_workflows, company_parts, setup_steps, test_report, known_limitations,
              rollback_plan, maintenance_estimate) on public.template_catalogue to authenticated;
grant update (industry, archetype_name, problem_statement, target_customer, buyer, success_metric, evidence,
              validation_state, status, starter_workflows, starter_parts, growth_workflows, growth_parts,
              company_workflows, company_parts, setup_steps, test_report, known_limitations, rollback_plan,
              maintenance_estimate, blocker) on public.template_catalogue to authenticated;
grant all on public.template_catalogue to service_role;
create policy maintainer_reads on public.template_catalogue for select to authenticated
  using (tebos_private.is_staff(array['maintainer']));
create policy maintainer_writes on public.template_catalogue for insert to authenticated
  with check (tebos_private.is_staff(array['maintainer']));
create policy maintainer_updates on public.template_catalogue for update to authenticated
  using (tebos_private.is_staff(array['maintainer'])) with check (tebos_private.is_staff(array['maintainer']));

-- ---------------------------------------------------------------------------
-- The factory's run log
-- ---------------------------------------------------------------------------
create table public.factory_runs (
  id           uuid primary key default gen_random_uuid(),
  run_on       date not null,
  template_id  uuid not null references public.template_catalogue (id),
  reason       text not null check (length(btrim(reason)) between 1 and 1000),
  outcome      text not null check (outcome in ('completed', 'blocked', 'deferred')),
  evidence     text check (evidence is null or length(evidence) <= 2000),
  blocker      text check (blocker is null or length(blocker) <= 1000),
  next_action  text not null check (length(btrim(next_action)) between 1 and 500),
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  unique (run_on, template_id)
);

create function tebos_private.guard_factory_run() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_status text;
begin
  if tg_op <> 'INSERT' then
    raise exception 'a factory run is kept as it was recorded' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  if tebos_private.is_client() and not tebos_private.is_staff(array['maintainer']) then
    raise exception 'factory runs are recorded by TEBOS''s maintainers or REEDS' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
  end if;
  if tebos_private.looks_secret(concat_ws(' ', new.reason, new.evidence, new.blocker, new.next_action)) then
    raise exception 'the run looks like it contains a password or key; never put secrets in the log'
      using errcode = 'P0001', hint = 'TEBOS_SECRET_REFUSED';
  end if;
  new.run_on := (now() at time zone 'Africa/Johannesburg')::date;
  new.created_at := now();
  new.created_by := case when tebos_private.is_client() then auth.uid() else null end;
  if new.outcome = 'completed' then
    if not tebos_private.filled(new.evidence) then
      raise exception 'a completed run needs its evidence: the tests and what changed' using errcode = 'P0001', hint = 'TEBOS_EVIDENCE_REQUIRED';
    end if;
    select status into v_status from public.template_catalogue where id = new.template_id;
    if v_status not in ('ready_for_qa', 'approved_internal', 'available_for_sale') then
      raise exception 'a run is completed only when its template has at least reached QA'
        using errcode = 'P0001', hint = 'TEBOS_EVIDENCE_REQUIRED';
    end if;
  elsif new.outcome = 'blocked' and not tebos_private.filled(new.blocker) then
    raise exception 'name what blocked the run' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  return new;
end $$;

create trigger guard_factory_run before insert or update or delete on public.factory_runs
  for each row execute function tebos_private.guard_factory_run();
create trigger audit after insert on public.factory_runs
  for each row execute function tebos_private.audit_row();

alter table public.factory_runs enable row level security;
revoke all on public.factory_runs from anon, authenticated;
grant select on public.factory_runs to authenticated;
grant insert (template_id, reason, outcome, evidence, blocker, next_action) on public.factory_runs to authenticated;
grant all on public.factory_runs to service_role;
create policy maintainer_reads on public.factory_runs for select to authenticated
  using (tebos_private.is_staff(array['maintainer']));
create policy maintainer_records on public.factory_runs for insert to authenticated
  with check (tebos_private.is_staff(array['maintainer']));
