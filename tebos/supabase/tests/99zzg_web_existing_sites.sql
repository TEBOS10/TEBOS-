-- Existing websites: a project says whether TEBOS builds a new site, edits the client's site, or connects it to TEBOS.
-- An existing site needs its https address; where a project starts is fixed after intake; and "technical access" is met
-- for an existing site only once the client's own hosting, repository or CMS access to TEBOS is on record.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99zzg;
grant usage on schema t99zzg to anon, authenticated;
create function t99zzg.expect_error(p_sql text, p_expect text) returns void
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
create function t99zzg.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t99zzg to anon, authenticated;

select '9fac0000-0000-0000-0000-00000000000a' as m1, '9fac0000-0000-0000-0000-00000000000b' as owner,
       '9fac0000-0000-0000-0000-00000000000c' as viewer, '9fac0000-0000-0000-0000-00000000000d' as other,
       '9fac0000-0000-0000-0000-0000000000c1' as org, '9fac0000-0000-0000-0000-0000000000c2' as org2 \gset
insert into auth.users (id, email, email_confirmed_at) values
  (:'m1', 'm1@t99zzg.test', now()), (:'owner', 'o@c99zzg.test', now()), (:'viewer', 'v@c99zzg.test', now()), (:'other', 'x@d99zzg.test', now());
insert into public.platform_staff (user_id, role) values (:'m1', 'maintainer');
insert into public.organisations (id, name, slug) values (:'org', 'Client 99zzg', 'client-99zzg'), (:'org2', 'Other 99zzg', 'other-99zzg');
insert into public.memberships (org_id, user_id, role) values (:'org', :'owner', 'org_admin'), (:'org', :'viewer', 'viewer'), (:'org2', :'other', 'org_admin');
select set_config('tebos.actor_type', 'agent', false), set_config('tebos.actor_id', 'web-intake:sql', false);
insert into public.enquiries (plan, name, business, email) values ('starter', 'O', 'Client 99zzg', 'o@c99zzg.test') returning id as enq \gset
insert into public.opportunities (enquiry_id, plan, contact_name, business, email, org_id, maintainer_id)
  values (:'enq', 'starter', 'O', 'Client 99zzg', 'o@c99zzg.test', :'org', :'m1') returning id as opp \gset
insert into public.billing_accounts (opportunity_id, org_id, plan, monthly_cents, anchor_day, next_invoice_on, status)
  values (:'opp', :'org', 'starter', 50000, 1, current_date, 'active');

set role authenticated;
select set_config('request.jwt.claim.sub', :'m1', false);
insert into public.web_projects (org_id, name, website_type, primary_objective, plan, status_note)
  values (:'org', 'Client 99zzg website', 'service_business', 'leads', 'starter', 'Opened; the brief is with the client.') returning id as proj \gset

-- ===========================================================================
-- Where a project starts
-- ===========================================================================
select t99zzg.ok((select starting_point = 'new_build' and existing_url is null from public.web_projects where id = :'proj'), 'a project is a new build unless told otherwise');
select t99zzg.expect_error(format($$insert into public.web_projects (org_id, name, website_type, primary_objective, plan, status_note, starting_point)
  values (%L, 'Their site', 'service_business', 'leads', 'starter', 'Edit what they already have.', 'edit_existing')$$, :'org'), '23514');
select t99zzg.expect_error(format($$insert into public.web_projects (org_id, name, website_type, primary_objective, plan, status_note, starting_point, existing_url)
  values (%L, 'Their site', 'service_business', 'leads', 'starter', 'Edit what they already have.', 'edit_existing', 'http://plain.example.co.za')$$, :'org'), '23514');
select t99zzg.expect_error(format($$insert into public.web_projects (org_id, name, website_type, primary_objective, plan, status_note, starting_point, existing_url)
  values (%L, 'Their site', 'service_business', 'leads', 'starter', 'Edit what they already have.', 'rebuild', 'https://their.example.co.za')$$, :'org'), '23514');
insert into public.web_projects (org_id, name, website_type, primary_objective, plan, status_note, starting_point, existing_url)
  values (:'org', 'Client 99zzg existing site', 'service_business', 'leads', 'starter', 'Edit what they already have.', 'edit_existing', 'https://their.example.co.za')
  returning id as site \gset
update public.web_projects set starting_point = 'connect_existing' where id = :'site';
select t99zzg.ok((select starting_point = 'connect_existing' from public.web_projects where id = :'site'), 'the starting point can change during intake');

-- ===========================================================================
-- Access to an existing site is the client's to give, and must be on record
-- ===========================================================================
select t99zzg.expect_error(format($$insert into public.web_readiness_items (project_id, org_id, item, status, evidence)
  values (%L, %L, 'technical_access', 'met', 'The owner says we can log in.')$$, :'site', :'org'), 'TEBOS_VALIDATION');
insert into public.web_integrations (project_id, org_id, service, provider, tebos_access, purpose, revocation_plan)
  values (:'site', :'org', 'cms', 'Site builder', 'admin', 'The client''s existing site editor.', 'The client removes TEBOS''s editor login at handover.') returning id as cms \gset
select t99zzg.expect_error(format($$insert into public.web_readiness_items (project_id, org_id, item, status, evidence)
  values (%L, %L, 'technical_access', 'met', 'Access was asked for, not yet given.')$$, :'site', :'org'), 'TEBOS_VALIDATION');
insert into public.web_integrations (project_id, org_id, service, provider, purpose)
  values (:'site', :'org', 'analytics', 'Analytics tool', 'Visitor numbers for the site.') returning id as analytics \gset
update public.web_integrations set status = 'granted' where id = :'analytics';
select t99zzg.expect_error(format($$insert into public.web_readiness_items (project_id, org_id, item, status, evidence)
  values (%L, %L, 'technical_access', 'met', 'Analytics access is not access to the site.')$$, :'site', :'org'), 'TEBOS_VALIDATION');
update public.web_integrations set status = 'granted' where id = :'cms';
insert into public.web_readiness_items (project_id, org_id, item, status, evidence)
  values (:'site', :'org', 'technical_access', 'met', 'Editor access granted by the owner on the site builder.');
-- a new build is unaffected
insert into public.web_readiness_items (project_id, org_id, item, status, evidence)
  values (:'proj', :'org', 'technical_access', 'met', 'TEBOS hosts the new build on the client''s account.');

-- ===========================================================================
-- After intake the starting point is fixed
-- ===========================================================================
reset role;
update public.web_projects set status = 'blocked_client', status_note = 'Waiting on the client for the test.' where id = :'site';
set role authenticated;
select set_config('request.jwt.claim.sub', :'m1', false);
select t99zzg.expect_error(format($$update public.web_projects set starting_point = 'new_build', existing_url = null where id = %L$$, :'site'), 'TEBOS_INPUT_FROZEN');
select t99zzg.expect_error(format($$update public.web_projects set existing_url = 'https://other.example.co.za' where id = %L$$, :'site'), 'TEBOS_INPUT_FROZEN');

reset role;
drop schema t99zzg cascade;
