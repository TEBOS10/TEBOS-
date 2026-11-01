-- Web delivery, milestone 3: a project takes the client's maintainer; a maintainer runs at most 8 open projects; only
-- maintainers run projects; a client asks for a website change from their own account, counted against their plan;
-- accounts are the client's, with TEBOS's access recorded and revocable; recurring costs the client pays are
-- disclosed; the history reads from the audit trail for staff and the client only; 50 clients fit on the board.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99zzc;
grant usage on schema t99zzc to anon, authenticated;
create function t99zzc.expect_error(p_sql text, p_expect text) returns void
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
create function t99zzc.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t99zzc to anon, authenticated;

select '9fa90000-0000-0000-0000-00000000000a' as m1, '9fa90000-0000-0000-0000-00000000000e' as m2,
       '9fa90000-0000-0000-0000-00000000000b' as owner, '9fa90000-0000-0000-0000-00000000000d' as other,
       '9fa90000-0000-0000-0000-00000000000f' as rep,
       '9fa90000-0000-0000-0000-0000000000c1' as org, '9fa90000-0000-0000-0000-0000000000c2' as org2 \gset
insert into auth.users (id, email, email_confirmed_at) values
  (:'m1', 'm1@t99zzc.test', now()), (:'m2', 'm2@t99zzc.test', now()), (:'owner', 'o@c99zzc.test', now()),
  (:'other', 'x@d99zzc.test', now()), (:'rep', 'r@t99zzc.test', now());
insert into public.platform_staff (user_id, role) values (:'m1', 'maintainer'), (:'m2', 'maintainer'), (:'rep', 'sales');
insert into public.organisations (id, name, slug) values (:'org', 'Client 99zzc', 'client-99zzc'), (:'org2', 'Other 99zzc', 'other-99zzc');
insert into public.memberships (org_id, user_id, role) values (:'org', :'owner', 'org_admin'), (:'org2', :'other', 'org_admin');

-- the client's pipeline record names their maintainer, m1
select set_config('tebos.actor_type', 'agent', false), set_config('tebos.actor_id', 'web-portal:sql', false);
insert into public.enquiries (plan, name, business, email) values ('starter', 'O', 'Client 99zzc', 'o@c99zzc.test') returning id as enq \gset
insert into public.opportunities (enquiry_id, plan, contact_name, business, email, org_id, maintainer_id)
  values (:'enq', 'starter', 'O', 'Client 99zzc', 'o@c99zzc.test', :'org', :'m1') returning id as opp \gset
insert into public.billing_accounts (opportunity_id, org_id, plan, monthly_cents, anchor_day, next_invoice_on, status)
  values (:'opp', :'org', 'starter', 50000, 1, current_date, 'active');

set role authenticated;
select set_config('request.jwt.claim.sub', :'m2', false);
insert into public.web_projects (org_id, name, website_type, primary_objective, plan, status_note)
  values (:'org', 'Client 99zzc website', 'booking', 'bookings', 'starter', 'Intake form received from the client.') returning id as proj, maintainer_id \gset
select t99zzc.ok(:'maintainer_id' = :'m1', 'a project takes the client''s maintainer from the pipeline');
select t99zzc.expect_error(format($$update public.web_projects set maintainer_id = %L where id = %L$$, :'rep', :'proj'), 'TEBOS_VALIDATION');

-- capacity: m2 takes 8 open projects, the 9th is refused, a lead doesn't count
reset role;
insert into public.organisations (id, name, slug)
  select ('9fa90000-0000-0000-0001-' || lpad(i::text, 12, '0'))::uuid, 'Load client ' || i, 'load-99zzc-' || i from generate_series(1, 60) i;
set role authenticated;
select set_config('request.jwt.claim.sub', :'m2', false);
insert into public.web_projects (org_id, name, website_type, primary_objective, plan, status_note, maintainer_id)
  select ('9fa90000-0000-0000-0001-' || lpad(i::text, 12, '0'))::uuid, 'Load site ' || i, 'landing_page', 'leads', 'starter', 'Opened for the load test.', :'m2'
    from generate_series(1, 8) i;
select t99zzc.expect_error(format($$insert into public.web_projects (org_id, name, website_type, primary_objective, plan, status_note, maintainer_id)
  values ('9fa90000-0000-0000-0001-000000000009', 'Ninth', 'landing_page', 'leads', 'starter', 'One too many for m2.', %L)$$, :'m2'), 'TEBOS_VALIDATION');
insert into public.web_projects (org_id, name, website_type, primary_objective, plan, status, status_note, maintainer_id)
  values ('9fa90000-0000-0000-0001-000000000009', 'Ninth as a lead', 'landing_page', 'leads', 'starter', 'lead', 'Still only a lead.', :'m2') returning id as lead \gset
select t99zzc.expect_error(format($$update public.web_projects set status = 'intake', status_note = 'Taking the lead on.' where id = %L$$, :'lead'), 'TEBOS_VALIDATION');
select t99zzc.ok((select open_projects = 8 and capacity = 8 from public.web_team_load() where user_id = :'m2'), 'the team load shows m2 at capacity');

-- 50 clients at once: the rest go to m1 and unassigned; the board carries every one
insert into public.web_projects (org_id, name, website_type, primary_objective, plan, status_note)
  select ('9fa90000-0000-0000-0001-' || lpad(i::text, 12, '0'))::uuid, 'Load site ' || i, 'landing_page', 'leads', 'starter', 'Opened for the load test.'
    from generate_series(10, 52) i;
select t99zzc.ok((select count(*) >= 52 from public.web_delivery_board()), 'the board carries 50+ client projects');

-- ===========================================================================
-- The client asks TEBOS for a change to their website, from their own account
-- ===========================================================================
select set_config('request.jwt.claim.sub', :'owner', false);
insert into public.change_requests (org_id, title, detail, web_project_id)
  values (:'org', 'New gallery photos', 'Replace the three gallery photos with the ones we sent.', :'proj') returning id as cr \gset
select t99zzc.ok((select web_project_id = :'proj' from public.change_requests where id = :'cr'), 'the request lands on the project');
select t99zzc.expect_error(format($$insert into public.change_requests (org_id, title, web_project_id) values (%L, 'Wrong project', '9fa90000-0000-0000-0000-000000000999')$$, :'org'), '23503');
select t99zzc.ok((select count(*) = 1 from public.web_delivery_board()), 'the client sees only their own project');
select t99zzc.ok((select count(*) = 0 from public.web_team_load()), 'a client sees no team load');

-- ===========================================================================
-- Accounts: the client's, with TEBOS's access recorded and revocable
-- ===========================================================================
select set_config('request.jwt.claim.sub', :'m1', false);
select t99zzc.expect_error(format($$insert into public.web_integrations (project_id, org_id, service, provider, tebos_access, purpose)
  values (%L, %L, 'hosting', 'Static host', 'deploy', 'Hosts the client''s website.')$$, :'proj', :'org'), '23514');
insert into public.web_integrations (project_id, org_id, service, provider, tebos_access, purpose, revocation_plan)
  values (:'proj', :'org', 'hosting', 'Static host', 'deploy', 'Hosts the client''s website.', 'Remove TEBOS from the client''s team at handover.') returning id as host \gset
select t99zzc.expect_error(format($$insert into public.web_integrations (project_id, org_id, service, provider, account_owner, purpose)
  values (%L, %L, 'domain', 'Registrar', 'tebos', 'The domain for the site.')$$, :'proj', :'org'), '23514');
select t99zzc.expect_error(format($$update public.web_integrations set status = 'verified' where id = %L$$, :'host'), '23514');
update public.web_integrations set status = 'verified', verified_on = current_date where id = :'host';
select t99zzc.expect_error(format($$update public.web_integrations set status = 'revoked' where id = %L$$, :'host'), '23514');
update public.web_integrations set status = 'revoked', tebos_access = 'none' where id = :'host';
select t99zzc.expect_error(format($$update public.web_integrations set purpose = 'Login for the account: password: hunter2' where id = %L$$, :'host'), '23514');

-- ===========================================================================
-- Costs
-- ===========================================================================
select t99zzc.expect_error(format($$insert into public.web_project_costs (project_id, org_id, kind, description, amount_cents, recurrence, paid_by)
  values (%L, %L, 'hosting', 'Hosting plan', 12000, 'monthly', 'client')$$, :'proj', :'org'), '23514');
insert into public.web_project_costs (project_id, org_id, kind, description, amount_cents, recurrence, paid_by, disclosed_to_client)
  values (:'proj', :'org', 'hosting', 'Hosting plan', 12000, 'monthly', 'client', true);
insert into public.web_project_costs (project_id, org_id, kind, description, amount_cents, recurrence, paid_by)
  values (:'proj', :'org', 'labour', 'Two hours of build time', 0, 'once', 'tebos');

-- ===========================================================================
-- History: staff and the client, nobody else
-- ===========================================================================
update public.web_projects set status = 'blocked_client', status_note = 'Waiting for the client''s photos.' where id = :'proj';
select t99zzc.ok((select count(*) >= 3 from public.web_project_history(:'proj')), 'the history has the project''s events');
select t99zzc.ok((select bool_and(by_tebos) from public.web_project_history(:'proj') where entity_type = 'web_integrations'), 'TEBOS''s own changes are marked');
select t99zzc.ok((select count(*) = 1 from public.web_project_history(:'proj') where to_status = 'blocked_client' and note = 'Waiting for the client''s photos.'), 'a stage change shows its reason');
select set_config('request.jwt.claim.sub', :'owner', false);
select t99zzc.ok((select count(*) >= 3 from public.web_project_history(:'proj')), 'the client reads their history');
select t99zzc.ok((select count(*) = 1 from public.web_integrations) and (select count(*) = 2 from public.web_project_costs), 'the client reads their accounts and costs');
select set_config('request.jwt.claim.sub', :'other', false);
select t99zzc.expect_error(format($$select * from public.web_project_history(%L)$$, :'proj'), '42501');
select t99zzc.ok((select count(*) = 0 from public.web_integrations), 'another client reads no accounts');

reset role;
drop schema t99zzc cascade;
