\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99w;
grant usage on schema t99w to anon, authenticated;
create function t99w.expect_error(p_sql text, p_expect text) returns void
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
create function t99w.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t99w to anon, authenticated;

-- Architecture proposals: a rule and an owner for a founder-only step, proposed
-- by the team, decided by the owner (never their own), applied to the board by
-- retiring the founder step and adding the new one, never by editing it.
select '99900000-0000-0000-0000-00000000000a' as owner, '99900000-0000-0000-0000-00000000000b' as maint,
       '99900000-0000-0000-0000-00000000000c' as viewer, '99900000-0000-0000-0000-00000000000d' as outsider \gset
insert into auth.users (id, email, email_confirmed_at) values
  (:'owner', 'owner@proposals.test', now()), (:'maint', 'maint@proposals.test', now()),
  (:'viewer', 'viewer@proposals.test', now()), (:'outsider', 'outsider@proposals.test', now());
insert into public.platform_admins (user_id) values (:'owner');

set role authenticated;
select set_config('request.jwt.claim.sub', :'owner', false);
select public.create_organisation('Proposals test', 'proposals-test') as org \gset
insert into public.memberships (org_id, user_id, role) values (:'org', :'maint', 'operator'), (:'org', :'viewer', 'viewer');
insert into public.businesses (org_id, name) values (:'org', 'Sports Co') returning id as biz \gset
insert into public.board_components (org_id, business_id, name, kind) values (:'org', :'biz', 'Contract library', 'document') returning id as lib \gset
insert into public.board_flows (org_id, business_id, name, starts_when, done_when) values (:'org', :'biz', 'Deal', 'A deal is found', 'Signed') returning id as flow \gset
insert into public.board_steps (org_id, business_id, flow_id, position, name, performer, decision_rule)
  values (:'org', :'biz', :'flow', 1, 'Approve every contract', 'founder', null) returning id as step \gset
insert into public.board_steps (org_id, business_id, flow_id, position, name, performer)
  values (:'org', :'biz', :'flow', 2, 'Send it', 'staff') returning id as staff_step \gset
reset role;

-- Who may propose, and what
set role authenticated;
select set_config('request.jwt.claim.sub', :'viewer', false);
select t99w.expect_error(format('insert into public.step_proposals (org_id, business_id, step_id, performer, decision_rule, reason) values (%L,%L,%L,%L,%L,%L)',
  :'org', :'biz', :'step', 'staff', 'Contracts from the standard clauses need no approval', 'The CEO reads every contract'), '42501');
select set_config('request.jwt.claim.sub', :'maint', false);
select t99w.expect_error(format('insert into public.step_proposals (org_id, business_id, step_id, performer, decision_rule, reason) values (%L,%L,%L,%L,%L,%L)',
  :'org', :'biz', :'staff_step', 'staff', 'Contracts from the standard clauses need no approval', 'Someone else already does it'), 'TEBOS_VALIDATION');
select t99w.expect_error(format('insert into public.step_proposals (org_id, business_id, step_id, performer, decision_rule, reason) values (%L,%L,%L,%L,%L,%L)',
  :'org', :'biz', :'step', 'automation', 'Contracts from the standard clauses need no approval', 'The CEO reads every contract'), '23514');
select t99w.expect_error(format('insert into public.step_proposals (org_id, business_id, step_id, performer, decision_rule, reason) values (%L,%L,%L,%L,%L,%L)',
  :'org', :'biz', :'step', 'founder', 'Contracts from the standard clauses need no approval', 'The CEO reads every contract'), '23514');
insert into public.step_proposals (org_id, business_id, step_id, performer, performer_role, component_id, decision_rule, reason, proposed_by)
  values (:'org', :'biz', :'step', 'staff', 'Legal', :'lib', 'Contracts built only from the standard clauses go out without the CEO; anything else is flagged to the CEO.',
          'The CEO reads every contract, so deals wait for the CEO.', :'owner') returning id as prop \gset
select t99w.ok((select proposed_by = :'maint'::uuid from public.step_proposals where id = :'prop'), 'a proposal is recorded as whoever proposed it');
select t99w.expect_error(format('insert into public.step_proposals (org_id, business_id, step_id, performer, decision_rule, reason) values (%L,%L,%L,%L,%L,%L)',
  :'org', :'biz', :'step', 'provider', 'An outside lawyer approves every contract', 'The CEO reads every contract'), '23505');
select t99w.expect_error(format('update public.step_proposals set decision_rule = %L where id = %L', 'Changed after the fact', :'prop'), '42501');
-- the proposer can't decide it, and can't approve by changing the status
select t99w.expect_error(format('update public.step_proposals set status = %L where id = %L', 'approved', :'prop'), 'TEBOS_SERVER_ONLY');
select t99w.expect_error(format('select public.approve_step_proposal(%L)', :'prop'), 'TEBOS_NOT_APPROVER');
select set_config('request.jwt.claim.sub', :'outsider', false);
select t99w.ok((select count(*) = 0 from public.step_proposals), 'outsiders see no proposals');
select t99w.expect_error(format('select public.approve_step_proposal(%L)', :'prop'), 'TEBOS_PERMISSION_DENIED');

-- The owner approves: the founder step is retired, the new stated step takes its place
select set_config('request.jwt.claim.sub', :'owner', false);
select public.approve_step_proposal(:'prop', 'Yes: standard clauses are fine') as new_step \gset
reset role;
select t99w.ok((select retired_at is not null and performer = 'founder' from public.board_steps where id = :'step'), 'the founder step is retired, not edited');
select t99w.ok((select performer = 'staff' and performer_role = 'Legal' and component_id = :'lib' and basis = 'stated' and documented and position = 1
                  and decision_rule like 'Contracts built only from the standard clauses%' from public.board_steps where id = :'new_step'), 'the new step is stated, in the same place');
select t99w.ok((select status = 'approved' and decided_by = :'owner'::uuid and new_step_id = :'new_step' and decision_note = 'Yes: standard clauses are fine'
                from public.step_proposals where id = :'prop'), 'the decision is recorded');
select t99w.ok((select count(*) >= 2 from public.audit_events where entity_type = 'step_proposals'), 'proposals are audited');

set role authenticated;
select set_config('request.jwt.claim.sub', :'owner', false);
select t99w.expect_error(format('select public.approve_step_proposal(%L)', :'prop'), 'TEBOS_ILLEGAL_TRANSITION');
select t99w.expect_error(format('update public.step_proposals set decision_note = %L where id = %L', 'rewritten', :'prop'), 'TEBOS_INPUT_FROZEN');

-- A rejected proposal says why; a withdrawn one is its proposer's call; the step stays the founder's
insert into public.board_steps (org_id, business_id, flow_id, position, name, performer)
  values (:'org', :'biz', :'flow', 3, 'Set the fee', 'founder') returning id as fee_step \gset
select set_config('request.jwt.claim.sub', :'maint', false);
insert into public.step_proposals (org_id, business_id, step_id, performer, decision_rule, reason)
  values (:'org', :'biz', :'fee_step', 'staff', 'Fees follow the rate card; discounts over 10% go to the CEO.', 'The CEO prices every deal.') returning id as prop2 \gset
select set_config('request.jwt.claim.sub', :'owner', false);
select t99w.expect_error(format('update public.step_proposals set status = %L where id = %L', 'rejected', :'prop2'), '23514');
update public.step_proposals set status = 'rejected', decision_note = 'Fees stay with me for now' where id = :'prop2';
select t99w.ok((select status = 'rejected' and decided_by = :'owner'::uuid from public.step_proposals where id = :'prop2'), 'a rejection is recorded with its reason');
select t99w.ok((select performer = 'founder' and retired_at is null from public.board_steps where id = :'fee_step'), 'a rejected proposal changes nothing');
select set_config('request.jwt.claim.sub', :'maint', false);
insert into public.step_proposals (org_id, business_id, step_id, performer, decision_rule, reason)
  values (:'org', :'biz', :'fee_step', 'staff', 'Fees follow the rate card with no discounts at all.', 'The CEO prices every deal.') returning id as prop3 \gset
select set_config('request.jwt.claim.sub', :'owner', false);
select t99w.expect_error(format('update public.step_proposals set status = %L where id = %L', 'withdrawn', :'prop3'), 'TEBOS_PERMISSION_DENIED');
select set_config('request.jwt.claim.sub', :'maint', false);
update public.step_proposals set status = 'withdrawn' where id = :'prop3';
select t99w.expect_error(format('delete from public.step_proposals where id = %L', :'prop3'), '42501');
reset role;
select t99w.expect_error(format('delete from public.step_proposals where id = %L', :'prop3'), 'TEBOS_EVIDENCE_IMMUTABLE');
