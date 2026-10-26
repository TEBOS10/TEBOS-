-- The template catalogue and the factory's run log: maintainers prepare, a signed-in platform admin approves and
-- sells, an approved template is fixed, a sale needs evidence, and no run claims completion without proof.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99zs;
grant usage on schema t99zs to anon, authenticated;
create function t99zs.expect_error(p_sql text, p_expect text) returns void
language plpgsql as $$
declare v_hint text; v_state text; v_msg text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint, v_state = returned_sqlstate, v_msg = message_text;
    if (p_expect like 'TEBOS_%' and v_hint is distinct from p_expect) or (p_expect not like 'TEBOS_%' and v_state <> p_expect) then
      raise exception 'expected % but got % / % (%)', p_expect, v_state, v_hint, v_msg;
    end if;
    return;
  end;
  raise exception 'expected % but statement succeeded: %', p_expect, p_sql;
end $$;
create function t99zs.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t99zs to anon, authenticated;

select '9f9f0000-0000-0000-0000-0000000000d1' as maint, '9f9f0000-0000-0000-0000-0000000000d2' as admin,
       '9f9f0000-0000-0000-0000-0000000000d3' as client, '9f9f0000-0000-0000-0000-0000000000d4' as org \gset
insert into auth.users (id, email, email_confirmed_at) values
  (:'maint', 'm@tebos99zs.test', now()), (:'admin', 'a@tebos99zs.test', now()), (:'client', 'c@client99zs.test', now());
insert into public.platform_staff (user_id, role) values (:'maint', 'maintainer');
insert into public.platform_admins (user_id) values (:'admin');
insert into public.organisations (id, name, slug) values (:'org', 'Client 99zs', 'client-99zs');
insert into public.memberships (org_id, user_id, role) values (:'org', :'client', 'org_admin');

-- ===========================================================================
-- Only TEBOS's maintainers keep the catalogue; clients don't see it
-- ===========================================================================
set role authenticated;
select set_config('request.jwt.claim.sub', :'client', false);
select t99zs.expect_error($$insert into public.template_catalogue (blueprint_key, version, industry, archetype_name)
  values ('education-centre', 1, 'Education', 'Tutoring centre')$$, '42501');

select set_config('request.jwt.claim.sub', :'maint', false);
insert into public.template_catalogue (blueprint_key, version, industry, archetype_name, starter_workflows, starter_parts,
  growth_workflows, growth_parts, company_workflows, company_parts)
  values ('education-centre', 1, 'Education', 'Tutoring centre', 2, 4, 4, 6, 7, 9) returning id as tpl \gset
select t99zs.ok((select status = 'draft' and owner_id = :'maint' and validation_state = 'speculative'
                 from public.template_catalogue where id = :'tpl'), 'a new template is a speculative draft, owned by its maker');

-- the plan's ceilings, and a larger tier holding at least the smaller one
select t99zs.expect_error($$insert into public.template_catalogue (blueprint_key, version, industry, archetype_name, starter_workflows, starter_parts,
  growth_workflows, growth_parts, company_workflows, company_parts) values ('gym-fitness', 1, 'Fitness', 'Gym', 5, 4, 5, 6, 7, 9)$$, 'TEBOS_OUT_OF_PLAN');
select t99zs.expect_error($$update public.template_catalogue set company_parts = 121 where blueprint_key = 'education-centre'$$, 'TEBOS_OUT_OF_PLAN');
select t99zs.expect_error($$update public.template_catalogue set growth_workflows = 1 where blueprint_key = 'education-centre'$$, 'TEBOS_VALIDATION');
-- the state machine comes first: no jumping from draft to sale
select t99zs.expect_error($$update public.template_catalogue set status = 'available_for_sale' where blueprint_key = 'education-centre'$$, 'TEBOS_ILLEGAL_TRANSITION');

-- ===========================================================================
-- The gates
-- ===========================================================================
select t99zs.expect_error($$update public.template_catalogue set status = 'ready_for_qa' where blueprint_key = 'education-centre'$$, 'TEBOS_VALIDATION');
update public.template_catalogue set problem_statement = 'Enrolments and parent updates live on the owner''s phone',
  target_customer = 'Tutoring centres with 1-10 tutors', buyer = 'The owner', success_metric = 'Enquiries answered within a day'
  where id = :'tpl';
update public.template_catalogue set status = 'ready_for_qa' where id = :'tpl';

-- a maintainer (or REEDS) can't approve
select t99zs.expect_error(format($$update public.template_catalogue set status = 'approved_internal' where id = %L$$, :'tpl'), 'TEBOS_PERMISSION_DENIED');
reset role;
select set_config('request.jwt.claim.sub', '', false);
select t99zs.expect_error(format($$update public.template_catalogue set status = 'approved_internal' where id = %L$$, :'tpl'), 'TEBOS_PERMISSION_DENIED');

-- the admin approves only with the tests, setup, limits and rollback
set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
select t99zs.expect_error(format($$update public.template_catalogue set status = 'approved_internal' where id = %L$$, :'tpl'), 'TEBOS_EVIDENCE_REQUIRED');
update public.template_catalogue set test_report = 'test/editions.test.ts and 99zr pass for all three tiers',
  setup_steps = 'Apply the blueprint, confirm each piece, set objectives', known_limitations = 'No payments or bookings integration',
  rollback_plan = 'Retire the laid-down flows; the board keeps its history' where id = :'tpl';
update public.template_catalogue set status = 'approved_internal' where id = :'tpl';
select t99zs.ok((select approved_by = :'admin' and approved_at is not null and last_verified_at is not null
                 from public.template_catalogue where id = :'tpl'), 'approval records who and when');

-- an approved template is fixed; only its evidence may grow
select t99zs.expect_error(format($$update public.template_catalogue set problem_statement = 'Something else' where id = %L$$, :'tpl'), 'TEBOS_INPUT_FROZEN');
select t99zs.expect_error(format($$update public.template_catalogue set approved_by = null where id = %L$$, :'tpl'), '42501');
-- a sale needs evidence that the problem is real
select t99zs.expect_error(format($$update public.template_catalogue set status = 'available_for_sale' where id = %L$$, :'tpl'), 'TEBOS_EVIDENCE_REQUIRED');
update public.template_catalogue set validation_state = 'evidence_backed',
  evidence = 'Three tutoring owners described the problem on calls, 2026-10-24' where id = :'tpl';
update public.template_catalogue set status = 'available_for_sale' where id = :'tpl';
select t99zs.expect_error(format($$update public.template_catalogue set evidence = 'rewritten' where id = %L$$, :'tpl'), 'TEBOS_INPUT_FROZEN');
select t99zs.expect_error(format($$delete from public.template_catalogue where id = %L$$, :'tpl'), '42501');

-- a new version starts again as a draft; a blocked one names its blocker, and going back to draft clears it
select set_config('request.jwt.claim.sub', :'maint', false);
insert into public.template_catalogue (blueprint_key, version, industry, archetype_name, starter_workflows, starter_parts,
  growth_workflows, growth_parts, company_workflows, company_parts)
  values ('education-centre', 2, 'Education', 'Tutoring centre', 2, 4, 4, 6, 7, 9) returning id as tpl2 \gset
select t99zs.expect_error($$insert into public.template_catalogue (blueprint_key, version, industry, archetype_name)
  values ('education-centre', 2, 'Education', 'Duplicate')$$, '23505');
select t99zs.expect_error(format($$update public.template_catalogue set status = 'blocked' where id = %L$$, :'tpl2'), 'TEBOS_VALIDATION');
update public.template_catalogue set blocker = 'Waiting for a real tutoring client to test enrolment', status = 'blocked' where id = :'tpl2';
update public.template_catalogue set status = 'draft' where id = :'tpl2';
select t99zs.ok((select blocker is null from public.template_catalogue where id = :'tpl2'), 'back to draft clears the blocker');
select t99zs.expect_error($$update public.template_catalogue set problem_statement = 'our password: hunter22' where version = 2$$, 'TEBOS_SECRET_REFUSED');

-- ===========================================================================
-- The factory's run log
-- ===========================================================================
select t99zs.expect_error(format($$insert into public.factory_runs (template_id, reason, outcome, evidence, next_action)
  values (%L, 'Tutoring leads on the call sheet', 'completed', 'tests pass', 'Approve')$$, :'tpl2'), 'TEBOS_EVIDENCE_REQUIRED');
select t99zs.expect_error(format($$insert into public.factory_runs (template_id, reason, outcome, next_action)
  values (%L, 'Tutoring leads on the call sheet', 'completed', 'Approve')$$, :'tpl'), 'TEBOS_EVIDENCE_REQUIRED');
select t99zs.expect_error(format($$insert into public.factory_runs (template_id, reason, outcome, next_action)
  values (%L, 'Tutoring leads', 'blocked', 'Find a test client')$$, :'tpl2'), 'TEBOS_VALIDATION');
-- a person can't even send a date
select t99zs.expect_error(format($$insert into public.factory_runs (template_id, reason, outcome, next_action, run_on)
  values (%L, 'Back-dated', 'deferred', 'x', '2020-01-01')$$, :'tpl'), '42501');
insert into public.factory_runs (template_id, reason, outcome, evidence, next_action)
  values (:'tpl', 'Tutoring leads on the call sheet', 'completed', 'v1 approved; tests in test_report', 'Offer to the first tutoring lead')
  returning id as run \gset
-- and the server, which can, is overruled by the database's clock
reset role;
insert into public.factory_runs (template_id, reason, outcome, next_action, run_on)
  values (:'tpl2', 'REEDS run', 'deferred', 'Retry tomorrow', '2020-01-01') returning id as srvrun \gset
select t99zs.ok((select run_on = (now() at time zone 'Africa/Johannesburg')::date and created_by is null
                 from public.factory_runs where id = :'srvrun'), 'the server''s run is dated today, with no person on it');
set role authenticated;
select t99zs.ok((select run_on = (now() at time zone 'Africa/Johannesburg')::date and created_by = :'maint'
                 from public.factory_runs where id = :'run'), 'a run is dated by the database, never back-dated');
select t99zs.expect_error(format($$insert into public.factory_runs (template_id, reason, outcome, next_action)
  values (%L, 'Again', 'deferred', 'Tomorrow')$$, :'tpl'), '23505');
select t99zs.expect_error(format($$update public.factory_runs set outcome = 'deferred' where id = %L$$, :'run'), '42501');

-- a client sees neither
select set_config('request.jwt.claim.sub', :'client', false);
select t99zs.ok((select count(*) = 0 from public.template_catalogue), 'a client doesn''t see the catalogue');
select t99zs.ok((select count(*) = 0 from public.factory_runs), 'a client doesn''t see the runs');
select t99zs.expect_error(format($$insert into public.factory_runs (template_id, reason, outcome, next_action)
  values (%L, 'x', 'deferred', 'y')$$, :'tpl2'), '42501');

-- everything is on the platform's audit trail
reset role;
select t99zs.ok((select count(*) >= 10 from public.audit_events where entity_type = 'template_catalogue' and entity_id in (:'tpl', :'tpl2')),
  'catalogue changes are audited');
select t99zs.ok((select count(*) = 1 from public.audit_events where entity_type = 'factory_runs' and entity_id = :'run'), 'the run is audited');
