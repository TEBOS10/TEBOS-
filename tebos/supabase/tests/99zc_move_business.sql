-- Moving a business to another organisation (founder-approved, 14 Oct 2026):
-- only the server can, it moves one business and everything that belongs to
-- it in one go, it changes nothing but the organisation, and records still
-- can't change organisation any other way.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99zc;
grant usage on schema t99zc to anon, authenticated;
create function t99zc.expect_error(p_sql text, p_expect text) returns void
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
create function t99zc.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t99zc to anon, authenticated;

select '9c3c0000-0000-0000-0000-00000000000a' as admin, '9c3c0000-0000-0000-0000-0000000000a1' as org_a,
       '9c3c0000-0000-0000-0000-0000000000b1' as org_b \gset
insert into auth.users (id, email, email_confirmed_at) values (:'admin', 'admin@m99zc.test', now());
insert into public.organisations (id, name, slug) values (:'org_a', 'Shared 99zc', 'shared-99zc'), (:'org_b', 'Own 99zc', 'own-99zc');
insert into public.memberships (org_id, user_id, role) values (:'org_a', :'admin', 'org_admin'), (:'org_b', :'admin', 'org_admin');

select set_config('tebos.actor_type', 'agent', false), set_config('tebos.actor_id', 'it:99zc', false);
insert into public.businesses (org_id, name) values (:'org_a', 'Stays 99zc') returning id as stays \gset
insert into public.businesses (org_id, name) values (:'org_a', 'Moves 99zc') returning id as moves \gset

-- the business that moves: a scan, its evidence (stated and from a connected system), a measured objective,
-- an agent run with a tool call, and a connection with its credential
insert into public.sources (org_id, business_id, source_type, uri) values (:'org_a', :'moves', 'user_statement', 'owner') returning id as said \gset
insert into public.sources (org_id, business_id, source_type, uri, label) values (:'org_a', :'moves', 'connected_system', 'crm:1', 'CRM') returning id as sys \gset
insert into public.scans (org_id, business_id, objective) values (:'org_a', :'moves', 'Read the website') returning id as scan \gset
insert into public.scan_targets (org_id, scan_id, source_id, uri) values (:'org_a', :'scan', :'said', 'https://moves.example/') returning id as target \gset
insert into public.evidence (org_id, business_id, source_id, state, fact) values (:'org_a', :'moves', :'said', 'user_supplied', 'About 40 clients') returning id as stated \gset
insert into public.evidence (org_id, business_id, source_id, state, fact, structured_value, retrieved_at)
  values (:'org_a', :'moves', :'sys', 'acquired', 'Leads this month: 12', '{"value": 12}', now() - interval '1 hour') returning id as snap \gset
insert into public.objectives (org_id, business_id, title, metric, unit, direction, target_value, period, due_on, owner_id, status)
  values (:'org_a', :'moves', '20 leads a month', 'custom', 'count', 'at_least', 20, 'month', current_date + 60, :'admin', 'active') returning id as obj \gset
insert into public.objective_measurements (org_id, business_id, objective_id, basis, value_path, evidence_id)
  values (:'org_a', :'moves', :'obj', 'measured', '{value}', :'snap') returning id as meas \gset
insert into public.agent_runs (org_id, business_id, agent_role, purpose, status) values (:'org_a', :'moves', 'acquisition', 'read', 'running') returning id as run \gset
insert into public.tool_calls (org_id, agent_run_id, tool, status) values (:'org_a', :'run', 'fetch', 'succeeded');
insert into public.credential_references (org_id, connector_key, vault_ref) values (:'org_a', 'bame-ops', 'vault:99zc') returning id as cred \gset
insert into public.connection_instances (org_id, business_id, connector_key, credential_ref_id) values (:'org_a', :'moves', 'bame-ops', :'cred') returning id as conn \gset
-- the business that stays has its own evidence
insert into public.sources (org_id, business_id, source_type, uri) values (:'org_a', :'stays', 'user_statement', 'owner') returning id as stays_src \gset
insert into public.evidence (org_id, business_id, source_id, state, fact) values (:'org_a', :'stays', :'stays_src', 'user_supplied', 'Stays here') returning id as stays_ev \gset

-- ===========================================================================
-- Without the sanctioned move, nothing changes organisation
-- ===========================================================================
select t99zc.expect_error(format('update public.businesses set org_id = %L where id = %L', :'org_b', :'moves'), 'TEBOS_TENANT_KEY_FROZEN');
select t99zc.expect_error(format('update public.evidence set org_id = %L where id = %L', :'org_b', :'stated'), 'TEBOS_TENANT_KEY_FROZEN');
-- setting the move's markers by hand doesn't open the door to anything else: another business, or another column
select set_config('tebos.move_business', :'moves', false), set_config('tebos.move_from_org', :'org_a', false), set_config('tebos.move_to_org', :'org_b', false);
select t99zc.expect_error(format('update public.evidence set org_id = %L, business_id = %L where id = %L', :'org_b', :'stays', :'stays_ev'), 'TEBOS_TENANT_KEY_FROZEN');
select t99zc.expect_error(format('update public.evidence set org_id = %L, fact = %L where id = %L', :'org_b', 'rewritten', :'stated'), 'TEBOS_TENANT_KEY_FROZEN');
select t99zc.expect_error(format('update public.objective_measurements set value = 99 where id = %L', :'meas'), 'TEBOS_EVIDENCE_IMMUTABLE');
-- and a signed-in person gets nothing from them at all
set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
select t99zc.expect_error(format('update public.businesses set org_id = %L where id = %L', :'org_b', :'moves'), 'TEBOS_TENANT_KEY_FROZEN');
select t99zc.expect_error(format('select tebos_private.move_business(%L, %L)', :'moves', :'org_b'), '42501');
reset role;
select set_config('tebos.move_business', '', false), set_config('tebos.move_from_org', '', false), set_config('tebos.move_to_org', '', false);
select set_config('request.jwt.claim.sub', '', false);

-- nonsense moves are refused
select t99zc.expect_error(format('select tebos_private.move_business(%L, %L)', :'moves', :'org_a'), 'TEBOS_VALIDATION');
select t99zc.expect_error(format('select tebos_private.move_business(%L, %L)', :'moves', gen_random_uuid()), 'TEBOS_VALIDATION');
select t99zc.expect_error(format('select tebos_private.move_business(%L, %L)', gen_random_uuid(), :'org_b'), 'TEBOS_VALIDATION');

-- ===========================================================================
-- The sanctioned move: everything of the business, nothing else
-- ===========================================================================
select tebos_private.move_business(:'moves', :'org_b') as moved \gset
select t99zc.ok((:'moved'::jsonb ->> 'evidence')::int = 2 and (:'moved'::jsonb ->> 'scan_targets')::int = 1
                and (:'moved'::jsonb ->> 'tool_calls')::int = 1 and (:'moved'::jsonb ->> 'credential_references')::int = 1
                and (:'moved'::jsonb ->> 'objective_measurements')::int = 1, 'the move reports what it moved');
select t99zc.ok((select count(*) = 0 from (
    select org_id from public.businesses where id = :'moves'
    union all select org_id from public.sources where business_id = :'moves'
    union all select org_id from public.scans where business_id = :'moves'
    union all select org_id from public.scan_targets where scan_id = :'scan'
    union all select org_id from public.evidence where business_id = :'moves'
    union all select org_id from public.objectives where business_id = :'moves'
    union all select org_id from public.objective_measurements where business_id = :'moves'
    union all select org_id from public.agent_runs where business_id = :'moves'
    union all select org_id from public.tool_calls where agent_run_id = :'run'
    union all select org_id from public.connection_instances where business_id = :'moves'
    union all select org_id from public.credential_references where id = :'cred') x where org_id <> :'org_b'),
  'every record of the moved business is in its new organisation');
select t99zc.ok((select org_id = :'org_a' from public.businesses where id = :'stays')
            and (select org_id = :'org_a' from public.evidence where id = :'stays_ev'), 'the business that stays is untouched');
select t99zc.ok((select fact = 'About 40 clients' and state = 'user_supplied' from public.evidence where id = :'stated')
            and (select value = 12 from public.objective_measurements where id = :'meas'), 'content is unchanged');
-- after the move the door is shut again
select t99zc.ok(coalesce(current_setting('tebos.move_to_org', true), '') = '', 'the move leaves no markers behind');
select t99zc.expect_error(format('update public.businesses set org_id = %L where id = %L', :'org_a', :'moves'), 'TEBOS_TENANT_KEY_FROZEN');
-- the new organisation sees it; the old one no longer does
set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
select t99zc.ok((select count(*) = 2 from public.evidence where org_id = :'org_b'), 'the new organisation reads the moved evidence');
reset role;
select t99zc.ok((select count(*) >= 1 from public.audit_events where entity_type = 'businesses' and entity_id = :'moves'::uuid and action = 'businesses.update'),
  'the move is audited');

-- a client's business stays with its contract
insert into public.enquiries (plan, name, business, email) values ('starter', 'C', 'Client 99zc', 'c@client99zc.test') returning id as enq \gset
insert into public.businesses (org_id, name) values (:'org_a', 'Client 99zc') returning id as client_biz \gset
insert into public.opportunities (enquiry_id, plan, contact_name, business, email, business_id)
  values (:'enq', 'starter', 'C', 'Client 99zc', 'c@client99zc.test', :'client_biz');
select t99zc.expect_error(format('select tebos_private.move_business(%L, %L)', :'client_biz', :'org_b'), 'TEBOS_VALIDATION');
select set_config('tebos.actor_type', '', false), set_config('tebos.actor_id', '', false);
