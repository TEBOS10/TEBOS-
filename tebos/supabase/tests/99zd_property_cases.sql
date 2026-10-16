-- Property Revenue Architecture: cases keep their integrity. Unknown is not
-- zero, a verified figure rests on checked evidence, forecasts are estimates,
-- a disposition carries its reason, one pathway at most is recommended and it
-- explains itself, gates pass in order, every change is audited, and each
-- organisation sees only its own cases.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99zd;
grant usage on schema t99zd to anon, authenticated;
create function t99zd.expect_error(p_sql text, p_expect text) returns void
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
create function t99zd.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t99zd to anon, authenticated;

select '9d4d0000-0000-0000-0000-00000000000a' as admin, '9d4d0000-0000-0000-0000-00000000000b' as viewer,
       '9d4d0000-0000-0000-0000-00000000000c' as other, '9d4d0000-0000-0000-0000-0000000000d1' as org,
       '9d4d0000-0000-0000-0000-0000000000d2' as org2 \gset
insert into auth.users (id, email, email_confirmed_at) values
  (:'admin', 'admin@p99zd.test', now()), (:'viewer', 'viewer@p99zd.test', now()), (:'other', 'other@p99zd.test', now());
insert into public.organisations (id, name, slug) values (:'org', 'Org 99zd', 'org-99zd'), (:'org2', 'Other 99zd', 'other-99zd');
insert into public.memberships (org_id, user_id, role) values
  (:'org', :'admin', 'org_admin'), (:'org', :'viewer', 'viewer'), (:'org2', :'other', 'org_admin');

set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);

-- ===========================================================================
-- Intake: a case is numbered by the database; its creator is the signed-in person
-- ===========================================================================
insert into public.property_cases (org_id, label, problem, objective, disposition_reason, ref, created_by)
  values (:'org', 'Client A rental', 'underperforming_income', 'improve_cash_flow', 'Evidence incomplete; establish the baseline first.', 'PA-999', :'other')
  returning id as case_a, ref as ref_a, created_by as by_a \gset
insert into public.property_cases (org_id, label, problem, objective, disposition_reason)
  values (:'org', 'Client B', 'arrears_distress', 'resolve_arrears', 'Owner reports bond arrears; documents requested.')
  returning ref as ref_b \gset
select t99zd.ok(:'ref_a' = 'PA-001' and :'ref_b' = 'PA-002', 'cases are numbered PA-001, PA-002 by the database');
select t99zd.ok(:'by_a' = :'admin', 'the creator is the signed-in person, whatever was sent');
select t99zd.expect_error(format($$update public.property_cases set ref = 'PA-777' where id = %L$$, :'case_a'), 'TEBOS_INPUT_FROZEN');

-- a disposition carries its reason; changing it needs a new reason; PROCEED needs authority
select t99zd.expect_error(format($$insert into public.property_cases (org_id, label, problem, objective, disposition_reason) values (%L, 'X', 'underutilised', 'long_term_value', 'short')$$, :'org'), '23514');
select t99zd.expect_error(format($$update public.property_cases set disposition = 'nurture' where id = %L$$, :'case_a'), 'TEBOS_VALIDATION');
select t99zd.expect_error(format($$update public.property_cases set disposition = 'proceed', disposition_reason = 'Documents received and reconciled.' where id = %L$$, :'case_a'), '23514');
select disposition_at as first_at from public.property_cases where id = :'case_a' \gset
select pg_sleep(0.01);
update public.property_cases set disposition = 'nurture', disposition_reason = 'Owner travelling; documents expected next month.' where id = :'case_a';
select t99zd.ok((select disposition_at > :'first_at'::timestamptz from public.property_cases where id = :'case_a'), 'a new disposition is timestamped');

-- ===========================================================================
-- Evidence and figures
-- ===========================================================================
insert into public.property_evidence (org_id, case_id, category, kind, title, status)
  values (:'org', :'case_a', 'income', 'rent_roll', 'Current rent roll', 'requested') returning id as ev_roll \gset
-- a checked item needs its source, confidence and received date; a conflicting one says what conflicts
select t99zd.expect_error(format($$update public.property_evidence set status = 'checked', received_on = current_date where id = %L$$, :'ev_roll'), '23514');
select t99zd.expect_error(format($$update public.property_evidence set status = 'conflicting', received_on = current_date where id = %L$$, :'ev_roll'), '23514');

-- unknown is not zero: no row; negatives and fractional units are refused
select t99zd.ok((select count(*) = 0 from public.property_figures where case_id = :'case_a'), 'an unsupplied figure has no row');
select t99zd.expect_error(format($$insert into public.property_figures (org_id, case_id, key, value, basis, as_of) values (%L, %L, 'rent_due', -1, 'owner_reported', current_date)$$, :'org', :'case_a'), '23514');
select t99zd.expect_error(format($$insert into public.property_figures (org_id, case_id, key, value, basis, as_of) values (%L, %L, 'units', 2.5, 'owner_reported', current_date)$$, :'org', :'case_a'), '23514');
-- forecasts are estimates
select t99zd.expect_error(format($$insert into public.property_figures (org_id, case_id, key, value, basis, as_of) values (%L, %L, 'uplift', 3000, 'owner_reported', current_date)$$, :'org', :'case_a'), '23514');
-- verified needs evidence, and that evidence must be checked
select t99zd.expect_error(format($$insert into public.property_figures (org_id, case_id, key, value, basis, as_of) values (%L, %L, 'rent_due', 45000, 'verified', current_date)$$, :'org', :'case_a'), '23514');
select t99zd.expect_error(format($$insert into public.property_figures (org_id, case_id, key, value, basis, evidence_id, as_of) values (%L, %L, 'rent_due', 45000, 'verified', %L, current_date)$$, :'org', :'case_a', :'ev_roll'), 'TEBOS_VALIDATION');
update public.property_evidence set status = 'checked', received_on = current_date, source = 'Owner''s managing agent', confidence = 'high' where id = :'ev_roll';
insert into public.property_figures (org_id, case_id, key, value, basis, evidence_id, as_of) values (:'org', :'case_a', 'rent_due', 45000, 'verified', :'ev_roll', current_date);
insert into public.property_figures (org_id, case_id, key, value, basis, as_of) values (:'org', :'case_a', 'operating_expenses', 12000, 'owner_reported', current_date);
-- evidence that verifies a figure can't quietly stop being checked, or be removed
select t99zd.expect_error(format($$update public.property_evidence set status = 'received' where id = %L$$, :'ev_roll'), 'TEBOS_VALIDATION');
select t99zd.expect_error(format($$delete from public.property_evidence where id = %L$$, :'ev_roll'), '23503');
-- a figure's change is audited with what it was before
update public.property_figures set value = 47000 where case_id = :'case_a' and key = 'rent_due';
reset role;
select t99zd.ok((select count(*) = 1 from public.audit_events where entity_type = 'property_figures' and action = 'property_figures.update'
                   and (before ->> 'value')::numeric = 45000 and (after ->> 'value')::numeric = 47000), 'a changed figure keeps its history');
select t99zd.ok((select count(*) >= 1 from public.audit_events where entity_type = 'property_cases' and entity_id = :'case_a'::uuid
                   and before ->> 'disposition' = 'hold_optimise' and after ->> 'disposition' = 'nurture'), 'a changed disposition keeps its history');
set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
-- evidence from another case can't verify this one's figure (the guard refuses it before the foreign key would)
insert into public.property_cases (org_id, label, problem, objective, disposition_reason)
  values (:'org', 'Client C', 'underutilised', 'long_term_value', 'Early conversation; no documents yet.') returning id as case_c \gset
select t99zd.expect_error(format($$insert into public.property_figures (org_id, case_id, key, value, basis, evidence_id, as_of) values (%L, %L, 'rent_due', 1, 'verified', %L, current_date)$$, :'org', :'case_c', :'ev_roll'), 'TEBOS_VALIDATION');
-- and as a mere link, the foreign key keeps it to its own case
select t99zd.expect_error(format($$insert into public.property_figures (org_id, case_id, key, value, basis, evidence_id, as_of) values (%L, %L, 'rent_due', 1, 'owner_reported', %L, current_date)$$, :'org', :'case_c', :'ev_roll'), '23503');

-- ===========================================================================
-- Pathways: one recommendation at most, and it explains itself
-- ===========================================================================
insert into public.property_pathways (org_id, case_id, pathway) values (:'org', :'case_a', 'keep_optimise'), (:'org', :'case_a', 'sell_redeploy');
select t99zd.expect_error(format($$update public.property_pathways set status = 'recommended', rationale = 'Collections are the leak' where case_id = %L and pathway = 'keep_optimise'$$, :'case_a'), '23514');
select t99zd.expect_error(format($$update public.property_pathways set status = 'rejected' where case_id = %L and pathway = 'sell_redeploy'$$, :'case_a'), '23514');
update public.property_pathways set status = 'recommended', rationale = 'Collections are the leak', why_preferred = 'No capital event needed',
  evidence_summary = 'Rent roll vs receipts', decision_owner = 'Owner', would_change = 'Arrears above 3 months' where case_id = :'case_a' and pathway = 'keep_optimise';
update public.property_pathways set status = 'considered', rationale = 'Sale proceeds unclear' where case_id = :'case_a' and pathway = 'sell_redeploy';
select t99zd.expect_error(format($$update public.property_pathways set status = 'recommended', rationale = 'r', why_preferred = 'w', evidence_summary = 'e', decision_owner = 'o', would_change = 'c' where case_id = %L and pathway = 'sell_redeploy'$$, :'case_a'), '23505');
select t99zd.expect_error(format($$update public.property_pathways set specialists = array['astrologer'] where case_id = %L and pathway = 'keep_optimise'$$, :'case_a'), '23514');

-- ===========================================================================
-- Gates pass in order, with an owner and evidence
-- ===========================================================================
select t99zd.expect_error(format($$insert into public.property_gates (org_id, case_id, gate, status, owner, note) values (%L, %L, 'root_cause', 'passed', 'Tidy', 'n')$$, :'org', :'case_a'), 'TEBOS_VALIDATION');
-- the evidence gate needs authority confirmed, and no conflicting evidence
select t99zd.expect_error(format($$insert into public.property_gates (org_id, case_id, gate, status, owner, note) values (%L, %L, 'evidence', 'passed', 'Tidy', 'Statements reconciled')$$, :'org', :'case_a'), 'TEBOS_VALIDATION');
update public.property_cases set authority = 'confirmed' where id = :'case_a';
insert into public.property_evidence (org_id, case_id, category, kind, title, status, received_on, notes)
  values (:'org', :'case_a', 'expenses_debt', 'debt', 'Bond statement', 'conflicting', current_date, 'Instalment differs from bank debit') returning id as ev_debt \gset
select t99zd.expect_error(format($$insert into public.property_gates (org_id, case_id, gate, status, owner, note) values (%L, %L, 'evidence', 'passed', 'Tidy', 'Statements reconciled')$$, :'org', :'case_a'), 'TEBOS_VALIDATION');
update public.property_evidence set status = 'checked', source = 'Bank', confidence = 'medium', notes = 'Reconciled: a fee in the debit' where id = :'ev_debt';
-- a gate passes only with an owner and the evidence for passing it
select t99zd.expect_error(format($$insert into public.property_gates (org_id, case_id, gate, status) values (%L, %L, 'evidence', 'passed')$$, :'org', :'case_a'), '23514');
insert into public.property_gates (org_id, case_id, gate, status, owner, note) values (:'org', :'case_a', 'evidence', 'passed', 'Tidy', 'Statements reconciled');
insert into public.property_gates (org_id, case_id, gate, status, owner, note) values (:'org', :'case_a', 'root_cause', 'passed', 'Tidy', 'Collections leak confirmed');
select t99zd.expect_error(format($$update public.property_gates set status = 'in_progress' where case_id = %L and gate = 'evidence'$$, :'case_a'), 'TEBOS_VALIDATION');
select t99zd.expect_error(format($$insert into public.property_gates (org_id, case_id, gate, status) values (%L, %L, 'feasibility', 'blocked')$$, :'org', :'case_a'), '23514');
-- now PROCEED is allowed, with its reason
update public.property_cases set disposition = 'proceed', disposition_reason = 'Authority confirmed; statements reconciled.' where id = :'case_a';

-- ===========================================================================
-- Access
-- ===========================================================================
-- a viewer reads but changes nothing
select set_config('request.jwt.claim.sub', :'viewer', false);
select t99zd.ok((select count(*) = 3 from public.property_cases), 'a member reads the organisation''s cases');
update public.property_figures set value = 1 where case_id = :'case_a';
select t99zd.expect_error(format($$insert into public.property_evidence (org_id, case_id, category, kind, title) values (%L, %L, 'market', 'market', 'Comparables')$$, :'org', :'case_a'), '42501');
-- another organisation sees nothing and can't write into it
select set_config('request.jwt.claim.sub', :'other', false);
select t99zd.ok((select count(*) = 0 from public.property_cases) and (select count(*) = 0 from public.property_figures), 'another organisation sees none of it');
select t99zd.expect_error(format($$insert into public.property_evidence (org_id, case_id, category, kind, title) values (%L, %L, 'market', 'market', 'Comparables')$$, :'org', :'case_a'), '42501');
-- nobody deletes a case from the interface
select set_config('request.jwt.claim.sub', :'admin', false);
select t99zd.expect_error(format($$delete from public.property_cases where id = %L$$, :'case_a'), '42501');
reset role;
select t99zd.ok((select value = 47000 from public.property_figures where case_id = :'case_a' and key = 'rent_due'), 'the viewer''s update changed nothing');
select set_config('request.jwt.claim.sub', '', false);
