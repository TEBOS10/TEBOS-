-- Stage 4 rules: provider connections, credentials, approved input and
-- provider-verified execution. Tries to fabricate each and asserts refusal.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t3;
grant usage on schema t3 to authenticated;
create function t3.expect_error(p_sql text, p_expect text) returns void
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
create function t3.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t3 to authenticated;

select '30000000-0000-0000-0000-00000000000a' as admin, '30000000-0000-0000-0000-00000000000b' as op,
       '30000000-0000-0000-0000-00000000000c' as appr, '30000000-0000-0000-0000-00000000000d' as outsider \gset
insert into auth.users (id, email, email_confirmed_at) values
  (:'admin', 'admin@exec.test', now()), (:'op', 'op@exec.test', now()), (:'appr', 'appr@exec.test', now()),
  (:'outsider', 'out@exec.test', now());

set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
select public.create_organisation('Execution test', 'exec-test') as org \gset
insert into public.memberships (org_id, user_id, role) values (:'org', :'op', 'operator'), (:'org', :'appr', 'approver');
insert into public.businesses (org_id, name) values (:'org', 'Clay studio') returning id as biz \gset
insert into public.sources (org_id, business_id, source_type, uri) values (:'org', :'biz', 'user_statement', null) returning id as src \gset
insert into public.evidence (org_id, business_id, source_id, state, fact) values (:'org', :'biz', :'src', 'user_supplied', 'Orders arrive by WhatsApp')
  returning id as ev \gset
reset role;
begin;
set role authenticated;
set constraints all deferred;
insert into public.findings (org_id, business_id, title, statement, category, confidence, status)
  values (:'org', :'biz', 'Orders are not confirmed', 'Customers get no confirmation', 'gap', 0.6, 'active') returning id as f \gset
insert into public.finding_evidence (org_id, business_id, finding_id, evidence_id) values (:'org', :'biz', :'f', :'ev');
commit;
set role authenticated;

-- ===========================================================================
-- Connections: only the server says a connection works
-- ===========================================================================
select t3.ok((select count(*) from public.connector_capabilities where connector_key = 'resend' and capability_key = 'email.send_transactional') = 1,
  'Resend provides transactional email');

select t3.expect_error(format('insert into public.connection_instances (org_id, connector_key, last_verified_at, granted_scopes) values (%L, %L, now(), %L)',
  :'org', 'resend', '{emails:send}'), 'TEBOS_SERVER_ONLY');
insert into public.connection_instances (org_id, connector_key, settings) values (:'org', 'resend', '{"from": "Clay <orders@clay.test>"}')
  returning id as conn \gset
select t3.ok((select created_by = :'admin' from public.connection_instances where id = :'conn'), 'creator recorded from the session');
-- without a credential it is refused before anything else is considered
select t3.expect_error(format('update public.connection_instances set last_verified_at = now(), status = %L where id = %L', 'connected', :'conn'),
  'TEBOS_CONNECTION_UNVERIFIED');
select t3.expect_error(format('update public.connection_instances set granted_scopes = %L where id = %L', '{emails:send}', :'conn'), 'TEBOS_SERVER_ONLY');
select t3.expect_error(format('update public.connection_instances set status = %L where id = %L', 'unavailable', :'conn'), 'TEBOS_SERVER_ONLY');
update public.connection_instances set verification_requested_at = now() where id = :'conn';

-- operators cannot connect providers or set credentials
select set_config('request.jwt.claim.sub', :'op', false);
select t3.expect_error(format('select public.set_connection_secret(%L, %L, %L)', :'conn', 'api_key', 're_operator_key_123'), 'TEBOS_PERMISSION_DENIED');
select t3.expect_error(format('insert into public.connection_instances (org_id, connector_key) values (%L, %L)', :'org', 'resend'), '42501');

-- ===========================================================================
-- Credentials: stored in Vault, never readable by a client
-- ===========================================================================
select set_config('request.jwt.claim.sub', :'admin', false);
select t3.expect_error(format('select public.set_connection_secret(%L, %L, %L)', :'conn', 'api_key', 'short'), 'TEBOS_VALIDATION');
select t3.expect_error(format('select public.set_connection_secret(%L, %L, %L)', :'conn', 'password', 're_valid_key_12345'), 'TEBOS_VALIDATION');
select public.set_connection_secret(:'conn', 'api_key', 're_first_key_12345') as ref1 \gset
select t3.ok((select credential_ref_id = :'ref1' from public.connection_instances where id = :'conn'), 'connection points at the new credential');
-- with a credential, an admin still cannot declare it working
select t3.expect_error(format('update public.connection_instances set last_verified_at = now(), status = %L where id = %L', 'connected', :'conn'),
  'TEBOS_SERVER_ONLY');
select t3.expect_error('select vault_ref from public.credential_references', '42501');
select t3.expect_error('select * from vault.decrypted_secrets', '42501');
select t3.expect_error(format('select tebos_private.read_credential(%L)', :'ref1'), '42501');

-- an outsider cannot set another organisation's credentials
select set_config('request.jwt.claim.sub', :'outsider', false);
select t3.expect_error(format('select public.set_connection_secret(%L, %L, %L)', :'conn', 'api_key', 're_stolen_key_123'), 'TEBOS_PERMISSION_DENIED');

-- the server resolves it; the server verifies and connects
reset role;
select t3.ok(tebos_private.read_credential(:'ref1') = 're_first_key_12345', 'server resolves the credential');
update public.connection_instances set status = 'connected', last_verified_at = now(), granted_scopes = '{emails:send,emails:read}'
  where id = :'conn';

-- replacing the key: old secret destroyed, reference revoked, connection unverified again
set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
select public.set_connection_secret(:'conn', 'api_key', 're_second_key_6789') as ref2 \gset
reset role;
select t3.ok(tebos_private.read_credential(:'ref1') is null, 'the replaced credential no longer resolves');
select t3.ok((select revoked_at is not null from public.credential_references where id = :'ref1'), 'replaced reference revoked');
select t3.ok((select count(*) from vault.secrets where secret = 're_first_key_12345') = 0, 'replaced secret deleted from the vault');
select t3.ok((select status = 'configured' from public.connection_instances where id = :'conn'), 'a new key must be verified again');
update public.connection_instances set status = 'connected', last_verified_at = now() + interval '1 second' where id = :'conn';

-- a client may disable a connection, not restore it to connected
set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
update public.connection_instances set status = 'disabled' where id = :'conn';
update public.connection_instances set status = 'configured' where id = :'conn';
select t3.expect_error(format('update public.connection_instances set status = %L, last_verified_at = now() + interval %L where id = %L',
  'connected', '5 seconds', :'conn'), 'TEBOS_SERVER_ONLY');
reset role;
update public.connection_instances set status = 'connected', last_verified_at = now() + interval '2 seconds' where id = :'conn';

-- ===========================================================================
-- Approved input: an approval authorises exactly what it saw
-- ===========================================================================
set role authenticated;
select set_config('request.jwt.claim.sub', :'op', false);
insert into public.actions (org_id, business_id, finding_id, title, objective, risk_tier, approval_required, capability_key, execution_method)
  values (:'org', :'biz', :'f', 'Send order confirmation', 'Confirm orders by email', 2, true, 'email.send_transactional', 'api')
  returning id as act \gset
select t3.expect_error(format('update public.actions set status = %L where id = %L', 'ready', :'act'), 'TEBOS_VALIDATION');
update public.actions set execution_input = '{"to": ["buyer@clay.test"], "subject": "Order received", "text": "Thanks"}' where id = :'act';
update public.actions set status = 'ready' where id = :'act';
insert into public.approvals (org_id, action_id, requested_operation, risk_tier, proposed_action)
  values (:'org', :'act', 'Send order confirmation', 2, '{"execution_input": {"to": ["someone@else.test"]}}') returning id as ap \gset
select t3.ok((select proposed_action -> 'execution_input' -> 'to' ->> 0 = 'buyer@clay.test' from public.approvals where id = :'ap'),
  'the approval records the real input, not what the requester claimed');
select t3.expect_error(format('update public.actions set execution_input = %L where id = %L', '{"to": ["attacker@evil.test"], "subject": "x", "text": "x"}', :'act'),
  'TEBOS_INPUT_FROZEN');

select set_config('request.jwt.claim.sub', :'appr', false);
select t3.expect_error(format('update public.approvals set input_hash = %L where id = %L', 'x', :'ap'), 'TEBOS_APPROVAL_IMMUTABLE');
update public.approvals set status = 'approved' where id = :'ap';
select t3.ok((select status = 'approved' from public.actions where id = :'act'), 'approval moved the action on');

-- clients cannot run provider actions or fabricate provider runs
select set_config('request.jwt.claim.sub', :'op', false);
update public.actions set status = 'queued' where id = :'act';
select t3.expect_error(format('update public.actions set status = %L where id = %L', 'running', :'act'), 'TEBOS_SERVER_ONLY');
select t3.expect_error(format('insert into public.action_runs (org_id, action_id, execution_method, idempotency_key) values (%L, %L, %L, %L)',
  :'org', :'act', 'api', 'forged'), 'TEBOS_SERVER_ONLY');
select t3.expect_error(format('insert into public.action_runs (org_id, action_id, execution_method, idempotency_key, provider_reference) values (%L, %L, %L, %L, %L)',
  :'org', :'act', 'manual', 'forged2', 'msg_fake'), 'TEBOS_SERVER_ONLY');

-- a blocked action whose input changes needs a new approval
update public.actions set status = 'blocked', blocked_reason = 'Waiting for the customer list' where id = :'act';
update public.actions set execution_input = '{"to": ["other@clay.test"], "subject": "Order received", "text": "Thanks"}' where id = :'act';
reset role;
select t3.expect_error(format('update public.actions set status = %L where id = %L', 'approved', :'act'), 'TEBOS_APPROVAL_REQUIRED');
-- put the approved input back so the worker path can be exercised
set role authenticated;
select set_config('request.jwt.claim.sub', :'op', false);
update public.actions set execution_input = '{"to": ["buyer@clay.test"], "subject": "Order received", "text": "Thanks"}', status = 'ready',
  blocked_reason = null where id = :'act';
insert into public.approvals (org_id, action_id, requested_operation, risk_tier) values (:'org', :'act', 'Send order confirmation', 2) returning id as ap2 \gset
select set_config('request.jwt.claim.sub', :'appr', false);
update public.approvals set status = 'approved' where id = :'ap2';
select set_config('request.jwt.claim.sub', :'op', false);
update public.actions set status = 'queued' where id = :'act';

-- the server cannot run it with input the approval did not see either
reset role;
begin;
update public.actions set status = 'blocked', blocked_reason = 'x' where id = :'act';
update public.actions set execution_input = '{"to": ["attacker@evil.test"], "subject": "x", "text": "x"}', status = 'ready', blocked_reason = null where id = :'act';
select t3.expect_error(format('update public.actions set status = %L where id = %L', 'queued', :'act'), 'TEBOS_APPROVAL_REQUIRED');
rollback;

-- ===========================================================================
-- The worker's path: run, provider reference, provider verification
-- ===========================================================================
select set_config('request.jwt.claim.sub', '', false), set_config('tebos.actor_type', 'agent', false), set_config('tebos.actor_id', 'execution-worker:test', false);
insert into public.action_runs (org_id, action_id, approval_id, connection_instance_id, capability_key, execution_method, idempotency_key)
  values (:'org', :'act', :'ap2', :'conn', 'email.send_transactional', 'api', :'act' || ':' || :'ap2') returning id as run \gset
update public.actions set status = 'running' where id = :'act';
select t3.ok((select status = 'consumed' from public.approvals where id = :'ap2'), 'execution consumed the approval');
update public.action_runs set status = 'running' where id = :'run';
update public.action_runs set status = 'succeeded', provider_reference = 'msg_123', provider_status = 'sent', provider_status_at = now()
  where id = :'run';
update public.actions set status = 'completed', result = 'Resend accepted the email' where id = :'act';
select t3.expect_error(format('insert into public.action_runs (org_id, action_id, approval_id, execution_method, idempotency_key) values (%L, %L, %L, %L, %L)',
  :'org', :'act', :'ap2', 'api', :'act' || ':' || :'ap2'), '23505');

-- a person cannot claim the provider confirmed it
set role authenticated;
select set_config('request.jwt.claim.sub', :'op', false);
select t3.expect_error(format('update public.action_runs set verified = true, verification_method = %L where id = %L', 'provider:resend:delivered', :'run'),
  'TEBOS_SERVER_ONLY');
reset role;
select set_config('request.jwt.claim.sub', '', false);
update public.action_runs set verified = true, verification_method = 'provider:resend:delivered', provider_status = 'delivered',
  provider_status_at = now() where id = :'run';
update public.actions set status = 'verified' where id = :'act';
select t3.ok((select verification_status = 'verified' from public.actions where id = :'act'), 'provider-verified action');
select t3.ok((select count(*) from public.audit_events where entity_id = :'run' and actor_type = 'agent') >= 4, 'worker writes are audited as the agent');
select set_config('tebos.actor_type', '', false), set_config('tebos.actor_id', '', false);
