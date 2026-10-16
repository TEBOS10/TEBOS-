-- Property execution: workstreams keep their dependencies, budget approvals and
-- evidence of completion; the baseline is copied from the case's figures and
-- frozen; outcome reviews record real actuals, dated after the baseline; and
-- the outcome gate needs both.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99ze;
grant usage on schema t99ze to anon, authenticated;
create function t99ze.expect_error(p_sql text, p_expect text) returns void
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
create function t99ze.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t99ze to anon, authenticated;

select '9e5e0000-0000-0000-0000-00000000000a' as admin, '9e5e0000-0000-0000-0000-00000000000b' as viewer,
       '9e5e0000-0000-0000-0000-0000000000e1' as org \gset
insert into auth.users (id, email, email_confirmed_at) values (:'admin', 'admin@p99ze.test', now()), (:'viewer', 'viewer@p99ze.test', now());
insert into public.organisations (id, name, slug) values (:'org', 'Org 99ze', 'org-99ze');
insert into public.memberships (org_id, user_id, role) values (:'org', :'admin', 'org_admin'), (:'org', :'viewer', 'viewer');

set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
insert into public.property_cases (org_id, label, problem, objective, disposition_reason, authority)
  values (:'org', 'Execution case', 'underperforming_income', 'improve_cash_flow', 'Baseline established; acting on collections.', 'confirmed')
  returning id as c \gset

-- ===========================================================================
-- Workstreams
-- ===========================================================================
insert into public.property_workstreams (org_id, case_id, title, owner, due_on)
  values (:'org', :'c', 'Reconcile arrears ledger', 'Tidy', current_date + 7) returning id as ws1 \gset
insert into public.property_workstreams (org_id, case_id, title, owner, due_on, depends_on, budget, approval)
  values (:'org', :'c', 'Appoint collections agent', 'Owner', current_date + 21, :'ws1', 3500, 'pending') returning id as ws2 \gset
-- a budget needs an approval route; approval names who and when
select t99ze.expect_error(format($$insert into public.property_workstreams (org_id, case_id, title, owner, due_on, budget) values (%L, %L, 'x', 'y', current_date, 100)$$, :'org', :'c'), '23514');
select t99ze.expect_error(format($$update public.property_workstreams set approval = 'approved' where id = %L$$, :'ws2'), '23514');
-- it can't start before its dependency is done, nor before its budget is approved
select t99ze.expect_error(format($$update public.property_workstreams set status = 'in_progress', approval = 'approved', approved_by = 'Owner', approved_on = current_date where id = %L$$, :'ws2'), 'TEBOS_VALIDATION');
-- done needs evidence of completion and a date; blocked needs a reason
select t99ze.expect_error(format($$update public.property_workstreams set status = 'done' where id = %L$$, :'ws1'), '23514');
select t99ze.expect_error(format($$update public.property_workstreams set status = 'blocked' where id = %L$$, :'ws1'), '23514');
update public.property_workstreams set status = 'done', completion_evidence = 'Ledger reconciled to bank: 3 tenants in arrears', completed_on = current_date where id = :'ws1';
select t99ze.expect_error(format($$update public.property_workstreams set status = 'in_progress' where id = %L$$, :'ws2'), 'TEBOS_VALIDATION');
update public.property_workstreams set approval = 'approved', approved_by = 'Owner', approved_on = current_date, status = 'in_progress' where id = :'ws2';
-- no cycles
select t99ze.expect_error(format($$update public.property_workstreams set depends_on = %L where id = %L$$, :'ws2', :'ws1'), 'TEBOS_VALIDATION');
select t99ze.expect_error(format($$update public.property_workstreams set depends_on = id where id = %L$$, :'ws1'), 'TEBOS_VALIDATION');

-- ===========================================================================
-- Baseline: copied from the case's figures, then frozen
-- ===========================================================================
select t99ze.expect_error(format($$insert into public.property_baselines (org_id, case_id) values (%L, %L)$$, :'org', :'c'), 'TEBOS_VALIDATION');
insert into public.property_figures (org_id, case_id, key, value, basis, as_of) values
  (:'org', :'c', 'rent_due', 45000, 'owner_reported', current_date), (:'org', :'c', 'rent_collected', 40500, 'owner_reported', current_date),
  (:'org', :'c', 'arrears_balance', 18000, 'owner_reported', current_date), (:'org', :'c', 'uplift', 3000, 'estimated', current_date);
-- whatever is sent, the baseline is the stored figures (forecasts excluded), dated today
insert into public.property_baselines (org_id, case_id, figures, captured_on, target_cash_flow)
  values (:'org', :'c', '[{"key":"rent_due","value":99999}]', current_date - 30, 15000);
select t99ze.ok((select jsonb_array_length(figures) = 3 and captured_on = current_date and captured_by = :'admin'
                   and figures @> '[{"key":"rent_due","value":45000}]' and not figures @> '[{"key":"uplift"}]'
                 from public.property_baselines where case_id = :'c'), 'the baseline copies the stored figures, not what was sent');
select t99ze.expect_error(format($$update public.property_baselines set figures = '[]' where case_id = %L$$, :'c'), 'TEBOS_INPUT_FROZEN');
select t99ze.expect_error(format($$update public.property_baselines set captured_on = current_date - 1 where case_id = %L$$, :'c'), 'TEBOS_INPUT_FROZEN');
update public.property_baselines set target_cash_flow = 16000, target_note = 'After collections fix' where case_id = :'c';
select t99ze.expect_error(format($$insert into public.property_baselines (org_id, case_id) values (%L, %L)$$, :'org', :'c'), '23505');
-- later changes to the figures don't touch the baseline
update public.property_figures set value = 50000 where case_id = :'c' and key = 'rent_due';
select t99ze.ok((select figures @> '[{"key":"rent_due","value":45000}]' from public.property_baselines where case_id = :'c'), 'the baseline stays as captured');

-- ===========================================================================
-- Outcome reviews: real actuals, dated between the baseline and today
-- ===========================================================================
select t99ze.expect_error(format($$insert into public.property_outcome_reviews (org_id, case_id, review_on) values (%L, %L, current_date + 1)$$, :'org', :'c'), 'TEBOS_VALIDATION');
select t99ze.expect_error(format($$insert into public.property_outcome_reviews (org_id, case_id, review_on) values (%L, %L, current_date - 1)$$, :'org', :'c'), 'TEBOS_VALIDATION');
insert into public.property_outcome_reviews (org_id, case_id, review_on) values (:'org', :'c', current_date) returning id as rv \gset
-- actuals are never estimates; verified rests on checked evidence
select t99ze.expect_error(format($$insert into public.property_outcome_values (org_id, case_id, review_id, key, value, basis) values (%L, %L, %L, 'rent_collected', 43000, 'estimated')$$, :'org', :'c', :'rv'), '23514');
select t99ze.expect_error(format($$insert into public.property_outcome_values (org_id, case_id, review_id, key, value, basis) values (%L, %L, %L, 'rent_collected', 43000, 'verified')$$, :'org', :'c', :'rv'), '23514');
select t99ze.expect_error(format($$insert into public.property_outcome_values (org_id, case_id, review_id, key, value, basis) values (%L, %L, %L, 'uplift', 1, 'owner_reported')$$, :'org', :'c', :'rv'), '23514');

-- the outcome gate needs the earlier gates, a baseline and actuals
insert into public.property_gates (org_id, case_id, gate, status, owner, note) values
  (:'org', :'c', 'evidence', 'passed', 'Tidy', 'Reconciled'), (:'org', :'c', 'root_cause', 'passed', 'Tidy', 'Collections'),
  (:'org', :'c', 'feasibility', 'passed', 'Tidy', 'Net positive'), (:'org', :'c', 'authorisation', 'passed', 'Owner', 'Budget approved');
select t99ze.expect_error(format($$insert into public.property_gates (org_id, case_id, gate, status, owner, note) values (%L, %L, 'outcome', 'passed', 'Tidy', 'Measured')$$, :'org', :'c'), 'TEBOS_VALIDATION');
insert into public.property_outcome_values (org_id, case_id, review_id, key, value, basis) values (:'org', :'c', :'rv', 'rent_collected', 43000, 'owner_reported');
insert into public.property_gates (org_id, case_id, gate, status, owner, note) values (:'org', :'c', 'outcome', 'passed', 'Tidy', 'Collections up R2,500 a month');

-- a viewer reads it all and changes nothing
select set_config('request.jwt.claim.sub', :'viewer', false);
select t99ze.ok((select count(*) = 2 from public.property_workstreams) and (select count(*) = 1 from public.property_outcome_values), 'a member reads the execution records');
select t99ze.expect_error(format($$insert into public.property_workstreams (org_id, case_id, title, owner, due_on) values (%L, %L, 'x', 'y', current_date)$$, :'org', :'c'), '42501');
reset role;
select t99ze.ok((select count(*) >= 1 from public.audit_events where entity_type = 'property_workstreams' and action = 'property_workstreams.transition'), 'workstream changes are audited');
select set_config('request.jwt.claim.sub', '', false);
