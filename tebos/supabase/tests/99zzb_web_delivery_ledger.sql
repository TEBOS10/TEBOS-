-- Web delivery, milestone 2: tasks wait on their dependencies and never loop; nobody passes their own review; done
-- needs evidence; an asset is received only with its source and licence; production deploys need the client's release
-- approval; a deployment only changes to say it was rolled back; handover needs a live production deployment; the
-- dashboard read shows each caller only what they may see.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99zzb;
grant usage on schema t99zzb to anon, authenticated;
create function t99zzb.expect_error(p_sql text, p_expect text) returns void
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
create function t99zzb.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t99zzb to anon, authenticated;

select '9fa80000-0000-0000-0000-00000000000a' as builder, '9fa80000-0000-0000-0000-00000000000f' as reviewer,
       '9fa80000-0000-0000-0000-00000000000b' as owner, '9fa80000-0000-0000-0000-00000000000d' as other,
       '9fa80000-0000-0000-0000-0000000000c1' as org, '9fa80000-0000-0000-0000-0000000000c2' as org2 \gset
insert into auth.users (id, email, email_confirmed_at) values
  (:'builder', 'b@t99zzb.test', now()), (:'reviewer', 'r@t99zzb.test', now()), (:'owner', 'o@c99zzb.test', now()), (:'other', 'x@d99zzb.test', now());
insert into public.platform_staff (user_id, role) values (:'builder', 'maintainer'), (:'reviewer', 'maintainer');
insert into public.organisations (id, name, slug) values (:'org', 'Client 99zzb', 'client-99zzb'), (:'org2', 'Other 99zzb', 'other-99zzb');
insert into public.memberships (org_id, user_id, role) values (:'org', :'owner', 'org_admin'), (:'org2', :'other', 'org_admin');

select set_config('tebos.actor_type', 'agent', false), set_config('tebos.actor_id', 'web-ledger:sql', false);
insert into public.enquiries (plan, name, business, email) values ('starter', 'O', 'Client 99zzb', 'o@c99zzb.test') returning id as enq \gset
insert into public.opportunities (enquiry_id, plan, contact_name, business, email, org_id)
  values (:'enq', 'starter', 'O', 'Client 99zzb', 'o@c99zzb.test', :'org') returning id as opp \gset
insert into public.billing_accounts (opportunity_id, org_id, plan, monthly_cents, anchor_day, next_invoice_on, status)
  values (:'opp', :'org', 'starter', 50000, 1, current_date, 'active');

set role authenticated;
select set_config('request.jwt.claim.sub', :'builder', false);
insert into public.web_projects (org_id, name, website_type, primary_objective, plan, status_note)
  values (:'org', 'Client 99zzb website', 'service_business', 'leads', 'starter', 'Intake form received from the client.') returning id as proj \gset

-- the dashboard's reads: a maintainer sees the project and its client; can open projects for clients with a plan
select t99zzb.ok((select count(*) = 1 and bool_and(org_name = 'Client 99zzb') and bool_and(readiness_gaps >= 9) from public.web_delivery_board() where id = :'proj'),
  'the board shows the project, its client and its readiness gaps');
select t99zzb.ok((select count(*) = 1 from public.web_delivery_clients() where org_id = :'org' and plan = 'starter'), 'a client with a plan can get a project');
select t99zzb.ok((select count(*) = 0 from public.web_delivery_clients() where org_id = :'org2'), 'a client without a plan is not offered');

-- ===========================================================================
-- Tasks and dependencies
-- ===========================================================================
insert into public.web_tasks (project_id, org_id, role, title, done_when, assigned_to)
  values (:'proj', :'org', 'creative', 'Design direction', 'The client approves one hero idea and the tokens.', :'builder') returning id as t1 \gset
insert into public.web_tasks (project_id, org_id, role, title, done_when, assigned_to)
  values (:'proj', :'org', 'frontend', 'Build the home page', 'Home renders at 375 and 1280 px with no overflow.', :'builder') returning id as t2 \gset
insert into public.web_tasks (project_id, org_id, role, title, done_when)
  values (:'proj', :'org', 'qa', 'QA the home page', 'Every acceptance criterion is checked with evidence.') returning id as t3 \gset
select t99zzb.expect_error(format($$insert into public.web_tasks (project_id, org_id, role, title, done_when) values (%L, %L, 'magician', 'Magic', 'It works by magic.')$$, :'proj', :'org'), '23514');
insert into public.web_task_dependencies (task_id, depends_on, project_id) values (:'t2', :'t1', :'proj'), (:'t3', :'t2', :'proj');
select t99zzb.expect_error(format($$insert into public.web_task_dependencies (task_id, depends_on, project_id) values (%L, %L, %L)$$, :'t1', :'t3', :'proj'), 'TEBOS_VALIDATION');
select t99zzb.expect_error(format($$insert into public.web_task_dependencies (task_id, depends_on, project_id) values (%L, %L, %L)$$, :'t1', :'t1', :'proj'), 'TEBOS_VALIDATION');

select t99zzb.expect_error(format($$update public.web_tasks set status = 'in_progress' where id = %L$$, :'t2'), 'TEBOS_DEPENDENCY_UNMET');
select t99zzb.expect_error(format($$update public.web_tasks set status = 'done', evidence = 'Skipping straight to done' where id = %L$$, :'t1'), 'TEBOS_ILLEGAL_TRANSITION');
update public.web_tasks set status = 'in_progress' where id = :'t1';
update public.web_tasks set status = 'review' where id = :'t1';
-- the builder can't pass their own review
select t99zzb.expect_error(format($$update public.web_tasks set status = 'done', evidence = 'I checked my own work.' where id = %L$$, :'t1'), 'TEBOS_SELF_APPROVAL');
select set_config('request.jwt.claim.sub', :'reviewer', false);
select t99zzb.expect_error(format($$update public.web_tasks set status = 'done' where id = %L$$, :'t1'), '23514');
update public.web_tasks set status = 'done', evidence = 'Client approved the editorial direction on the call; tokens in the repo.' where id = :'t1';
select set_config('request.jwt.claim.sub', :'builder', false);
update public.web_tasks set status = 'in_progress' where id = :'t2';
select t99zzb.expect_error(format($$update public.web_tasks set status = 'blocked' where id = %L$$, :'t2'), '23514');
update public.web_tasks set status = 'blocked', blocked_reason = 'Waiting for the client''s photographs.' where id = :'t2';
update public.web_tasks set status = 'in_progress' where id = :'t2';
select t99zzb.ok((select blocked_reason is null from public.web_tasks where id = :'t2'), 'the block reason clears when work resumes');
select t99zzb.expect_error(format($$update public.web_tasks set project_id = %L where id = %L$$, :'proj', :'t2'), '42501');
select t99zzb.ok((select tasks_total = 3 and tasks_done = 1 from public.web_delivery_board() where id = :'proj'), 'the board counts done tasks');

-- ===========================================================================
-- Assets
-- ===========================================================================
insert into public.web_assets (project_id, org_id, label, kind) values (:'proj', :'org', 'Logo (SVG)', 'logo') returning id as logo \gset
select t99zzb.ok((select status = 'missing' and source = 'unknown' from public.web_assets where id = :'logo'), 'an asset starts missing');
select t99zzb.expect_error(format($$update public.web_assets set status = 'received' where id = %L$$, :'logo'), '23514');
select t99zzb.expect_error(format($$update public.web_assets set status = 'received', source = 'client_supplied' where id = %L$$, :'logo'), '23514');
update public.web_assets set status = 'received', source = 'client_supplied', licence_note = 'The client''s own logo, which they own outright.', location = 'Repository: assets/logo.svg' where id = :'logo';

-- ===========================================================================
-- Deployments, release and handover
-- ===========================================================================
select t99zzb.expect_error(format($$insert into public.web_deployments (project_id, org_id, environment, url, commit_ref, outcome, checked)
  values (%L, %L, 'preview', 'http://insecure.example', '1de4b0b', 'live', 'Home loads on mobile.')$$, :'proj', :'org'), '23514');
insert into public.web_deployments (project_id, org_id, environment, url, commit_ref, outcome, checked)
  values (:'proj', :'org', 'preview', 'https://preview.example/client-99zzb', '1de4b0b', 'live', 'Home loads on mobile and desktop.') returning id as dep1 \gset
select t99zzb.expect_error(format($$insert into public.web_deployments (project_id, org_id, environment, url, commit_ref, outcome, checked)
  values (%L, %L, 'production', 'https://client-99zzb.example', '1de4b0b', 'live', 'Home loads on mobile.')$$, :'proj', :'org'), 'TEBOS_VALIDATION');
select t99zzb.expect_error(format($$update public.web_deployments set outcome = 'failed' where id = %L$$, :'dep1'), 'TEBOS_INPUT_FROZEN');
select t99zzb.expect_error(format($$update public.web_deployments set outcome = 'rolled_back' where id = %L$$, :'dep1'), '23514');
update public.web_deployments set outcome = 'rolled_back', rollback_note = 'Preview replaced by the next build.' where id = :'dep1';

-- walk the project to release (the same gates milestone 1 tests)
insert into public.web_scope_revisions (project_id, org_id, pages, features, workflows, exclusions, primary_conversion, acceptance_criteria, recurring_costs)
  values (:'proj', :'org', '{Home,Contact}', '{Enquiry form}', '{Enquiry}', 'No payments in this phase.', 'Send an enquiry from the contact form',
          '{"The form saves or shows an error"}', 'None') returning id as rev \gset
update public.web_projects set status = 'scope_review', status_note = 'Scope written for the client.' where id = :'proj';
update public.web_projects set status = 'approval', status_note = 'Sent to the client to approve.' where id = :'proj';
select set_config('request.jwt.claim.sub', :'owner', false);
insert into public.web_project_approvals (project_id, org_id, revision_id, kind) values (:'proj', :'org', :'rev', 'scope'), (:'proj', :'org', :'rev', 'design');
select t99zzb.ok((select count(*) = 3 from public.web_tasks), 'the client reads their project''s tasks');
select t99zzb.ok((select count(*) = 1 from public.web_delivery_board()), 'the client sees only their own project on the board');
select t99zzb.expect_error(format($$insert into public.web_tasks (project_id, org_id, role, title, done_when) values (%L, %L, 'qa', 'Client task', 'The client adds work.')$$, :'proj', :'org'), '42501');
select set_config('request.jwt.claim.sub', :'other', false);
select t99zzb.ok((select count(*) = 0 from public.web_delivery_board()), 'another client sees nothing');
select t99zzb.ok((select count(*) = 0 from public.web_tasks) and (select count(*) = 0 from public.web_assets), 'another client reads no tasks or assets');
select t99zzb.ok((select count(*) = 0 from public.web_delivery_clients()), 'a client can''t list TEBOS''s clients');
select set_config('request.jwt.claim.sub', :'builder', false);
insert into public.web_readiness_items (project_id, org_id, item, status, evidence)
  select :'proj', :'org', i, 'met', 'Confirmed for the ledger test.'
    from unnest(array['commercial_terms', 'intake_complete', 'assets', 'technical_access', 'dependencies', 'delivery_window', 'security_privacy', 'release_authority']) i;
update public.web_projects set status = 'build', status_note = 'Ready: building now.' where id = :'proj';
update public.web_projects set status = 'qa', status_note = 'Built; to QA.' where id = :'proj';
insert into public.web_qa_runs (project_id, org_id, revision_id, verdict, critical_open, checked, evidence)
  values (:'proj', :'org', :'rev', 'pass', 0, '{pages,forms}', 'All criteria pass on the preview.');
update public.web_projects set status = 'client_review', status_note = 'Preview with the client.' where id = :'proj';
select set_config('request.jwt.claim.sub', :'owner', false);
insert into public.web_project_approvals (project_id, org_id, revision_id, kind) values (:'proj', :'org', :'rev', 'release');
select set_config('request.jwt.claim.sub', :'builder', false);
update public.web_projects set status = 'release', status_note = 'Client approved the release.' where id = :'proj';
select t99zzb.expect_error(format($$update public.web_projects set status = 'handover', status_note = 'Handing over before going live.' where id = %L$$, :'proj'), 'TEBOS_VALIDATION');
insert into public.web_deployments (project_id, org_id, environment, url, commit_ref, outcome, checked)
  values (:'proj', :'org', 'production', 'https://client-99zzb.example', '7c81552', 'live', 'Home, form and HTTPS checked on the live domain.');
update public.web_projects set status = 'handover', status_note = 'Live; handover pack sent.' where id = :'proj';
select t99zzb.ok((select live_url = 'https://client-99zzb.example' from public.web_delivery_board() where id = :'proj'), 'the board shows the live address');

reset role;
select t99zzb.expect_error(format($$delete from public.web_deployments where id = %L$$, :'dep1'), 'TEBOS_INPUT_FROZEN');
select t99zzb.ok((select count(*) >= 3 from public.audit_events where entity_type = 'web_tasks'), 'tasks are on the audit trail');
drop schema t99zzb cascade;
