-- The Board and the Objective: targets can't move once set, "achieved" needs a
-- value read from a connected system, and the board's pieces keep their
-- provenance. Also: clients can't pose as TEBOS's server in the evidence.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t7;
grant usage on schema t7 to anon, authenticated;
create function t7.expect_error(p_sql text, p_expect text) returns void
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
create function t7.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t7 to anon, authenticated;

select '70000000-0000-0000-0000-00000000000a' as admin, '70000000-0000-0000-0000-00000000000b' as outsider,
       '70000000-0000-0000-0000-00000000000c' as viewer \gset
insert into auth.users (id, email, email_confirmed_at) values
  (:'admin', 'admin@board.test', now()), (:'outsider', 'outsider@board.test', now()), (:'viewer', 'viewer@board.test', now());

set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
select public.create_organisation('Board test', 'board-test') as org \gset
insert into public.memberships (org_id, user_id, role) values (:'org', :'viewer', 'viewer');
insert into public.businesses (org_id, name) values (:'org', 'Agency') returning id as biz \gset
insert into public.businesses (org_id, name) values (:'org', 'Other agency') returning id as biz2 \gset

-- ===========================================================================
-- Provenance: a client can't pose as TEBOS's server
-- ===========================================================================
select t7.expect_error(format('insert into public.sources (org_id, business_id, source_type, uri) values (%L, %L, %L, %L)',
  :'org', :'biz', 'connected_system', 'crm:fake'), 'TEBOS_SERVER_ONLY');
insert into public.sources (org_id, business_id, source_type, uri) values (:'org', :'biz', 'user_statement', 'owner') returning id as said \gset
select t7.expect_error(format('update public.sources set source_type = %L where id = %L', 'connected_system', :'said'), 'TEBOS_SERVER_ONLY');
select t7.expect_error(format('insert into public.evidence (org_id, business_id, source_id, state, fact) values (%L, %L, %L, %L, %L)',
  :'org', :'biz', :'said', 'system_generated', 'Revenue is R3m'), 'TEBOS_SERVER_ONLY');
insert into public.evidence (org_id, business_id, source_id, state, fact, created_by_actor)
  values (:'org', :'biz', :'said', 'user_supplied', 'Revenue last year was about R1.8m', 'agent') returning id as stated_ev \gset
select t7.ok((select created_by_actor = 'user' from public.evidence where id = :'stated_ev'), 'a client''s evidence is recorded as the user''s');
select t7.expect_error(format('update public.evidence set created_by_actor = %L where id = %L', 'agent', :'stated_ev'), 'TEBOS_SERVER_ONLY');
insert into public.evidence (org_id, business_id, source_id, state, missing_description)
  values (:'org', :'biz', :'said', 'unavailable', 'Owner could not say') returning id as missing_ev \gset
reset role;

-- The server records a connected system's snapshot.
select set_config('request.jwt.claim.sub', '', false);
select set_config('tebos.actor_type', 'agent', false), set_config('tebos.actor_id', 'monitoring-worker:sql', false);
insert into public.sources (org_id, business_id, source_type, uri, label) values (:'org', :'biz', 'connected_system', 'accounting:1', 'Accounting')
  returning id as sys \gset
insert into public.evidence (org_id, business_id, source_id, state, fact, structured_value, retrieved_at)
  values (:'org', :'biz', :'sys', 'acquired', 'Revenue, last 12 months: R1,250,000',
          '{"metric": "revenue_12m", "value": 1250000, "label": "twelve"}', now() - interval '1 day') returning id as snap1 \gset
select t7.ok((select created_by_actor = 'agent' from public.evidence where id = :'snap1'), 'server evidence keeps its actor');

-- ===========================================================================
-- Objectives
-- ===========================================================================
set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
select t7.expect_error(format('insert into public.objectives (org_id, business_id, title, metric, unit, direction, target_value, period, due_on, owner_id, status)
  values (%L, %L, %L, %L, %L, %L, 2000000, %L, current_date + 365, %L, %L)', :'org', :'biz', 'R2m revenue', 'revenue', 'ZAR', 'at_least', 'year', :'outsider', 'active'),
  'TEBOS_VALIDATION');
select t7.expect_error(format('insert into public.objectives (org_id, business_id, title, metric, unit, direction, target_value, period, due_on, owner_id, status)
  values (%L, %L, %L, %L, %L, %L, 2000000, %L, current_date - 1, %L, %L)', :'org', :'biz', 'R2m revenue', 'revenue', 'ZAR', 'at_least', 'year', :'admin', 'active'),
  'TEBOS_VALIDATION');
select t7.expect_error(format('insert into public.objectives (org_id, business_id, title, metric, unit, direction, target_value, period, due_on, owner_id)
  values (%L, %L, %L, %L, %L, %L, 120, %L, current_date + 30, %L)', :'org', :'biz', 'Margin', 'gross_margin', 'percent', 'at_least', 'year', :'admin'),
  '23514');
insert into public.objectives (org_id, business_id, title, metric, unit, direction, target_value, period, due_on, owner_id, status, created_by)
  values (:'org', :'biz', 'R2m revenue', 'revenue', 'ZAR', 'at_least', 2000000, 'year', current_date + 365, :'admin', 'active', :'viewer')
  returning id as obj \gset
select t7.ok((select created_by = :'admin'::uuid from public.objectives where id = :'obj'), 'created_by is the signed-in user');

-- goalposts don't move
select t7.expect_error(format('update public.objectives set target_value = 1000000 where id = %L', :'obj'), 'TEBOS_INPUT_FROZEN');
select t7.expect_error(format('update public.objectives set due_on = due_on + 365 where id = %L', :'obj'), 'TEBOS_INPUT_FROZEN');
update public.objectives set owner_id = :'viewer' where id = :'obj';

-- stated values cite the owner's words; measured values come from a connected system
insert into public.objective_measurements (org_id, business_id, objective_id, basis, value, evidence_id)
  values (:'org', :'biz', :'obj', 'stated', 1800000, :'stated_ev') returning id as m_stated \gset
select t7.expect_error(format('insert into public.objective_measurements (org_id, business_id, objective_id, basis, value, evidence_id)
  values (%L, %L, %L, %L, 1, %L)', :'org', :'biz', :'obj', 'stated', :'snap1'), 'TEBOS_MEASUREMENT_UNSUPPORTED');
select t7.expect_error(format('insert into public.objective_measurements (org_id, business_id, objective_id, basis, value, evidence_id)
  values (%L, %L, %L, %L, 1, %L)', :'org', :'biz', :'obj', 'stated', :'missing_ev'), 'TEBOS_MEASUREMENT_UNSUPPORTED');
select t7.expect_error(format('insert into public.objective_measurements (org_id, business_id, objective_id, basis, value_path, evidence_id)
  values (%L, %L, %L, %L, %L, %L)', :'org', :'biz', :'obj', 'measured', '{value}', :'stated_ev'), 'TEBOS_MEASUREMENT_UNSUPPORTED');
select t7.expect_error(format('insert into public.objective_measurements (org_id, business_id, objective_id, basis, value, value_path, evidence_id)
  values (%L, %L, %L, %L, 2500000, %L, %L)', :'org', :'biz', :'obj', 'measured', '{value}', :'snap1'), 'TEBOS_MEASUREMENT_UNSUPPORTED');
select t7.expect_error(format('insert into public.objective_measurements (org_id, business_id, objective_id, basis, value_path, evidence_id)
  values (%L, %L, %L, %L, %L, %L)', :'org', :'biz', :'obj', 'measured', '{label}', :'snap1'), 'TEBOS_MEASUREMENT_UNSUPPORTED');
insert into public.objective_measurements (org_id, business_id, objective_id, basis, value_path, evidence_id, measured_at)
  values (:'org', :'biz', :'obj', 'measured', '{value}', :'snap1', now() + interval '1 year') returning id as m1 \gset
select t7.ok((select value = 1250000 and measured_at < now() and recorded_by = :'admin'::uuid
              from public.objective_measurements where id = :'m1'), 'the value and its time are read from the evidence');
select t7.expect_error(format('update public.objective_measurements set value = 2500000 where id = %L', :'m1'), '42501');

-- achieved only on a measured value that meets the target
select t7.expect_error(format('update public.objectives set status = %L, achieved_measurement_id = %L where id = %L', 'achieved', :'m_stated', :'obj'),
  'TEBOS_OBJECTIVE_UNMEASURED');
select t7.expect_error(format('update public.objectives set status = %L, achieved_measurement_id = %L where id = %L', 'achieved', :'m1', :'obj'),
  'TEBOS_OBJECTIVE_UNMEASURED');
select t7.expect_error(format('update public.objectives set status = %L where id = %L', 'achieved', :'obj'), 'TEBOS_OBJECTIVE_UNMEASURED');
select t7.expect_error(format('update public.objectives set status = %L where id = %L', 'missed', :'obj'), 'TEBOS_OBJECTIVE_NOT_DUE');
reset role;

-- nobody edits a measurement, not even the server
select t7.expect_error(format('update public.objective_measurements set value = 2500000 where id = %L', :'m1'), 'TEBOS_EVIDENCE_IMMUTABLE');

-- the next snapshot meets the target
insert into public.evidence (org_id, business_id, source_id, state, fact, structured_value, retrieved_at)
  values (:'org', :'biz', :'sys', 'acquired', 'Revenue, last 12 months: R2,050,000',
          '{"metric": "revenue_12m", "value": 2050000}', now()) returning id as snap2 \gset

set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
insert into public.objective_measurements (org_id, business_id, objective_id, basis, value_path, evidence_id)
  values (:'org', :'biz', :'obj', 'measured', '{value}', :'snap2') returning id as m2 \gset
update public.objectives set status = 'achieved', achieved_measurement_id = :'m2' where id = :'obj';
select t7.ok((select status = 'achieved' from public.objectives where id = :'obj'), 'achieved on a measured value');
select t7.expect_error(format('update public.objectives set status = %L where id = %L', 'active', :'obj'), 'TEBOS_ILLEGAL_TRANSITION');

-- an "at most" objective, retired with a reason
insert into public.objectives (org_id, business_id, title, metric, unit, direction, target_value, period, due_on, owner_id, status)
  values (:'org', :'biz', 'Founder at most 20h a week', 'founder_hours', 'hours_per_week', 'at_most', 20, 'week', current_date + 180, :'admin', 'active')
  returning id as hours \gset
select t7.expect_error(format('update public.objectives set status = %L where id = %L', 'retired', :'hours'), '23514');
update public.objectives set status = 'retired', status_reason = 'Replaced by a quarterly target' where id = :'hours';
select t7.expect_error(format('delete from public.objectives where id = %L', :'hours'), '42501');

-- a draft can still be edited, and a measurement from another objective can't achieve it
insert into public.objectives (org_id, business_id, title, metric, unit, direction, target_value, period, due_on, owner_id)
  values (:'org', :'biz', 'Draft margin', 'gross_margin', 'percent', 'at_least', 25, 'year', current_date + 365, :'admin') returning id as draft \gset
update public.objectives set target_value = 30, status = 'active' where id = :'draft';
select t7.expect_error(format('update public.objectives set status = %L, achieved_measurement_id = %L where id = %L', 'achieved', :'m2', :'draft'), 'TEBOS_OBJECTIVE_UNMEASURED');
reset role;

-- missed only after the due date (the date is moved directly to simulate time passing)
set session_replication_role = replica;
update public.objectives set due_on = current_date - 1 where id = :'draft';
set session_replication_role = origin;
set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
update public.objectives set status = 'missed' where id = :'draft';

-- ===========================================================================
-- The Board
-- ===========================================================================
select t7.expect_error(format('insert into public.board_components (org_id, business_id, name, kind, basis) values (%L, %L, %L, %L, %L)',
  :'org', :'biz', 'CRM', 'software', 'observed'), 'TEBOS_EVIDENCE_REQUIRED');
select t7.expect_error(format('insert into public.board_components (org_id, business_id, name, kind, basis, evidence_id) values (%L, %L, %L, %L, %L, %L)',
  :'org', :'biz', 'CRM', 'software', 'observed', :'missing_ev'), 'TEBOS_EVIDENCE_REQUIRED');
insert into public.board_components (org_id, business_id, name, kind, supplier, basis, evidence_id, created_by)
  values (:'org', :'biz', 'Website', 'provider', 'Studio North', 'observed', :'stated_ev', :'viewer') returning id as site \gset
select t7.ok((select created_by = :'admin'::uuid from public.board_components where id = :'site'), 'components record who added them');
select t7.expect_error(format('update public.board_components set created_by = %L where id = %L', :'viewer', :'site'), 'TEBOS_SERVER_ONLY');
insert into public.board_components (org_id, business_id, name, kind) values (:'org', :'biz', 'Inbox', 'channel') returning id as inbox \gset
select t7.expect_error(format('insert into public.board_components (org_id, business_id, name, kind) values (%L, %L, %L, %L)',
  :'org', :'biz', 'inbox', 'channel'), '23505');
insert into public.board_components (org_id, business_id, name, kind) values (:'org', :'biz2', 'Other tool', 'software') returning id as other_tool \gset

insert into public.board_flows (org_id, business_id, name, starts_when, done_when, objective_id)
  values (:'org', :'biz', 'Lead to onboarding', 'An enquiry arrives', 'The client is onboarded and invoiced', :'obj') returning id as flow \gset
insert into public.board_flows (org_id, business_id, name, starts_when, done_when)
  values (:'org', :'biz2', 'Other flow', 'x', 'y') returning id as other_flow \gset
insert into public.board_steps (org_id, business_id, flow_id, position, name, performer, component_id)
  values (:'org', :'biz', :'flow', 1, 'Enquiry lands in the inbox', 'client', :'site');
insert into public.board_steps (org_id, business_id, flow_id, position, name, performer, decision_rule)
  values (:'org', :'biz', :'flow', 2, 'Qualify and price', 'founder', 'Founder decides from experience');
select t7.expect_error(format('insert into public.board_steps (org_id, business_id, flow_id, position, name, performer)
  values (%L, %L, %L, 3, %L, %L)', :'org', :'biz', :'flow', 'Send proposal', 'automation'), '23514');
select t7.expect_error(format('insert into public.board_steps (org_id, business_id, flow_id, position, name, performer)
  values (%L, %L, %L, 2, %L, %L)', :'org', :'biz', :'flow', 'Duplicate', 'staff'), '23505');
select t7.expect_error(format('insert into public.board_steps (org_id, business_id, flow_id, position, name, performer, component_id)
  values (%L, %L, %L, 3, %L, %L, %L)', :'org', :'biz', :'flow', 'Cross-business tool', 'automation', :'other_tool'), '23503');
insert into public.board_steps (org_id, business_id, flow_id, position, name, performer, component_id, documented)
  values (:'org', :'biz', :'flow', 3, 'Send proposal', 'automation', :'inbox', true);
-- a retired step frees its position
update public.board_steps set retired_at = now() where flow_id = :'flow' and position = 3;
insert into public.board_steps (org_id, business_id, flow_id, position, name, performer)
  values (:'org', :'biz', :'flow', 3, 'Send proposal by hand', 'founder');

-- findings attach to a flow and objective of the same business only
insert into public.findings (org_id, business_id, title, statement, category, confidence, flow_id, objective_id)
  values (:'org', :'biz', 'Pricing depends on the founder', 'Only the founder can price work', 'dependency', 0.6, :'flow', :'obj');
select t7.expect_error(format('insert into public.findings (org_id, business_id, title, statement, category, confidence, flow_id)
  values (%L, %L, %L, %L, %L, 0.5, %L)', :'org', :'biz', 'Cross', 'Cross', 'gap', :'other_flow'), '23503');

-- viewers read the board but can't change it
select set_config('request.jwt.claim.sub', :'viewer', false);
select t7.ok((select count(*) = 3 from public.board_steps where flow_id = :'flow' and retired_at is null), 'viewer reads the board');
select t7.expect_error(format('insert into public.board_components (org_id, business_id, name, kind) values (%L, %L, %L, %L)',
  :'org', :'biz', 'Sneaky', 'software'), '42501');
update public.objectives set owner_id = :'viewer' where id = :'hours';
select t7.ok((select owner_id = :'admin'::uuid from public.objectives where id = :'hours'), 'viewer can''t change an objective');

-- outsiders see nothing
select set_config('request.jwt.claim.sub', :'outsider', false);
select t7.ok((select count(*) = 0 from public.objectives) and (select count(*) = 0 from public.board_flows), 'outsiders see nothing');
reset role;

select t7.ok((select count(*) >= 3 from public.audit_events where entity_type = 'objectives' and action = 'objectives.transition'),
  'objective transitions are audited');
select t7.ok((select count(*) >= 1 from public.audit_events where entity_type = 'board_steps'), 'board changes are audited');

-- the public API sees none of it
set role anon;
select t7.expect_error('select * from public.objectives', '42501');
select t7.expect_error('select * from public.board_flows', '42501');
reset role;
