-- TEBOS database rule tests. Each block tries to break a foundational rule
-- and asserts the database refuses. Run via scripts/test-db.sh.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema t;
grant usage on schema t to authenticated;

-- Runs p_sql and asserts it fails. p_expect is either a TEBOS_* hint or a SQLSTATE.
create function t.expect_error(p_sql text, p_expect text) returns void
language plpgsql as $$
declare v_hint text; v_state text; v_msg text;
begin
  begin
    -- deferred checks (e.g. finding support) must fire inside this block
    set constraints all immediate;
    execute p_sql;
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint, v_state = returned_sqlstate, v_msg = message_text;
    if (p_expect like 'TEBOS_%' and v_hint is distinct from p_expect)
       or (p_expect not like 'TEBOS_%' and v_state <> p_expect) then
      raise exception 'expected % but got % / % (%)', p_expect, v_state, v_hint, v_msg;
    end if;
    return;
  end;
  raise exception 'expected % but statement succeeded: %', p_expect, p_sql;
end $$;
grant execute on function t.expect_error(text, text) to authenticated;

create function t.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if;
end $$;
grant execute on function t.ok(boolean, text) to authenticated;

-- people
select '00000000-0000-0000-0000-00000000000a' as admin_a,
       '00000000-0000-0000-0000-00000000000b' as op_b,
       '00000000-0000-0000-0000-00000000000c' as appr_c,
       '00000000-0000-0000-0000-00000000000d' as op_d,
       '00000000-0000-0000-0000-00000000000e' as viewer_v \gset
insert into auth.users (id) values (:'admin_a'), (:'op_b'), (:'appr_c'), (:'op_d'), (:'viewer_v');

-- ===========================================================================
-- Tenancy
-- ===========================================================================
set role authenticated;
select set_config('request.jwt.claim.sub', :'admin_a', false);
select public.create_organisation('Tidy Enterprise', 'tidy') as org1 \gset
insert into public.memberships (org_id, user_id, role) values
  (:'org1', :'op_b', 'operator'), (:'org1', :'appr_c', 'approver'), (:'org1', :'viewer_v', 'viewer');

select set_config('request.jwt.claim.sub', :'op_d', false);
select public.create_organisation('Other Client', 'other') as org2 \gset

-- operator B creates a business in org1
select set_config('request.jwt.claim.sub', :'op_b', false);
insert into public.businesses (org_id, name, website, primary_domain)
  values (:'org1', 'Mmupi and Clay', 'https://mmupiandclay.co.za/', 'mmupiandclay.co.za')
  returning id as biz1 \gset

-- D (other tenant) cannot see or write org1 data
select set_config('request.jwt.claim.sub', :'op_d', false);
select t.ok((select count(*) from public.businesses) = 0, 'other tenant sees no businesses');
select t.ok((select count(*) from public.organisations) = 1, 'other tenant sees only its own organisation');
select t.ok((select count(*) from public.audit_events where org_id = :'org1') = 0, 'other tenant sees no audit events');
select t.expect_error(format('insert into public.businesses (org_id, name) values (%L, %L)', :'org1', 'Intruder'), '42501');
select t.expect_error(format('insert into public.memberships (org_id, user_id, role) values (%L, %L, %L)',
  :'org1', :'op_d', 'org_admin'), '42501');

-- viewer is read-only; operator cannot manage members
select set_config('request.jwt.claim.sub', :'viewer_v', false);
select t.ok((select count(*) from public.businesses) = 1, 'viewer can read');
select t.expect_error(format('insert into public.businesses (org_id, name) values (%L, %L)', :'org1', 'V'), '42501');
select set_config('request.jwt.claim.sub', :'op_b', false);
select t.expect_error(format('insert into public.memberships (org_id, user_id, role) values (%L, %L, %L)',
  :'org1', :'op_d', 'viewer'), '42501');
update public.memberships set role = 'org_admin' where user_id = :'op_b';
select t.ok((select role from public.memberships where user_id = :'op_b') = 'operator', 'operator cannot promote itself');

-- nobody writes the audit trail directly
select t.expect_error(format('insert into public.audit_events (org_id, actor_type, action, entity_type, hash)
  values (%L, %L, %L, %L, %L)', :'org1', 'user', 'forged', 'x', 'x'), '42501');

-- ===========================================================================
-- Scans: honest completion states
-- ===========================================================================
insert into public.sources (org_id, business_id, source_type, uri)
  values (:'org1', :'biz1', 'public_web', 'https://mmupiandclay.co.za/') returning id as src1 \gset
insert into public.scans (org_id, business_id, objective) values (:'org1', :'biz1', 'Understand the enquiry journey')
  returning id as scan1 \gset

select t.expect_error(format('update public.scans set status = %L where id = %L', 'completed', :'scan1'),
  'TEBOS_ILLEGAL_TRANSITION');
select t.expect_error(format('insert into public.scans (org_id, business_id, status) values (%L, %L, %L)',
  :'org1', :'biz1', 'completed'), 'TEBOS_ILLEGAL_TRANSITION');
update public.scans set status = 'running' where id = :'scan1';
select t.ok((select started_at is not null from public.scans where id = :'scan1'), 'running scan gets started_at');

insert into public.scan_targets (org_id, scan_id, source_id, uri) values
  (:'org1', :'scan1', :'src1', 'https://mmupiandclay.co.za/') returning id as tgt1 \gset
insert into public.scan_targets (org_id, scan_id, uri) values
  (:'org1', :'scan1', 'https://mmupiandclay.co.za/contact') returning id as tgt2 \gset

select t.expect_error(format('update public.scans set status = %L where id = %L', 'partial', :'scan1'),
  'TEBOS_SCAN_UNRESOLVED_TARGETS');
update public.scan_targets set status = 'acquired', http_status = 200, attempted_at = now() where id = :'tgt1';
-- an unavailable target must say why
select t.expect_error(format('update public.scan_targets set status = %L where id = %L', 'unavailable', :'tgt2'), '23514');
update public.scan_targets set status = 'unavailable', http_status = 503, failure_class = 'acquisition',
  failure_detail = 'HTTP 503 from origin' where id = :'tgt2';

select t.expect_error(format('update public.scans set status = %L where id = %L', 'completed', :'scan1'),
  'TEBOS_SCAN_NOT_COMPLETE');
select t.expect_error(format('update public.scans set status = %L, failure_class = %L where id = %L',
  'failed', 'acquisition', :'scan1'), 'TEBOS_SCAN_HIDES_EVIDENCE');
update public.scans set status = 'partial', confidence = 0.48 where id = :'scan1';
select t.ok((select finished_at is not null from public.scans where id = :'scan1'), 'finished scan gets finished_at');
select t.expect_error(format('update public.scans set status = %L where id = %L', 'running', :'scan1'),
  'TEBOS_ILLEGAL_TRANSITION');

-- ===========================================================================
-- Evidence: provenance, "not found" is not "does not exist", immutability
-- ===========================================================================
select t.expect_error(format('insert into public.evidence (org_id, business_id, source_id, state, fact, missing_description)
  values (%L, %L, %L, %L, %L, %L)', :'org1', :'biz1', :'src1', 'unavailable', 'No contact form exists', 'contact page'),
  '23514');
select t.expect_error(format('insert into public.evidence (org_id, business_id, source_id, state, fact)
  values (%L, %L, %L, %L, %L)', :'org1', :'biz1', :'src1', 'acquired', 'Has a phone number'), '23514');

insert into public.evidence (org_id, business_id, source_id, scan_id, scan_target_id, state, fact, excerpt,
                             content_location, retrieved_at, extraction_status, confidence)
  values (:'org1', :'biz1', :'src1', :'scan1', :'tgt1', 'acquired', 'Homepage asks visitors to enquire via WhatsApp only',
          'Chat to us on WhatsApp', 'header nav', now(), 'complete', 0.9)
  returning id as ev1 \gset
insert into public.evidence (org_id, business_id, source_id, scan_id, scan_target_id, state, missing_description)
  values (:'org1', :'biz1', :'src1', :'scan1', :'tgt2', 'unavailable', 'Contact page could not be acquired (HTTP 503)')
  returning id as ev_missing \gset

select t.expect_error(format('update public.evidence set fact = %L where id = %L', 'rewritten', :'ev1'),
  'TEBOS_EVIDENCE_IMMUTABLE');
select t.expect_error(format('update public.evidence set state = %L where id = %L', 'acquired', :'ev_missing'),
  'TEBOS_EVIDENCE_IMMUTABLE');

-- ===========================================================================
-- Findings: evidence before assertion
-- ===========================================================================
insert into public.findings (org_id, business_id, scan_id, title, statement, category, confidence)
  values (:'org1', :'biz1', :'scan1', 'No structured enquiry capture', 'Enquiries arrive only through WhatsApp',
          'revenue_leakage', 0.6) returning id as f1 \gset

select t.expect_error(format('update public.findings set status = %L where id = %L', 'active', :'f1'),
  'TEBOS_FINDING_UNSUPPORTED');
-- evidence that was never obtained cannot support a finding
insert into public.finding_evidence (org_id, business_id, finding_id, evidence_id)
  values (:'org1', :'biz1', :'f1', :'ev_missing');
select t.expect_error(format('update public.findings set status = %L where id = %L', 'active', :'f1'),
  'TEBOS_FINDING_UNSUPPORTED');
insert into public.finding_evidence (org_id, business_id, finding_id, evidence_id)
  values (:'org1', :'biz1', :'f1', :'ev1');
update public.findings set status = 'active' where id = :'f1';
-- the last supporting link cannot be removed from an active finding
select t.expect_error(format('update public.finding_evidence set relation = %L where finding_id = %L and evidence_id = %L',
  'context', :'f1', :'ev1'), 'TEBOS_FINDING_UNSUPPORTED');

-- a finding cannot cite another business's evidence
insert into public.businesses (org_id, name) values (:'org1', 'Second business') returning id as biz2 \gset
insert into public.findings (org_id, business_id, title, statement, category, confidence)
  values (:'org1', :'biz2', 'Borrowed evidence', 'x', 'gap', 0.1) returning id as f_other \gset
select t.expect_error(format('insert into public.finding_evidence (org_id, business_id, finding_id, evidence_id)
  values (%L, %L, %L, %L)', :'org1', :'biz2', :'f_other', :'ev1'), '23503');

-- rows never move between businesses
select t.expect_error(format('update public.findings set business_id = %L where id = %L', :'biz2', :'f1'),
  'TEBOS_TENANT_KEY_FROZEN');

-- deferred check: a finding and its evidence link may be written in one transaction
reset role;
begin;
set role authenticated;
set constraints all deferred;
insert into public.findings (org_id, business_id, title, statement, category, confidence, status)
  values (:'org1', :'biz1', 'Single enquiry channel', 'WhatsApp is the only visible channel', 'risk', 0.55, 'active')
  returning id as f2 \gset
insert into public.finding_evidence (org_id, business_id, finding_id, evidence_id) values (:'org1', :'biz1', :'f2', :'ev1');
commit;
set role authenticated;

-- ===========================================================================
-- Actions: traceable, approved, proven, verified
-- ===========================================================================
insert into public.findings (org_id, business_id, title, statement, category, confidence)
  values (:'org1', :'biz1', 'Draft idea', 'unconfirmed', 'opportunity', 0.2) returning id as f_draft \gset
select t.expect_error(format('insert into public.actions (org_id, business_id, finding_id, title, objective, risk_tier, approval_required)
  values (%L, %L, %L, %L, %L, 1, false)', :'org1', :'biz1', :'f_draft', 'x', 'x'), 'TEBOS_FINDING_NOT_ACTIVE');
select t.expect_error(format('insert into public.actions (org_id, business_id, finding_id, title, objective, risk_tier, approval_required)
  values (%L, %L, %L, %L, %L, 2, false)', :'org1', :'biz1', :'f1', 'x', 'x'), '23514');

-- the risk tier can never be lower than the capability's
select t.expect_error(format('insert into public.actions (org_id, business_id, finding_id, title, objective, risk_tier,
  approval_required, capability_key) values (%L, %L, %L, %L, %L, 1, false, %L)', :'org1', :'biz1', :'f1', 'x', 'x',
  'email.send_transactional'), 'TEBOS_CAPABILITY_TIER');

-- a tier 2 action: publish an enquiry form on the public website
insert into public.actions (org_id, business_id, finding_id, title, objective, risk_tier, approval_required, execution_method)
  values (:'org1', :'biz1', :'f1', 'Add a measurable enquiry form', 'Capture enquiries in a structured way', 2, true, 'manual')
  returning id as act1 \gset

select t.expect_error(format('update public.actions set status = %L where id = %L', 'ready', :'act1'),
  'TEBOS_ACTION_UNASSIGNED');
update public.actions set owner_user_id = :'op_b', capability_key = 'web.update_public_content', status = 'ready'
  where id = :'act1';
select t.expect_error(format('update public.actions set status = %L where id = %L', 'queued', :'act1'),
  'TEBOS_APPROVAL_REQUIRED');
update public.actions set status = 'awaiting_approval' where id = :'act1';
select t.expect_error(format('update public.actions set status = %L where id = %L', 'approved', :'act1'),
  'TEBOS_APPROVAL_REQUIRED');

-- approval must cover the action's risk tier
select t.expect_error(format('insert into public.approvals (org_id, action_id, requested_operation, risk_tier)
  values (%L, %L, %L, 1)', :'org1', :'act1', 'publish form'), 'TEBOS_APPROVAL_TIER');
insert into public.approvals (org_id, action_id, requested_operation, risk_tier, data_scope, proposed_action)
  values (:'org1', :'act1', 'Publish enquiry form on website', 2, 'public website', '{"page": "/contact"}')
  returning id as appr1 \gset
select t.ok((select requested_by = :'op_b' from public.approvals where id = :'appr1'), 'requester recorded as the session user');

-- an operator cannot decide approvals (RLS filters the row out)
update public.approvals set status = 'approved', decided_by = :'op_b' where id = :'appr1';
select t.ok((select status = 'pending' from public.approvals where id = :'appr1'), 'operator cannot approve');

select set_config('request.jwt.claim.sub', :'appr_c', false);
-- the decider is always the session user, whatever the client sends
update public.approvals set status = 'approved', decided_by = :'admin_a', decision_note = 'OK to publish' where id = :'appr1';
select t.ok((select decided_by = :'appr_c' and decided_at is not null from public.approvals where id = :'appr1'),
  'decision recorded as the approver');
select t.expect_error(format('update public.approvals set proposed_action = %L where id = %L', '{"page": "/other"}', :'appr1'),
  'TEBOS_APPROVAL_IMMUTABLE');

select set_config('request.jwt.claim.sub', :'op_b', false);
update public.actions set status = 'approved' where id = :'act1';
update public.actions set status = 'queued' where id = :'act1';
update public.actions set status = 'running' where id = :'act1';
select t.ok((select status = 'consumed' from public.approvals where id = :'appr1'), 'single-use approval consumed on execution');

-- "completed" needs a succeeded run; "verified" needs verification
select t.expect_error(format('update public.actions set status = %L where id = %L', 'completed', :'act1'),
  'TEBOS_ACTION_UNPROVEN');
insert into public.action_runs (org_id, action_id, approval_id, execution_method, idempotency_key)
  values (:'org1', :'act1', :'appr1', 'manual', 'act1-run-1') returning id as run1 \gset
select t.expect_error(format('insert into public.action_runs (org_id, action_id, execution_method, idempotency_key)
  values (%L, %L, %L, %L)', :'org1', :'act1', 'manual', 'act1-run-1'), '23505');
update public.action_runs set status = 'running' where id = :'run1';
select t.expect_error(format('update public.action_runs set verified = true, verification_method = %L where id = %L',
  'manual check', :'run1'), '23514');
update public.action_runs set status = 'succeeded', response_summary = '{"published": true}' where id = :'run1';
update public.actions set status = 'completed' where id = :'act1';
select t.expect_error(format('update public.actions set status = %L where id = %L', 'verified', :'act1'),
  'TEBOS_ACTION_UNVERIFIED');
update public.action_runs set verified = true, verification_method = 'Form submission received in CRM' where id = :'run1';
update public.actions set status = 'verified' where id = :'act1';
select t.ok((select verification_status = 'verified' from public.actions where id = :'act1'), 'verified action marked verified');

-- tier 3: never self-approved
select set_config('request.jwt.claim.sub', :'admin_a', false);
insert into public.actions (org_id, business_id, finding_id, title, objective, risk_tier, approval_required, owner_user_id, status)
  values (:'org1', :'biz1', :'f1', 'Pay for booking tool', 'Buy software', 3, true, :'admin_a', 'proposed')
  returning id as act3 \gset
insert into public.approvals (org_id, action_id, requested_operation, risk_tier)
  values (:'org1', :'act3', 'Pay supplier invoice', 3) returning id as appr3 \gset
select t.expect_error(format('update public.approvals set status = %L where id = %L', 'approved', :'appr3'),
  'TEBOS_SELF_APPROVAL');

-- expired approvals do not count
update public.actions set status = 'ready' where id = :'act3';
update public.actions set status = 'awaiting_approval' where id = :'act3';
reset role;
select set_config('request.jwt.claim.sub', '', false);
insert into public.approvals (org_id, action_id, requested_operation, risk_tier, status, decided_by, decided_at,
                              requested_at, expires_at)
  values (:'org1', :'act3', 'Pay supplier invoice', 3, 'pending', null, null, now() - interval '2 days', now() - interval '1 day')
  returning id as appr_old \gset
update public.approvals set status = 'approved', decided_by = :'appr_c' where id = :'appr_old';
set role authenticated;
select set_config('request.jwt.claim.sub', :'admin_a', false);
select t.expect_error(format('update public.actions set status = %L where id = %L', 'approved', :'act3'),
  'TEBOS_APPROVAL_REQUIRED');

-- dependencies must be met before execution
select set_config('request.jwt.claim.sub', :'op_b', false);
insert into public.actions (org_id, business_id, finding_id, title, objective, risk_tier, approval_required, owner_user_id)
  values (:'org1', :'biz1', :'f1', 'Draft form copy', 'Write the copy', 1, false, :'op_b') returning id as act_a \gset
insert into public.actions (org_id, business_id, finding_id, title, objective, risk_tier, approval_required, owner_user_id)
  values (:'org1', :'biz1', :'f1', 'Review form copy', 'Review', 1, false, :'op_b') returning id as act_b \gset
insert into public.action_dependencies (org_id, business_id, action_id, depends_on_action_id)
  values (:'org1', :'biz1', :'act_b', :'act_a');
update public.actions set status = 'ready' where id = :'act_b';
select t.expect_error(format('update public.actions set status = %L where id = %L', 'queued', :'act_b'),
  'TEBOS_DEPENDENCY_UNMET');
select t.expect_error(format('update public.actions set status = %L where id = %L', 'blocked', :'act_b'), '23514');
update public.actions set status = 'blocked', blocked_reason = 'Waiting for copy draft' where id = :'act_b';

-- ===========================================================================
-- Connections: "connected" only when verified
-- ===========================================================================
reset role;
select set_config('request.jwt.claim.sub', '', false);
insert into public.connectors (key, provider, name, auth_method, execution_method)
  values ('resend', 'Resend', 'Resend email API', 'api_key', 'api');
insert into public.connector_capabilities (connector_key, capability_key, operation, risk_tier)
  values ('resend', 'email.send_transactional', 'write', 2);
set role authenticated;
select set_config('request.jwt.claim.sub', :'admin_a', false);

select t.expect_error(format('insert into public.connection_instances (org_id, connector_key, status) values (%L, %L, %L)',
  :'org1', 'resend', 'connected'), 'TEBOS_ILLEGAL_TRANSITION');
insert into public.connection_instances (org_id, connector_key) values (:'org1', 'resend') returning id as conn1 \gset
select t.expect_error(format('update public.connection_instances set status = %L, last_verified_at = now() where id = %L',
  'connected', :'conn1'), 'TEBOS_CONNECTION_UNVERIFIED');
insert into public.credential_references (org_id, connector_key, vault_ref, label)
  values (:'org1', 'resend', 'vault://tebos/org1/resend', 'Resend production key') returning id as cred1 \gset
select t.expect_error(format('update public.connection_instances set status = %L, credential_ref_id = %L where id = %L',
  'connected', :'cred1', :'conn1'), 'TEBOS_CONNECTION_UNVERIFIED');
update public.connection_instances set status = 'connected', credential_ref_id = :'cred1', last_verified_at = now()
  where id = :'conn1';

-- secrets pointers are never readable by clients
select set_config('request.jwt.claim.sub', :'op_b', false);
select t.expect_error('select vault_ref from public.credential_references', '42501');
select t.ok((select count(*) from public.credential_references) = 1, 'operator sees credential metadata');
select set_config('request.jwt.claim.sub', :'viewer_v', false);
select t.ok((select count(*) from public.credential_references) = 0, 'viewer does not see credential references');

-- ===========================================================================
-- Audit trail: complete, attributed, append-only, tamper-evident
-- ===========================================================================
select t.ok((select count(*) from public.audit_events where entity_id = :'act1' and action = 'actions.transition') = 7,
  'every action transition audited');
select t.ok((select bool_and(actor_type = 'user' and actor_id = :'op_b') from public.audit_events
             where entity_id = :'act1' and action = 'actions.transition'), 'transitions attributed to the session user');
select t.ok((select count(*) from public.audit_events where entity_id = :'appr1' and action = 'approvals.transition'
             and actor_id = :'appr_c') = 1, 'approval decision attributed to the approver');

reset role;
select t.expect_error('update public.audit_events set action = ''tampered''', '42501');
select t.expect_error('delete from public.audit_events', '42501');

-- the hash chain recomputes for the whole tenant
do $$
declare r record; v_prev text := null; v_org uuid;
begin
  select id into v_org from public.organisations where slug = 'tidy';
  for r in select * from public.audit_events where org_id = v_org order by id loop
    if r.prev_hash is distinct from v_prev or r.hash <> encode(sha256(convert_to(concat_ws('|', r.prev_hash,
         r.occurred_at::text, r.actor_type, r.actor_id, r.action, r.entity_type, r.entity_id::text,
         r.before::text, r.after::text), 'UTF8')), 'hex') then
      raise exception 'audit chain broken at event %', r.id;
    end if;
    v_prev := r.hash;
  end loop;
end $$;

-- trusted server code without a user session identifies itself explicitly
select set_config('request.jwt.claim.sub', '', false);
begin;
set local tebos.actor_type = 'agent';
set local tebos.actor_id = 'agent-run-42';
insert into public.agent_runs (org_id, business_id, agent_role, purpose) values
  (:'org1', :'biz1', 'business_intelligence', 'Generate findings for scan') returning id as run_ag \gset
commit;
select t.ok((select actor_type = 'agent' and actor_id = 'agent-run-42' from public.audit_events
             where entity_id = :'run_ag'), 'agent actor recorded');

-- only signed-in users can create organisations; anon cannot even call the function
select t.ok(not has_function_privilege('anon', 'public.create_organisation(text, text)', 'execute'),
  'anon cannot execute create_organisation');
select t.ok(has_function_privilege('authenticated', 'public.create_organisation(text, text)', 'execute'),
  'authenticated can execute create_organisation');
-- every tebos_private function pins its search_path
select t.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'tebos_private' and not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')),
  'tebos_private functions pin search_path');

select 'ok' as rules;
