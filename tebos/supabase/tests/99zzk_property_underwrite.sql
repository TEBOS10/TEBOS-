-- Underwrite (ADR 0021): a problem is underwritten on checked evidence before any action is agreed; the latest
-- underwrite counts; a range of returns is an estimate with its basis; financing readiness is stated; an underwrite is
-- kept as written; the evidence it rests on stays checked; resolved needs new checked evidence that the fix worked.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99zzk;
grant usage on schema t99zzk to anon, authenticated;
create function t99zzk.expect_error(p_sql text, p_expect text) returns void
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
create function t99zzk.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t99zzk to anon, authenticated;

select '9fb10000-0000-0000-0000-00000000000a' as owner, '9fb10000-0000-0000-0000-00000000000b' as viewer,
       '9fb10000-0000-0000-0000-00000000000c' as other, '9fb10000-0000-0000-0000-0000000000d1' as org,
       '9fb10000-0000-0000-0000-0000000000d2' as org2 \gset
insert into auth.users (id, email, email_confirmed_at) values
  (:'owner', 'owner@u99zzk.test', now()), (:'viewer', 'viewer@u99zzk.test', now()), (:'other', 'other@u99zzk.test', now());
insert into public.organisations (id, name, slug) values (:'org', 'Landlord 99zzk', 'landlord-99zzk'), (:'org2', 'Other 99zzk', 'other-99zzk');
insert into public.memberships (org_id, user_id, role) values
  (:'org', :'owner', 'org_admin'), (:'org', :'viewer', 'viewer'), (:'org2', :'other', 'org_admin');

set role authenticated;
select set_config('request.jwt.claim.sub', :'owner', false);
insert into public.property_cases (org_id, label, property_type, problem, objective, disposition_reason)
  values (:'org', 'Block of six flats', 'residential_multi', 'underperforming_income', 'improve_cash_flow',
          'The owner is tracking this property to improve it; no assessment has been made.')
  returning id as prop \gset
insert into public.property_problems (org_id, case_id, category, title, experienced)
  values (:'org', :'prop', 'vacancy', 'Two flats empty since June', 'Flats 3 and 5 have had no tenant since June; viewings don''t convert.')
  returning id as vac \gset
insert into public.property_problems (org_id, case_id, category, title, experienced)
  values (:'org', :'prop', 'maintenance', 'Damp in the stairwell', 'The stairwell wall stays damp after rain and the paint peels.')
  returning id as damp \gset
insert into public.property_evidence (org_id, case_id, problem_id, category, kind, title, source, status, received_on)
  values (:'org', :'prop', :'vac', 'income', 'rent_roll', 'Rent roll, June to October', 'Owner''s spreadsheet', 'received', current_date)
  returning id as roll \gset
insert into public.property_evidence (org_id, case_id, problem_id, category, kind, title, source, status, received_on, confidence)
  values (:'org', :'prop', :'damp', 'asset_operations', 'photo', 'Stairwell photos after rain', 'Owner''s phone', 'checked', current_date, 'medium')
  returning id as photos \gset

-- ===========================================================================
-- Strategise waits for an underwrite that says proceed
-- ===========================================================================
select t99zzk.expect_error(format($$insert into public.property_workstreams (org_id, case_id, problem_id, title, owner, due_on, reason, done_when) values (%L, %L, %L, 'List both flats on two portals', 'Owner', current_date + 7, 'Viewings come from one portal only.', 'Both listings live')$$, :'org', :'prop', :'vac'), 'TEBOS_VALIDATION');
select t99zzk.expect_error(format($$update public.property_problems set status = 'planned', intervention = 'List the flats on a second portal and stage one of them.' where id = %L$$, :'vac'), 'TEBOS_VALIDATION');

-- an underwrite rests on checked evidence for its own problem
select format($$insert into public.property_underwrites (org_id, case_id, problem_id, verdict, viability, risks, financing, evidence_id) values (%L, %L, %L, 'proceed', 'Two flats at R6 500 a month are R13 000 lost each month.', 'Rents may be above the area''s level.', 'not_needed', %%L)$$, :'org', :'prop', :'vac') as uw \gset
select t99zzk.expect_error(format(:'uw', :'roll'), 'TEBOS_VALIDATION');
select t99zzk.expect_error(format(:'uw', :'photos'), 'TEBOS_VALIDATION');
update public.property_evidence set status = 'checked', confidence = 'high' where id = :'roll';

-- an estimated return is a range with its basis; financing that needs work says what
select t99zzk.expect_error(format($$insert into public.property_underwrites (org_id, case_id, problem_id, verdict, viability, risks, financing, evidence_id, effect_low_cents, effect_high_cents) values (%L, %L, %L, 'proceed', 'Two flats empty cost the owner every month.', 'Rents may be too high.', 'not_needed', %L, 900000, 1300000)$$, :'org', :'prop', :'vac', :'roll'), '23514');
select t99zzk.expect_error(format($$insert into public.property_underwrites (org_id, case_id, problem_id, verdict, viability, risks, financing, evidence_id, effect_low_cents, effect_high_cents, effect_basis) values (%L, %L, %L, 'proceed', 'Two flats empty cost the owner every month.', 'Rents may be too high.', 'not_needed', %L, 1300000, 900000, 'Rent roll less letting costs.')$$, :'org', :'prop', :'vac', :'roll'), '23514');
select t99zzk.expect_error(format($$insert into public.property_underwrites (org_id, case_id, problem_id, verdict, viability, risks, financing, evidence_id) values (%L, %L, %L, 'proceed', 'Two flats empty cost the owner every month.', 'Rents may be too high.', 'needs_work', %L)$$, :'org', :'prop', :'vac', :'roll'), '23514');
-- no personal identifiers
select t99zzk.expect_error(format($$insert into public.property_underwrites (org_id, case_id, problem_id, verdict, viability, risks, financing, evidence_id) values (%L, %L, %L, 'proceed', 'Call the agent on 082 555 1234 to relist.', 'Rents may be too high.', 'not_needed', %L)$$, :'org', :'prop', :'vac', :'roll'), '23514');

-- hold first: still no action
insert into public.property_underwrites (org_id, case_id, problem_id, verdict, viability, risks, financing, financing_note, evidence_id)
  values (:'org', :'prop', :'vac', 'hold_optimise', 'Viewings don''t convert; fix the presentation before spending on listings.',
          'Spending on listings before the flats show well may be wasted.', 'needs_work', 'Painting both flats needs about R8 000 the owner doesn''t have yet.', :'roll')
  returning created_by as uw_by \gset
select t99zzk.ok(:'uw_by' = :'owner', 'the underwriter is the signed-in person');
-- who underwrote it can't be sent at all
select t99zzk.expect_error(format($$insert into public.property_underwrites (org_id, case_id, problem_id, verdict, viability, risks, financing, evidence_id, created_by) values (%L, %L, %L, 'proceed', 'Two flats empty cost the owner every month.', 'Rents may be too high.', 'not_needed', %L, %L)$$, :'org', :'prop', :'vac', :'roll', :'other'), '42501');
select t99zzk.expect_error(format($$insert into public.property_workstreams (org_id, case_id, problem_id, title, owner, due_on, reason, done_when) values (%L, %L, %L, 'List both flats on two portals', 'Owner', current_date + 7, 'Viewings come from one portal only.', 'Both listings live')$$, :'org', :'prop', :'vac'), 'TEBOS_VALIDATION');

-- the latest underwrite counts: proceed, with an estimated range and its basis
insert into public.property_underwrites (org_id, case_id, problem_id, verdict, viability, risks, effect_low_cents, effect_high_cents, effect_basis, financing, evidence_id)
  values (:'org', :'prop', :'vac', 'proceed', 'Painting is now funded; both flats can be relet at the area''s rent.',
          'Letting may take two months; the area''s rent may fall.', 900000, 1300000,
          'Rent roll: R6 500 per flat; low assumes one flat let, high both, less letting costs.', 'ready', :'roll');
insert into public.property_workstreams (org_id, case_id, problem_id, title, owner, due_on, reason, done_when)
  values (:'org', :'prop', :'vac', 'List both flats on two portals', 'Owner', current_date + 7, 'Viewings come from one portal only.', 'Both listings live')
  returning id as listing \gset
update public.property_problems set status = 'planned', intervention = 'Paint both flats, then list them on a second portal.' where id = :'vac';

-- a changed view is a new underwrite, never an edit; the evidence it rests on stays checked
select t99zzk.expect_error(format($$update public.property_underwrites set verdict = 'not_viable' where problem_id = %L$$, :'vac'), '42501');
select t99zzk.expect_error(format($$delete from public.property_underwrites where problem_id = %L$$, :'vac'), '42501');
select t99zzk.expect_error(format($$update public.property_evidence set status = 'received' where id = %L$$, :'roll'), 'TEBOS_VALIDATION');
select t99zzk.expect_error(format($$delete from public.property_evidence where id = %L$$, :'roll'), 'TEBOS_VALIDATION');
reset role;
select t99zzk.expect_error(format($$update public.property_underwrites set verdict = 'not_viable' where problem_id = %L$$, :'vac'), 'TEBOS_INPUT_FROZEN');
set role authenticated;
select set_config('request.jwt.claim.sub', :'owner', false);

-- not viable after all: no new action, though work already agreed carries on
insert into public.property_underwrites (org_id, case_id, problem_id, verdict, viability, risks, financing, evidence_id)
  values (:'org', :'prop', :'vac', 'not_viable', 'A new development nearby undercuts the rent by a third.', 'Relisting at a lower rent may still not let.', 'not_needed', :'roll');
select t99zzk.expect_error(format($$insert into public.property_workstreams (org_id, case_id, problem_id, title, owner, due_on, reason, done_when) values (%L, %L, %L, 'Stage flat 3', 'Owner', current_date + 9, 'Photos show an empty room.', 'Staged photos taken')$$, :'org', :'prop', :'vac'), 'TEBOS_VALIDATION');
update public.property_workstreams set status = 'in_progress' where id = :'listing';
-- and an action without a problem (the case workspace) doesn't need one
insert into public.property_workstreams (org_id, case_id, title, owner, due_on) values (:'org', :'prop', 'Collect the municipal account', 'Owner', current_date + 3);

-- ===========================================================================
-- Resolved needs new checked evidence that the fix worked
-- ===========================================================================
insert into public.property_underwrites (org_id, case_id, problem_id, verdict, viability, risks, financing, evidence_id)
  values (:'org', :'prop', :'damp', 'proceed', 'A gutter repair is cheap next to repainting every winter.', 'The damp may come from the ground, not the gutter.', 'not_needed', :'photos');
update public.property_problems set status = 'planned', intervention = 'Replace the cracked gutter above the stairwell.' where id = :'damp';
insert into public.property_evidence (org_id, case_id, problem_id, category, kind, title, source, status, received_on)
  values (:'org', :'prop', :'damp', 'asset_operations', 'invoice', 'Gutter invoice', 'Contractor', 'received', current_date)
  returning id as inv \gset
insert into public.property_workstreams (org_id, case_id, problem_id, title, owner, due_on, reason, done_when, status, completion_evidence, completed_on, completion_evidence_id)
  values (:'org', :'prop', :'damp', 'Replace the gutter', 'Contractor', current_date, 'The crack drains onto the wall.', 'Invoice and photo', 'in_progress', null, null, null)
  returning id as gutter \gset
update public.property_workstreams set status = 'done', completion_evidence = 'Invoice from the contractor', completed_on = current_date, completion_evidence_id = :'inv' where id = :'gutter';
-- the photos it was underwritten on show the problem, not the result
select t99zzk.expect_error(format($$update public.property_problems set status = 'resolved', result_note = 'The wall stayed dry after the last rain.', closed_on = current_date where id = %L$$, :'damp'), 'TEBOS_VALIDATION');
insert into public.property_evidence (org_id, case_id, problem_id, category, kind, title, source, status, received_on, confidence)
  values (:'org', :'prop', :'damp', 'asset_operations', 'photo', 'Stairwell dry after rain', 'Owner''s phone', 'checked', current_date, 'medium');
update public.property_problems set status = 'resolved', result_note = 'The wall stayed dry after the last rain.', closed_on = current_date where id = :'damp';
-- a resolved problem isn't underwritten again until it reopens
select t99zzk.expect_error(format($$insert into public.property_underwrites (org_id, case_id, problem_id, verdict, viability, risks, financing, evidence_id) values (%L, %L, %L, 'proceed', 'Repaint now the wall is dry.', 'Paint may peel again.', 'not_needed', %L)$$, :'org', :'prop', :'damp', :'photos'), 'TEBOS_VALIDATION');

-- ===========================================================================
-- Roles, isolation, audit
-- ===========================================================================
select set_config('request.jwt.claim.sub', :'viewer', false);
select t99zzk.ok((select count(*) = 4 from public.property_underwrites where case_id = :'prop'), 'a viewer reads the underwrites');
select t99zzk.expect_error(format(:'uw', :'roll'), '42501');
select set_config('request.jwt.claim.sub', :'other', false);
select t99zzk.ok((select count(*) = 0 from public.property_underwrites where org_id = :'org'), 'another organisation sees no underwrites');
select t99zzk.expect_error(format(:'uw', :'roll'), '42501');
set role anon;
select t99zzk.expect_error($$select count(*) from public.property_underwrites$$, '42501');
reset role;
select t99zzk.ok((select count(*) = 4 from public.audit_events where entity_type = 'property_underwrites'
                  and entity_id in (select id from public.property_underwrites where case_id = :'prop')), 'every underwrite is audited');

drop schema t99zzk cascade;
