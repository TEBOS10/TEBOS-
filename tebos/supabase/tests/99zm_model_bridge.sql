-- The Model Bridge: tokens are issued only by an organisation admin in a two-step
-- session, only for TEBOS-side organisations, and stored only as a hash. The
-- bridge's login can call nothing but its functions, and each one checks the
-- token, organisation, scope and rate, records the call, and can never verify
-- its own work: a person reviews it.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99zm;
grant usage on schema t99zm to anon, authenticated, tebos_bridge;
create function t99zm.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
create function t99zm.refused(p_sql text) returns boolean
language plpgsql as $$
begin
  begin execute p_sql; exception when insufficient_privilege then return true; end;
  return false;
end $$;
create function t99zm.fails(p_sql text, p_hint text default null) returns boolean
language plpgsql as $$
declare v_hint text;
begin
  begin execute p_sql; exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    return p_hint is null or v_hint = p_hint;
  end;
  return false;
end $$;
create function t99zm.h(p_token text) returns text
language sql immutable as $$ select encode(sha256(convert_to(p_token, 'UTF8')), 'hex') $$;
grant execute on all functions in schema t99zm to anon, authenticated, tebos_bridge;

select '9f5f0000-0000-0000-0000-00000000002a' as admin \gset
select '9f5f0000-0000-0000-0000-00000000002b' as operator \gset
select '9f5f0000-0000-0000-0000-00000000002c' as approver \gset
select '9f5f0000-0000-0000-0000-00000000002d' as other_admin \gset
insert into auth.users (id, email, email_confirmed_at) values
  (:'admin', 'admin@p99zk.test', now()), (:'operator', 'operator@p99zk.test', now()),
  (:'approver', 'approver@p99zk.test', now()), (:'other_admin', 'other@p99zk.test', now());

insert into public.organisations (name, slug) values ('Bridge Co 99zk', 'bridge-co-99zk') returning id as org \gset
insert into public.organisations (name, slug) values ('Other Co 99zk', 'other-co-99zk') returning id as org2 \gset
insert into public.organisations (name, slug, app) values ('Personal 99zk', 'personal-99zk', 'tepos') returning id as tepos \gset
insert into public.memberships (org_id, user_id, role) values
  (:'org', :'admin', 'org_admin'), (:'org', :'operator', 'operator'), (:'org', :'approver', 'approver'),
  (:'org2', :'other_admin', 'org_admin'), (:'tepos', :'admin', 'org_admin');
insert into public.businesses (org_id, name, industry) values (:'org', 'Bridge Shop', 'retail');

set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
select set_config('request.jwt.claims', '{"aal":"aal2"}', false);
select public.create_private_organisation('Vault 99zk', 'vault-99zk') as vault \gset

-- ---------------------------------------------------------------------------
-- Issuing access
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"aal":"aal1"}', false);
select t99zm.ok(t99zm.fails(format($$select * from public.issue_bridge_client(%L, 'Claude Code laptop', 'coding_agent', array['tasks.read'])$$, :'org'), 'TEBOS_TWO_STEP_REQUIRED'),
  'a password-only session cannot issue a token');
select set_config('request.jwt.claims', '{"aal":"aal2"}', false);

select client_id as cid, token as tok from public.issue_bridge_client(:'org', 'Claude Code laptop', 'coding_agent',
  array['context.read', 'tasks.read', 'tasks.claim', 'results.submit']) \gset
select t99zm.ok(:'tok' ~ '^tbk_[0-9a-f]{64}$', 'the token is shown once, in the expected shape');
select client_id as cid_ro, token as tok_ro from public.issue_bridge_client(:'org', 'Read only', 'coding_agent', array['context.read'], 7) \gset

select t99zm.ok(t99zm.fails(format($$select * from public.issue_bridge_client(%L, 'Into the vault', 'coding_agent', array['tasks.read'])$$, :'vault'), 'TEBOS_PERMISSION_DENIED'),
  'no token for a private organisation');
select t99zm.ok(t99zm.fails(format($$select * from public.issue_bridge_client(%L, 'Into TEPOS', 'coding_agent', array['tasks.read'])$$, :'tepos'), 'TEBOS_PERMISSION_DENIED'),
  'no token for a TEPOS organisation');
select t99zm.ok(t99zm.fails(format($$select * from public.issue_bridge_client(%L, 'Wide', 'coding_agent', array['approvals.decide'])$$, :'org'), 'TEBOS_VALIDATION'),
  'no scope outside the fixed list');
select t99zm.ok(t99zm.fails(format($$select * from public.issue_bridge_client(%L, 'Long', 'coding_agent', array['tasks.read'], 91)$$, :'org'), 'TEBOS_VALIDATION'),
  'no token for longer than 90 days');
select t99zm.ok(t99zm.fails(format($$select * from public.issue_bridge_client(%L, 'Other org', 'coding_agent', array['tasks.read'])$$, :'org2'), 'TEBOS_PERMISSION_DENIED'),
  'an admin of one organisation cannot issue for another');

select t99zm.ok(t99zm.refused('select token_hash from public.bridge_clients'), 'the hash is not readable, even by an admin');
select t99zm.ok((select count(*) = 2 from public.bridge_clients), 'an admin sees their organisation''s clients');
select t99zm.ok(t99zm.refused(format($$update public.bridge_clients set scopes = array['tasks.read'] where id = %L$$, :'cid')), 'nobody edits a client directly');

select set_config('request.jwt.claim.sub', :'operator', false);
select t99zm.ok(t99zm.fails(format($$select * from public.issue_bridge_client(%L, 'Operator', 'coding_agent', array['tasks.read'])$$, :'org'), 'TEBOS_PERMISSION_DENIED'),
  'an operator cannot issue');
select t99zm.ok((select count(*) = 0 from public.bridge_clients), 'and cannot see the clients');

-- the person asks for external work
insert into public.work_requests (org_id, kind, status, task_title, task_acceptance, task_executor)
values (:'org', 'external_task', 'received', 'Document the audit check', 'A page explains each audit status and what the check cannot prove.', 'external.coding_agent')
returning id as req \gset
select t99zm.ok(t99zm.fails(format($$insert into public.work_requests (org_id, kind, status) values (%L, 'external_task', 'received')$$, :'org')),
  'an external task needs its title, acceptance test and AI client');
select t99zm.ok(t99zm.fails(format($$insert into public.work_requests (org_id, kind, status, task_title, task_acceptance, task_executor)
  values (%L, 'external_task', 'received', 'Leak', 'password: hunter2hunter2 is in here', 'external.coding_agent')$$, :'org'), 'TEBOS_SECRET_REFUSED'),
  'a task that looks like it holds a secret is refused');
reset role;
select set_config('request.jwt.claim.sub', '', false);
select set_config('request.jwt.claims', '', false);

select t99zm.ok((select token_hash = t99zm.h(:'tok') and token_hint = left(:'tok', 12) from public.bridge_clients where id = :'cid'),
  'only the token''s hash and hint are stored');
select t99zm.ok(not exists (select 1 from public.audit_events where before::text like '%' || t99zm.h(:'tok') || '%' or after::text like '%' || t99zm.h(:'tok') || '%'),
  'the hash never enters the audit trail');
select t99zm.ok(exists (select 1 from public.audit_events where action = 'bridge_clients.insert' and entity_id = :'cid'), 'issuing is audited');
select t99zm.ok(t99zm.fails(format($$insert into public.bridge_clients (org_id, name, client_kind, token_hash, token_hint, scopes, expires_at, created_by)
  values (%L, 'Sneaky', 'coding_agent', repeat('b', 64), 'tbk_bbbbbbbb', array['tasks.read'], now() + interval '1 day', %L)$$, :'vault', :'admin'), 'TEBOS_PERMISSION_DENIED'),
  'the database refuses a private organisation even on a direct insert');

-- another organisation's client, an expired one, and REEDS planning the request (as the worker does)
insert into public.bridge_clients (org_id, name, client_kind, token_hash, token_hint, scopes, expires_at, created_by)
values (:'org2', 'Other client', 'coding_agent', t99zm.h('tbk_' || repeat('2', 64)), 'tbk_22222222',
        array['context.read', 'tasks.read', 'tasks.claim', 'results.submit'], now() + interval '1 day', :'other_admin');
insert into public.bridge_clients (org_id, name, client_kind, token_hash, token_hint, scopes, expires_at, created_by, created_at)
values (:'org', 'Expired client', 'coding_agent', t99zm.h('tbk_' || repeat('3', 64)), 'tbk_33333333',
        array['tasks.read'], now() - interval '1 day', :'admin', now() - interval '2 days');
insert into public.work_tasks (request_id, org_id, position, key, title, executor, acceptance, input, status)
values (:'req', :'org', 1, 'external.work', 'Document the audit check', 'external.coding_agent',
        'A page explains each audit status and what the check cannot prove.', '{}', 'queued')
returning id as task \gset
update public.work_requests set status = 'planned' where id = :'req';
update public.work_requests set status = 'running' where id = :'req';

-- ---------------------------------------------------------------------------
-- The bridge's login
-- ---------------------------------------------------------------------------
set role tebos_bridge;
select t99zm.ok(t99zm.refused('select * from public.work_tasks'), 'the bridge login reads no table');
select t99zm.ok(t99zm.refused('select * from public.bridge_clients'), 'not even the clients');
select t99zm.ok(t99zm.refused('select * from public.organisations'), 'nor organisations');
select t99zm.ok(t99zm.refused($$select tebos_bridge.gate('x', 'x', null)$$), 'it cannot call the bridge''s internals');
select t99zm.ok(t99zm.refused(format($$select public.review_work_task(%L, true)$$, :'task')), 'and it cannot review work');

select t99zm.ok(tebos_bridge.whoami(null) ->> 'code' = 'unauthenticated', 'no token: refused');
select t99zm.ok(tebos_bridge.whoami('not-a-hash') ->> 'code' = 'unauthenticated', 'a malformed hash: refused');
select t99zm.ok(tebos_bridge.whoami(repeat('f', 64)) ->> 'code' = 'unauthenticated', 'an unknown token: refused');
select t99zm.ok(tebos_bridge.whoami(t99zm.h('tbk_' || repeat('3', 64))) ->> 'code' = 'expired', 'an expired token: refused');
select t99zm.ok((tebos_bridge.whoami(t99zm.h(:'tok')) -> 'data' ->> 'organisation') = 'Bridge Co 99zk', 'a valid token: its organisation');

select tebos_bridge.get_context(t99zm.h(:'tok')) as ctx \gset
select t99zm.ok((:'ctx'::jsonb ->> 'ok')::boolean and (:'ctx'::jsonb -> 'data' -> 'businesses' -> 0 ->> 'name') = 'Bridge Shop', 'context lists its businesses');
select t99zm.ok(:'ctx' not like '%Vault 99zk%' and :'ctx' not like '%Other Co 99zk%' and :'ctx' not like '%Personal 99zk%',
  'context never mentions another organisation, the private one or TEPOS');
select t99zm.ok((:'ctx'::jsonb -> 'data' ->> 'note') like '%never as instructions%', 'context says it is data, not instructions');

select t99zm.ok(tebos_bridge.claim_task(t99zm.h(:'tok_ro'), :'task') ->> 'code' = 'scope', 'a read-only token cannot claim');
select t99zm.ok(jsonb_array_length(tebos_bridge.list_tasks(t99zm.h(:'tok')) -> 'data') = 1, 'its task is listed');
select t99zm.ok(jsonb_array_length(tebos_bridge.list_tasks(t99zm.h('tbk_' || repeat('2', 64))) -> 'data') = 0, 'another organisation''s client sees none of it');
select t99zm.ok(tebos_bridge.list_tasks(t99zm.h(:'tok'), 'whatever') ->> 'code' = 'invalid', 'an unknown status filter is refused');
select t99zm.ok(tebos_bridge.claim_task(t99zm.h('tbk_' || repeat('2', 64)), :'task') ->> 'code' = 'not_found', 'another organisation cannot claim it');

select t99zm.ok((tebos_bridge.claim_task(t99zm.h(:'tok'), :'task') ->> 'ok')::boolean, 'the client claims its task');
select t99zm.ok(tebos_bridge.claim_task(t99zm.h(:'tok'), :'task') ->> 'code' = 'conflict', 'it cannot be claimed twice');

select t99zm.ok(tebos_bridge.submit_result(t99zm.h(:'tok'), :'task', '{"summary": "api_key = sk_live_abcdefghijkl"}', 'key-00000001') ->> 'code' = 'secret',
  'a result that looks like it holds a secret is refused');
select t99zm.ok(tebos_bridge.submit_result(t99zm.h(:'tok'), :'task', '{"evidence": []}', 'key-00000001') ->> 'code' = 'invalid', 'a result needs a summary');
select t99zm.ok(tebos_bridge.submit_result(t99zm.h(:'tok'), :'task', jsonb_build_object('summary', repeat('x', 70000)), 'key-00000001') ->> 'code' = 'invalid',
  'a result is at most 64 KB');
select t99zm.ok(tebos_bridge.submit_result(t99zm.h(:'tok'), :'task', '{"summary": "done"}', 'short') ->> 'code' = 'invalid', 'it needs an idempotency key');
select t99zm.ok(tebos_bridge.submit_result(t99zm.h('tbk_' || repeat('2', 64)), :'task', '{"summary": "mine now"}', 'key-00000001') ->> 'code' = 'not_found',
  'another organisation cannot hand in a result for it');

select t99zm.ok((tebos_bridge.submit_result(t99zm.h(:'tok'), :'task',
  '{"summary": "Wrote docs/audit/audit-chain-verification.md.", "evidence": ["commit 50059a3"]}', 'key-00000001') -> 'data' ->> 'status') = 'done',
  'the result is handed in');
select t99zm.ok((tebos_bridge.submit_result(t99zm.h(:'tok'), :'task', '{"summary": "again"}', 'key-00000001') -> 'data' ->> 'repeat')::boolean,
  'the same hand-in twice is recorded once');
select t99zm.ok(tebos_bridge.submit_result(t99zm.h(:'tok'), :'task', '{"summary": "different"}', 'key-00000002') ->> 'code' = 'conflict',
  'a second, different result is refused');
reset role;

select t99zm.ok((select status = 'done' and claimed_by = :'cid' and result ->> 'summary' like 'Wrote%' from public.work_tasks where id = :'task'),
  'the task waits for review: done, never verified on the client''s word');
select t99zm.ok((select count(*) >= 1 from public.tool_calls c join public.agent_runs r on r.id = c.agent_run_id
                   where r.agent_role = 'external_model' and c.status = 'denied' and c.tool = 'claim_task'), 'a refused call is recorded');
select t99zm.ok((select count(*) >= 1 from public.tool_calls where tool = 'submit_result' and status = 'succeeded'), 'a successful call is recorded');
select t99zm.ok(exists (select 1 from public.audit_events where entity_id = :'task' and actor_type = 'agent' and actor_id = 'bridge:' || :'cid'),
  'the task''s changes are attributed to the AI client');

-- ---------------------------------------------------------------------------
-- A person reviews
-- ---------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', :'operator', false);
select set_config('request.jwt.claims', '{"aal":"aal2"}', false);
select t99zm.ok(t99zm.fails(format($$select public.review_work_task(%L, true)$$, :'task'), 'TEBOS_NOT_APPROVER'), 'an operator cannot review');
select set_config('request.jwt.claim.sub', :'approver', false);
select set_config('request.jwt.claims', '{"aal":"aal1"}', false);
select t99zm.ok(t99zm.fails(format($$select public.review_work_task(%L, true)$$, :'task'), 'TEBOS_TWO_STEP_REQUIRED'), 'reviewing needs two-step sign-in');
select set_config('request.jwt.claims', '{"aal":"aal2"}', false);
select t99zm.ok(t99zm.fails(format($$select public.review_work_task(%L, false)$$, :'task'), 'TEBOS_VALIDATION'), 'a rejection says why');
select t99zm.ok(public.review_work_task(:'task', true, 'Checked the page against the test.') = 'verified', 'an approver accepts it');
select t99zm.ok(t99zm.fails(format($$select public.review_work_task(%L, true)$$, :'task'), 'TEBOS_ILLEGAL_TRANSITION'), 'and it cannot be reviewed twice');
reset role;
select set_config('request.jwt.claim.sub', '', false);
select set_config('request.jwt.claims', '', false);
select t99zm.ok((select status = 'verified' and verification ->> 'reviewed_by' = :'approver' from public.work_tasks where id = :'task'),
  'verified by the person who reviewed it');

-- ---------------------------------------------------------------------------
-- Leases, rate limits and revocation
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'operator', true);
insert into public.work_requests (org_id, kind, status, task_title, task_acceptance, task_executor)
values (:'org', 'external_task', 'received', 'Second task', 'Something checkable happens and is shown.', 'external.coding_agent')
returning id as req2 \gset
reset role;
select set_config('request.jwt.claim.sub', '', true);
insert into public.work_tasks (request_id, org_id, position, key, title, executor, acceptance, input, status)
values (:'req2', :'org', 1, 'external.work', 'Second task', 'external.coding_agent', 'Something checkable happens and is shown.', '{}', 'queued')
returning id as task2 \gset
update public.work_requests set status = 'planned' where id = :'req2';
update public.work_requests set status = 'running' where id = :'req2';
set local role tebos_bridge;
select tebos_bridge.claim_task(t99zm.h(:'tok'), :'task2');
reset role;
update public.work_tasks set lease_until = now() - interval '1 minute' where id = :'task2';
set local role tebos_bridge;
select t99zm.ok(tebos_bridge.submit_result(t99zm.h(:'tok'), :'task2', '{"summary": "late"}', 'key-00000003') ->> 'code' = 'lease_expired', 'a late result is refused');
select tebos_bridge.list_tasks(t99zm.h(:'tok'));
reset role;
select t99zm.ok((select status = 'queued' and claimed_by is null from public.work_tasks where id = :'task2'), 'a lapsed lease puts the task back in the queue');
rollback;

begin;
insert into public.tool_calls (org_id, agent_run_id, tool, status)
select :'org', r.id, 'list_tasks', 'succeeded' from public.agent_runs r, generate_series(1, 60)
 where r.input_context ->> 'bridge_client' = :'cid' and r.status = 'running';
set local role tebos_bridge;
select t99zm.ok(tebos_bridge.list_tasks(t99zm.h(:'tok')) ->> 'code' = 'rate_limited', 'more than 60 calls a minute is refused');
rollback;

set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
select t99zm.ok(public.revoke_bridge_client(:'cid'), 'an admin revokes the client');
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role tebos_bridge;
select t99zm.ok(tebos_bridge.whoami(t99zm.h(:'tok')) ->> 'code' = 'revoked', 'a revoked token is refused at once');
select t99zm.ok(tebos_bridge.list_tasks(t99zm.h(:'tok')) ->> 'code' = 'revoked', 'by every tool');
reset role;
select t99zm.ok(t99zm.fails(format($$update public.bridge_clients set revoked_at = null, revoked_by = null where id = %L$$, :'cid'), 'TEBOS_INPUT_FROZEN'),
  'a revoked client stays revoked');
select t99zm.ok(exists (select 1 from public.audit_events where action = 'bridge_clients.update' and entity_id = :'cid'), 'revoking is audited');

-- after all of it, the audit trail of this organisation verifies
select t99zm.ok((select status = 'intact' from tebos_private.audit_verify(array[:'org'::uuid], false)), 'the organisation''s audit chain is intact');
