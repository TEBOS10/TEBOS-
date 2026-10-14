-- REEDS request ledger: only a person asks; only the server plans, runs and
-- reports; nothing is complete until every task is verified; each
-- organisation sees only its own work; delegation is bounded.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99zb;
grant usage on schema t99zb to anon, authenticated;
create function t99zb.expect_error(p_sql text, p_expect text) returns void
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
create function t99zb.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t99zb to anon, authenticated;

select '9b2b0000-0000-0000-0000-00000000000a' as admin, '9b2b0000-0000-0000-0000-00000000000b' as viewer,
       '9b2b0000-0000-0000-0000-00000000000c' as other, '9b2b0000-0000-0000-0000-0000000000c1' as org,
       '9b2b0000-0000-0000-0000-0000000000c2' as org2 \gset
insert into auth.users (id, email, email_confirmed_at) values
  (:'admin', 'admin@w99zb.test', now()), (:'viewer', 'viewer@w99zb.test', now()), (:'other', 'other@w99zb.test', now());
insert into public.organisations (id, name, slug) values (:'org', 'Org 99zb', 'org-99zb'), (:'org2', 'Other 99zb', 'other-99zb');
insert into public.memberships (org_id, user_id, role) values
  (:'org', :'admin', 'org_admin'), (:'org', :'viewer', 'viewer'), (:'org2', :'other', 'org_admin');

-- the server can't ask for work: no request without a person
select t99zb.expect_error(format($$insert into public.work_requests (org_id, kind, status, requested_by) values (%L, 'attention_today', 'received', %L)$$, :'org', :'admin'), 'TEBOS_PERMISSION_DENIED');

set role authenticated;
-- a viewer can't ask; an outsider can't ask for someone else's organisation
select set_config('request.jwt.claim.sub', :'viewer', false);
select t99zb.expect_error(format($$insert into public.work_requests (org_id, kind, status) values (%L, 'attention_today', 'received')$$, :'org'), '42501');
select set_config('request.jwt.claim.sub', :'other', false);
select t99zb.expect_error(format($$insert into public.work_requests (org_id, kind, status) values (%L, 'attention_today', 'received')$$, :'org'), '42501');
-- an unknown kind and a request that starts anywhere but "received" are refused
select set_config('request.jwt.claim.sub', :'admin', false);
select t99zb.expect_error(format($$insert into public.work_requests (org_id, kind, status) values (%L, 'transfer_money', 'received')$$, :'org'), '23514');
select t99zb.expect_error(format($$insert into public.work_requests (org_id, kind, status) values (%L, 'attention_today', 'completed')$$, :'org'), 'TEBOS_ILLEGAL_TRANSITION');
-- the admin asks: who asked is recorded as them
insert into public.work_requests (org_id, kind, note, status) values (:'org', 'attention_today', 'morning check', 'received');
reset role;
select id as req from public.work_requests where org_id = :'org' \gset
select t99zb.ok((select requested_by = :'admin' from public.work_requests where id = :'req'), 'the requester is the signed-in person');

set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
-- a person can't plan, run or report it, nor add tasks
select t99zb.expect_error(format($$update public.work_requests set status = 'planned' where id = %L$$, :'req'), '42501');
select t99zb.expect_error(format($$insert into public.work_tasks (request_id, org_id, position, key, title, executor, acceptance, status)
  values (%L, %L, 1, 'x.y', 'X', 'count.x', 'a test of at least ten characters', 'queued')$$, :'req', :'org'), '42501');
-- another organisation sees none of it
select set_config('request.jwt.claim.sub', :'other', false);
select t99zb.ok((select count(*) = 0 from public.work_requests), 'another organisation sees no requests');
reset role;

-- the server plans: tasks only while received, never beyond the limit
select set_config('tebos.actor_type', 'agent', false), set_config('tebos.actor_id', 'reeds-worker:test', false);
select t99zb.expect_error(format($$update public.work_requests set status = 'planned' where id = %L$$, :'req'), 'TEBOS_VALIDATION');
-- a task can't claim another organisation
select t99zb.expect_error(format($$insert into public.work_tasks (request_id, org_id, position, key, title, executor, acceptance, status)
  values (%L, %L, 13, 'task.x', 'Task x', 'count.x', 'Recount independently; must match.', 'queued')$$, :'req', :'org2'), '23503');
insert into public.work_tasks (request_id, org_id, position, key, title, executor, acceptance, input, status)
select :'req', :'org', g, 'task.' || g, 'Task ' || g, 'count.approvals_pending', 'Recount independently; must match.', '{"as_of": "2026-10-14T00:00:00Z"}', 'queued'
  from generate_series(1, 12) g;
select t99zb.expect_error(format($$insert into public.work_tasks (request_id, org_id, position, key, title, executor, acceptance, status)
  values (%L, %L, 13, 'task.13', 'Task 13', 'count.x', 'Recount independently; must match.', 'queued')$$, :'req', :'org'), 'TEBOS_VALIDATION');
update public.work_requests set status = 'planned' where id = :'req';
select t99zb.expect_error(format($$insert into public.work_tasks (request_id, org_id, position, key, title, executor, acceptance, status)
  values (%L, %L, 13, 'task.late', 'Late', 'count.x', 'Recount independently; must match.', 'queued')$$, :'req', :'org'), 'TEBOS_ILLEGAL_TRANSITION');
update public.work_requests set status = 'running' where id = :'req';

-- a task's definition is fixed; attempts are counted and bounded
select t99zb.expect_error(format($$update public.work_tasks set acceptance = 'trust me, it is fine' where request_id = %L and key = 'task.1'$$, :'req'), 'TEBOS_INPUT_FROZEN');
update public.work_tasks set status = 'running' where request_id = :'req' and key = 'task.1';
update public.work_tasks set status = 'queued', error = 'timeout' where request_id = :'req' and key = 'task.1';
update public.work_tasks set status = 'running' where request_id = :'req' and key = 'task.1';
update public.work_tasks set status = 'queued', error = 'timeout' where request_id = :'req' and key = 'task.1';
update public.work_tasks set status = 'running' where request_id = :'req' and key = 'task.1';
select t99zb.ok((select attempts = 3 from public.work_tasks where request_id = :'req' and key = 'task.1'), 'attempts are counted by the database');
update public.work_tasks set status = 'queued', error = 'timeout' where request_id = :'req' and key = 'task.1';
select t99zb.expect_error(format($$update public.work_tasks set status = 'running' where request_id = %L and key = 'task.1'$$, :'req'), 'TEBOS_VALIDATION');

-- done needs a result; verified needs a passing verification
update public.work_tasks set status = 'running' where request_id = :'req' and key = 'task.2';
select t99zb.expect_error(format($$update public.work_tasks set status = 'done' where request_id = %L and key = 'task.2'$$, :'req'), '23514');
update public.work_tasks set status = 'done', result = '{"available": true, "count": 0, "ids": []}' where request_id = :'req' and key = 'task.2';
select t99zb.expect_error(format($$update public.work_tasks set status = 'verified' where request_id = %L and key = 'task.2'$$, :'req'), '23514');
select t99zb.expect_error(format($$update public.work_tasks set status = 'verified', verification = '{"ok": false}' where request_id = %L and key = 'task.2'$$, :'req'), '23514');
update public.work_tasks set status = 'verified', verification = '{"ok": true, "detail": "recounted 0"}' where request_id = :'req' and key = 'task.2';

-- not complete while any task is unverified, and never without a report
update public.work_requests set status = 'verifying' where id = :'req';
select t99zb.expect_error(format($$update public.work_requests set status = 'completed', report = '{"summary": "all good"}' where id = %L$$, :'req'), 'TEBOS_WORK_UNVERIFIED');
update public.work_tasks set status = 'cancelled' where request_id = :'req' and status = 'queued';
select t99zb.expect_error(format($$update public.work_requests set status = 'completed', report = '{"summary": "all good"}' where id = %L$$, :'req'), 'TEBOS_WORK_UNVERIFIED');
update public.work_requests set status = 'failed', failure_detail = 'Task 1 failed: timeout' where id = :'req';
select t99zb.ok((select finished_at is not null from public.work_requests where id = :'req'), 'a failed request records when it ended');

-- a second request that passes every check completes, with its report
set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
insert into public.work_requests (org_id, kind, status) values (:'org', 'attention_today', 'received');
reset role;
select id as req2 from public.work_requests where org_id = :'org' and status = 'received' \gset
insert into public.work_tasks (request_id, org_id, position, key, title, executor, acceptance, status)
  values (:'req2', :'org', 1, 'approvals.pending', 'Approvals', 'count.approvals_pending', 'Recount independently; must match.', 'queued');
update public.work_requests set status = 'planned' where id = :'req2';
update public.work_requests set status = 'running' where id = :'req2';
update public.work_tasks set status = 'running' where request_id = :'req2';
update public.work_tasks set status = 'done', result = '{"available": true, "count": 0, "ids": []}' where request_id = :'req2';
update public.work_tasks set status = 'verified', verification = '{"ok": true}' where request_id = :'req2';
update public.work_requests set status = 'verifying' where id = :'req2';
select t99zb.expect_error(format($$update public.work_requests set status = 'completed' where id = %L$$, :'req2'), '23514');
update public.work_requests set status = 'completed', report = '{"summary": "Nothing needs your attention."}' where id = :'req2';

-- the requester can't change history: a finished request can't be cancelled or edited
set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
select t99zb.expect_error(format($$update public.work_requests set status = 'cancelled' where id = %L$$, :'req2'), 'TEBOS_ILLEGAL_TRANSITION');
select t99zb.expect_error(format($$update public.work_requests set note = 'edited' where id = %L$$, :'req2'), '42501');
-- but an open one can be cancelled by its organisation's admin
insert into public.work_requests (org_id, kind, status) values (:'org', 'attention_today', 'received');
update public.work_requests set status = 'cancelled' where org_id = :'org' and status = 'received';
select t99zb.ok((select count(*) = 1 from public.work_requests where org_id = :'org' and status = 'cancelled'), 'an admin can cancel an open request');
-- the viewer reads the organisation's work, read-only
select set_config('request.jwt.claim.sub', :'viewer', false);
select t99zb.ok((select count(*) = 3 from public.work_requests), 'members read their organisation''s requests');
update public.work_requests set status = 'cancelled' where id = :'req';
reset role;
select t99zb.ok((select status = 'failed' from public.work_requests where id = :'req'), 'a viewer changes nothing');

select t99zb.ok((select count(*) >= 1 from public.audit_events where entity_type = 'work_requests'), 'requests are audited');
select set_config('tebos.actor_type', '', false), set_config('tebos.actor_id', '', false);
