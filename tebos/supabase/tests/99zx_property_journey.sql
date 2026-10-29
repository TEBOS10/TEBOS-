-- The property journey (Release 1): a landlord records a problem, its evidence and an action; the action is done
-- only with received proof; the problem is resolved only with a done action and checked evidence; proof can't be
-- quietly withdrawn; no personal identifiers in a problem; other organisations see nothing; viewers only read.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99zx;
grant usage on schema t99zx to anon, authenticated;
create function t99zx.expect_error(p_sql text, p_expect text) returns void
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
create function t99zx.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t99zx to anon, authenticated;

select '9fa50000-0000-0000-0000-00000000000a' as owner, '9fa50000-0000-0000-0000-00000000000b' as viewer,
       '9fa50000-0000-0000-0000-00000000000c' as other, '9fa50000-0000-0000-0000-0000000000d1' as org,
       '9fa50000-0000-0000-0000-0000000000d2' as org2 \gset
insert into auth.users (id, email, email_confirmed_at) values
  (:'owner', 'owner@p99zx.test', now()), (:'viewer', 'viewer@p99zx.test', now()), (:'other', 'other@p99zx.test', now());
insert into public.organisations (id, name, slug) values (:'org', 'Landlord 99zx', 'landlord-99zx'), (:'org2', 'Other 99zx', 'other-99zx');
insert into public.memberships (org_id, user_id, role) values
  (:'org', :'owner', 'org_admin'), (:'org', :'viewer', 'viewer'), (:'org2', :'other', 'org_admin');

set role authenticated;
select set_config('request.jwt.claim.sub', :'owner', false);

-- a property: area and current use are optional, never assumed
insert into public.property_cases (org_id, label, property_type, problem, objective, disposition_reason, area, current_use)
  values (:'org', 'Duplex in Soshanguve', 'residential_multi', 'underperforming_income', 'improve_cash_flow',
          'The owner is tracking this property to improve it; no assessment has been made.', 'Soshanguve, Pretoria', 'Two rented units')
  returning id as prop \gset
select t99zx.expect_error(format($$update public.property_cases set area = 'X' where id = %L$$, :'prop'), '23514');

-- ===========================================================================
-- Problems
-- ===========================================================================
insert into public.property_problems (org_id, case_id, category, title, experienced, consequence, created_by)
  values (:'org', :'prop', 'arrears', 'Unit 2 rent paid late', 'Rent for unit 2 has arrived after the 7th in three of the last four months.',
          'Bond payment is made from savings when rent is late.', :'other')
  returning id as late, created_by as late_by \gset
select t99zx.ok(:'late_by' = :'owner', 'the creator is the signed-in person, whatever was sent');
-- what is happening must be said
select t99zx.expect_error(format($$insert into public.property_problems (org_id, case_id, category, title, experienced) values (%L, %L, 'other', 'Vague', 'short')$$, :'org', :'prop'), '23514');
-- no personal identifiers in a problem (tenant details wait for the POPIA review)
select t99zx.expect_error(format($$insert into public.property_problems (org_id, case_id, category, title, experienced) values (%L, %L, 'tenancy', 'Tenant contact', 'Tenant can be reached on 082 555 1234 about the leak.')$$, :'org', :'prop'), '23514');
select t99zx.expect_error(format($$insert into public.property_problems (org_id, case_id, category, title, experienced) values (%L, %L, 'tenancy', 'Tenant ID', 'Tenant ID number 8001015009087 on the lease.')$$, :'org', :'prop'), '23514');
-- a problem starts open
select t99zx.expect_error(format($$insert into public.property_problems (org_id, case_id, category, title, experienced, status, result_note, closed_on) values (%L, %L, 'other', 'Starts resolved', 'Something that happened at the property.', 'resolved', 'Claimed to be fixed already.', current_date)$$, :'org', :'prop'), 'TEBOS_ILLEGAL_TRANSITION');
-- an unknown category is refused
select t99zx.expect_error(format($$insert into public.property_problems (org_id, case_id, category, title, experienced) values (%L, %L, 'rezoning', 'Rezone', 'The owner wants to rezone the property.')$$, :'org', :'prop'), '23514');

-- planned needs a stated intervention
select t99zx.expect_error(format($$update public.property_problems set status = 'planned' where id = %L$$, :'late'), '23514');
update public.property_problems set status = 'investigating' where id = :'late';
update public.property_problems set status = 'planned', intervention = 'Move the debit order date to the 1st and agree it in writing with the tenant.',
  expected_result = 'Rent received by the 3rd', measure = 'Bank statement date of rent received, next three months' where id = :'late';

-- ===========================================================================
-- Evidence and actions
-- ===========================================================================
insert into public.property_evidence (org_id, case_id, problem_id, category, kind, title, source, status)
  values (:'org', :'prop', :'late', 'income', 'bank_statement', 'Bank statements Jul–Oct', 'Owner''s bank app', 'missing')
  returning id as stmt \gset

-- an action on a problem says why, and how we'll know it's done
select t99zx.expect_error(format($$insert into public.property_workstreams (org_id, case_id, problem_id, title, owner, due_on) values (%L, %L, %L, 'Change debit date', 'Owner', current_date + 7)$$, :'org', :'prop', :'late'), '23514');
insert into public.property_workstreams (org_id, case_id, problem_id, title, owner, due_on, reason, done_when)
  values (:'org', :'prop', :'late', 'Agree a new debit order date', 'Owner', current_date + 7,
          'Rent arrives after the bond is paid; an earlier date removes the gap.', 'Signed addendum on file')
  returning id as act \gset

-- done needs its proof, and the proof must have been received
select t99zx.expect_error(format($$update public.property_workstreams set status = 'done', completion_evidence = 'Addendum signed', completed_on = current_date where id = %L$$, :'act'), '23514');
select t99zx.expect_error(format($$update public.property_workstreams set status = 'done', completion_evidence = 'Addendum signed', completed_on = current_date, completion_evidence_id = %L where id = %L$$, :'stmt', :'act'), 'TEBOS_VALIDATION');
insert into public.property_evidence (org_id, case_id, problem_id, category, kind, title, source, status, received_on)
  values (:'org', :'prop', :'late', 'authority', 'lease_addendum', 'Lease addendum: debit date', 'Signed copy, owner''s files', 'received', current_date)
  returning id as addendum \gset
update public.property_workstreams set status = 'done', completion_evidence = 'Addendum signed by both parties',
  completed_on = current_date, completion_evidence_id = :'addendum' where id = :'act';

-- proof of finished work can't be downgraded or removed
select t99zx.expect_error(format($$update public.property_evidence set status = 'missing' where id = %L$$, :'addendum'), 'TEBOS_VALIDATION');
select t99zx.expect_error(format($$delete from public.property_evidence where id = %L$$, :'addendum'), 'TEBOS_VALIDATION');

-- proof from another property is refused
insert into public.property_cases (org_id, label, problem, objective, disposition_reason)
  values (:'org', 'Flat in Hatfield', 'underutilised', 'long_term_value', 'The owner is tracking this property to improve it.')
  returning id as prop2 \gset
select t99zx.expect_error(format($$insert into public.property_workstreams (org_id, case_id, title, owner, due_on, completion_evidence_id) values (%L, %L, 'Cross-property proof', 'Owner', current_date, %L)$$, :'org', :'prop2', :'addendum'), '23503');
-- and a problem from another property can't be linked
select t99zx.expect_error(format($$insert into public.property_evidence (org_id, case_id, problem_id, category, kind, title) values (%L, %L, %L, 'income', 'other', 'Wrong property')$$, :'org', :'prop2', :'late'), '23503');

-- ===========================================================================
-- Resolution rests on checked evidence that it worked
-- ===========================================================================
select t99zx.expect_error(format($$update public.property_problems set status = 'resolved', result_note = 'Rent now arrives on time.', closed_on = current_date where id = %L$$, :'late'), 'TEBOS_VALIDATION');
update public.property_evidence set status = 'checked', received_on = current_date, confidence = 'high',
  notes = 'November rent received on the 2nd' where id = :'stmt';
-- a result must be written
select t99zx.expect_error(format($$update public.property_problems set status = 'resolved', closed_on = current_date where id = %L$$, :'late'), '23514');
update public.property_problems set status = 'resolved', result_note = 'November rent received on the 2nd, before the bond debit.', closed_on = current_date where id = :'late';
-- the evidence it rests on can't quietly be unchecked, moved or removed
select t99zx.expect_error(format($$update public.property_evidence set status = 'received' where id = %L$$, :'stmt'), 'TEBOS_VALIDATION');
select t99zx.expect_error(format($$update public.property_evidence set problem_id = null where id = %L$$, :'stmt'), 'TEBOS_VALIDATION');
-- the journey continues: a resolved problem can reopen if it recurs
update public.property_problems set status = 'open' where id = :'late';
select t99zx.ok((select status = 'open' from public.property_problems where id = :'late'), 'a resolved problem can reopen');
-- parked says why
select t99zx.expect_error(format($$update public.property_problems set status = 'parked' where id = %L$$, :'late'), '23514');

-- every change is in the audit trail
select t99zx.ok((select count(*) >= 5 from public.audit_events where entity_id = :'late'::uuid), 'problem changes are audited');

-- ===========================================================================
-- Roles and isolation
-- ===========================================================================
select set_config('request.jwt.claim.sub', :'viewer', false);
select t99zx.ok((select count(*) = 1 from public.property_problems where case_id = :'prop'), 'a viewer reads the problems');
select t99zx.expect_error(format($$insert into public.property_problems (org_id, case_id, category, title, experienced) values (%L, %L, 'other', 'Viewer write', 'A viewer tries to record a problem.')$$, :'org', :'prop'), '42501');
update public.property_problems set title = 'Changed by a viewer' where id = :'late';
select t99zx.ok((select title = 'Unit 2 rent paid late' from public.property_problems where id = :'late'), 'a viewer can''t change a problem');

select set_config('request.jwt.claim.sub', :'other', false);
select t99zx.ok((select count(*) = 0 from public.property_problems where org_id = :'org'), 'another organisation sees no problems');
select t99zx.expect_error(format($$insert into public.property_problems (org_id, case_id, category, title, experienced) values (%L, %L, 'other', 'Intrusion', 'Another owner writes into this property.')$$, :'org', :'prop'), '42501');

-- no one deletes a problem
select set_config('request.jwt.claim.sub', :'owner', false);
select t99zx.expect_error(format($$delete from public.property_problems where id = %L$$, :'late'), '42501');
select t99zx.ok((select count(*) = 1 from public.property_problems where id = :'late'), 'a problem is never deleted');

reset role;
-- a property removed by the server (never by a member) cascades cleanly, proof and all
delete from public.property_cases where id = :'prop';
select t99zx.ok((select count(*) = 0 from public.property_problems where case_id = :'prop'), 'a removed property takes its problems with it');
drop schema t99zx cascade;
