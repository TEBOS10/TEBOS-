-- Web delivery, milestone 1: a project moves through its states only with a reason; scope is insert-only and held to
-- the package; only the client's own admin approves; build needs readiness; client review and release need a QA pass
-- (and release the client's release approval); the delivery clock is the database's; clients read only their own.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99zz;
grant usage on schema t99zz to anon, authenticated;
create function t99zz.expect_error(p_sql text, p_expect text) returns void
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
create function t99zz.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t99zz to anon, authenticated;

select '9fa70000-0000-0000-0000-00000000000a' as staff, '9fa70000-0000-0000-0000-00000000000b' as owner,
       '9fa70000-0000-0000-0000-00000000000c' as viewer, '9fa70000-0000-0000-0000-00000000000d' as other,
       '9fa70000-0000-0000-0000-00000000000e' as sales,
       '9fa70000-0000-0000-0000-0000000000c1' as org, '9fa70000-0000-0000-0000-0000000000c2' as org2,
       '9fa70000-0000-0000-0000-0000000000c3' as private_org \gset
insert into auth.users (id, email, email_confirmed_at) values
  (:'staff', 'm@t99zz.test', now()), (:'owner', 'o@c99zz.test', now()), (:'viewer', 'v@c99zz.test', now()),
  (:'other', 'x@d99zz.test', now()), (:'sales', 's@t99zz.test', now());
insert into public.platform_staff (user_id, role) values (:'staff', 'maintainer'), (:'sales', 'sales');
insert into public.organisations (id, name, slug) values (:'org', 'Client 99zz', 'client-99zz'), (:'org2', 'Other 99zz', 'other-99zz');
insert into public.organisations (id, name, slug, app) values (:'private_org', 'Private 99zz', 'private-99zz', 'tepos');
insert into public.memberships (org_id, user_id, role) values
  (:'org', :'owner', 'org_admin'), (:'org', :'viewer', 'viewer'), (:'org2', :'other', 'org_admin');

-- the client's active plan: Small
select set_config('tebos.actor_type', 'agent', false), set_config('tebos.actor_id', 'web-delivery:sql', false);
insert into public.enquiries (plan, name, business, email) values ('starter', 'O', 'Client 99zz', 'o@c99zz.test') returning id as enq \gset
insert into public.opportunities (enquiry_id, plan, contact_name, business, email, org_id)
  values (:'enq', 'starter', 'O', 'Client 99zz', 'o@c99zz.test', :'org') returning id as opp \gset
insert into public.billing_accounts (opportunity_id, org_id, plan, monthly_cents, anchor_day, next_invoice_on, status)
  values (:'opp', :'org', 'starter', 50000, 1, current_date, 'active');

set role authenticated;

-- ===========================================================================
-- Projects: TEBOS's maintainers open them, for TEBOS clients only
-- ===========================================================================
select set_config('request.jwt.claim.sub', :'sales', false);
select t99zz.expect_error(format($$insert into public.web_projects (org_id, name, website_type, primary_objective, plan, status_note)
  values (%L, 'Sales tries', 'landing_page', 'leads', 'starter', 'Sales opening a project')$$, :'org'), '42501');

select set_config('request.jwt.claim.sub', :'staff', false);
insert into public.web_projects (org_id, name, website_type, primary_objective, plan, status_note, deadline_on)
  values (:'org', 'Client 99zz website', 'service_business', 'leads', 'starter', 'Intake form received from the client.', '2020-01-01')
  returning id as proj, ref, status, created_by \gset
select t99zz.ok(:'ref' like 'WP-%', 'a project gets a reference');
select t99zz.ok(:'status' = 'intake', 'a project starts in intake');
select t99zz.ok((select deadline_on is null from public.web_projects where id = :'proj'), 'nobody sets the deadline by hand');
select t99zz.ok(:'created_by' = :'staff', 'the creator is whoever is signed in');
select t99zz.expect_error(format($$insert into public.web_projects (org_id, name, website_type, primary_objective, plan, status_note)
  values (%L, 'Private site', 'landing_page', 'leads', 'starter', 'A founder-only org project')$$, :'private_org'), 'TEBOS_VALIDATION');
select t99zz.expect_error(format($$insert into public.web_projects (org_id, name, website_type, primary_objective, plan, status_note)
  values (%L, 'Bad type', 'metaverse', 'leads', 'starter', 'An unknown website type')$$, :'org'), '23514');

-- every change of state says why, and skipping steps is refused
select t99zz.expect_error(format($$update public.web_projects set status = 'scope_review' where id = %L$$, :'proj'), 'TEBOS_VALIDATION');
select t99zz.expect_error(format($$update public.web_projects set status = 'build', status_note = 'Jumping straight to build' where id = %L$$, :'proj'), 'TEBOS_ILLEGAL_TRANSITION');

-- ===========================================================================
-- Scope: insert-only, numbered, held to the package
-- ===========================================================================
select t99zz.expect_error(format($$insert into public.web_scope_revisions (project_id, org_id, pages, features, workflows, exclusions, primary_conversion, acceptance_criteria, recurring_costs)
  values (%L, %L, '{Home,Services,About,FAQ,Contact,Gallery,Team,Blog}', '{Enquiry form,Map,Newsletter}', '{Enquiry}',
          'No payments or bookings.', 'Send an enquiry from the contact form', '{"The enquiry form saves and shows errors"}', 'None')$$, :'proj', :'org'), 'TEBOS_OUT_OF_PLAN');
select t99zz.expect_error(format($$insert into public.web_scope_revisions (project_id, org_id, pages, features, workflows, exclusions, primary_conversion, acceptance_criteria, recurring_costs)
  values (%L, %L, '{Home}', '{}', '{a,b,c,d,e}', 'No payments or bookings.', 'Send an enquiry from the contact form', '{"The enquiry form saves and shows errors"}', 'None')$$, :'proj', :'org'), 'TEBOS_OUT_OF_PLAN');
insert into public.web_scope_revisions (project_id, org_id, revision, pages, features, workflows, exclusions, primary_conversion, acceptance_criteria, recurring_costs)
  values (:'proj', :'org', 7, '{Home,Services,About,FAQ,Contact}', '{Enquiry form}', '{Enquiry to follow-up}',
          'No online payments or bookings in this phase.', 'Send an enquiry from the contact form',
          '{"Every page loads on mobile and desktop","The enquiry form saves the enquiry and shows an error when saving fails"}',
          'Hosting on the free Vercel plan; no other recurring costs.')
  returning id as rev1, revision as rev1_no \gset
select t99zz.ok(:'rev1_no' = '1', 'the database numbers revisions');
select t99zz.expect_error(format($$update public.web_scope_revisions set exclusions = 'Rewritten afterwards' where id = %L$$, :'rev1'), '42501');
reset role;
select t99zz.expect_error(format($$update public.web_scope_revisions set exclusions = 'Rewritten afterwards' where id = %L$$, :'rev1'), 'TEBOS_INPUT_FROZEN');
select t99zz.expect_error(format($$delete from public.web_scope_revisions where id = %L$$, :'rev1'), 'TEBOS_INPUT_FROZEN');
set role authenticated;
select set_config('request.jwt.claim.sub', :'staff', false);

update public.web_projects set status = 'scope_review', status_note = 'Scope revision 1 written for the client.' where id = :'proj';
update public.web_projects set status = 'approval', status_note = 'Sent scope 1 and the design direction to the client.' where id = :'proj';

-- ===========================================================================
-- Approvals: the client's own admin only, once, never edited
-- ===========================================================================
select t99zz.expect_error(format($$insert into public.web_project_approvals (project_id, org_id, revision_id, kind) values (%L, %L, %L, 'scope')$$, :'proj', :'org', :'rev1'), 'TEBOS_VALIDATION');
select set_config('request.jwt.claim.sub', :'viewer', false);
select t99zz.expect_error(format($$insert into public.web_project_approvals (project_id, org_id, revision_id, kind) values (%L, %L, %L, 'scope')$$, :'proj', :'org', :'rev1'), 'TEBOS_VALIDATION');
select set_config('request.jwt.claim.sub', :'other', false);
select t99zz.ok((select count(*) = 0 from public.web_projects), 'another client sees no project');
select t99zz.expect_error(format($$insert into public.web_project_approvals (project_id, org_id, revision_id, kind) values (%L, %L, %L, 'scope')$$, :'proj', :'org', :'rev1'), 'TEBOS_VALIDATION');
select t99zz.expect_error(format($$select public.web_project_readiness(%L)$$, :'proj'), '42501');

select set_config('request.jwt.claim.sub', :'owner', false);
select t99zz.ok((select count(*) = 1 from public.web_projects), 'the client reads their own project');
insert into public.web_project_approvals (project_id, org_id, revision_id, kind, note) values (:'proj', :'org', :'rev1', 'scope', 'Approved as sent.');
select t99zz.expect_error(format($$insert into public.web_project_approvals (project_id, org_id, revision_id, kind) values (%L, %L, %L, 'scope')$$, :'proj', :'org', :'rev1'), '23505');
select t99zz.expect_error(format($$insert into public.web_project_approvals (project_id, org_id, revision_id, kind) values (%L, %L, %L, 'release')$$, :'proj', :'org', :'rev1'), 'TEBOS_VALIDATION');
update public.web_projects set status_note = 'The client edits the status' where id = :'proj';
select t99zz.ok((select status_note <> 'The client edits the status' from public.web_projects where id = :'proj'), 'a client can''t change the project');

-- ===========================================================================
-- Ready to build
-- ===========================================================================
select set_config('request.jwt.claim.sub', :'staff', false);
select t99zz.ok(cardinality(public.web_project_readiness(:'proj')) = 9, 'design and eight readiness items are missing');
select t99zz.expect_error(format($$update public.web_projects set status = 'build', status_note = 'Starting the build now.' where id = %L$$, :'proj'), 'TEBOS_VALIDATION');

select set_config('request.jwt.claim.sub', :'owner', false);
insert into public.web_project_approvals (project_id, org_id, revision_id, kind) values (:'proj', :'org', :'rev1', 'design');
select set_config('request.jwt.claim.sub', :'staff', false);
select t99zz.expect_error(format($$insert into public.web_readiness_items (project_id, org_id, item, status, evidence) values (%L, %L, 'technical_access', 'waived', 'We will sort it out later')$$, :'proj', :'org'), '23514');
select t99zz.expect_error(format($$insert into public.web_readiness_items (project_id, org_id, item, status) values (%L, %L, 'technical_access', 'met')$$, :'proj', :'org'), '23514');
insert into public.web_readiness_items (project_id, org_id, item, status, evidence) values
  (:'proj', :'org', 'commercial_terms', 'met', 'First month paid; billing account active.'),
  (:'proj', :'org', 'intake_complete', 'met', 'Sections A to J of the intake are complete.'),
  (:'proj', :'org', 'assets', 'waived', 'No photography yet; the client accepts placeholders until they send theirs.'),
  (:'proj', :'org', 'technical_access', 'missing', null),
  (:'proj', :'org', 'dependencies', 'met', 'None beyond the TEBOS enquiry form.'),
  (:'proj', :'org', 'delivery_window', 'met', 'Five pages and one form: fits three business days.'),
  (:'proj', :'org', 'security_privacy', 'met', 'The form collects name, email and message for replies only; POPIA notice drafted.'),
  (:'proj', :'org', 'release_authority', 'met', 'The client organisation admin approves the release.');
select t99zz.ok(public.web_project_readiness(:'proj') = array['technical_access: not confirmed with evidence'], 'only access is missing');
select t99zz.expect_error(format($$update public.web_projects set status = 'build', status_note = 'Starting the build now.' where id = %L$$, :'proj'), 'TEBOS_VALIDATION');
update public.web_readiness_items set status = 'met', evidence = 'Repository and Vercel preview access confirmed.' where project_id = :'proj' and item = 'technical_access';
select t99zz.ok(cardinality(public.web_project_readiness(:'proj')) = 0, 'ready to build');

update public.web_projects set status = 'build', status_note = 'Ready: build starts today.' where id = :'proj';
select t99zz.ok((select deadline_on = tebos_private.add_business_days(tebos_private.sa_today(), 3) from public.web_projects where id = :'proj'),
  'the clock starts at build: three business days');
select t99zz.expect_error(format($$update public.web_projects set plan = 'growth' where id = %L$$, :'proj'), 'TEBOS_INPUT_FROZEN');
select t99zz.expect_error(format($$update public.web_projects set deadline_on = '2030-01-01' where id = %L$$, :'proj'), '42501');
reset role;
update public.web_projects set deadline_on = '2030-01-01' where id = :'proj';
select t99zz.ok((select deadline_on < '2030-01-01' from public.web_projects where id = :'proj'), 'the deadline can''t be moved by hand, even directly');
set role authenticated;
select set_config('request.jwt.claim.sub', :'staff', false);

-- the client blocks: the clock pauses, and resumes later
update public.web_projects set status = 'blocked_client', status_note = 'Waiting for the client''s logo files.' where id = :'proj';
select t99zz.ok((select clock_paused_on = tebos_private.sa_today() from public.web_projects where id = :'proj'), 'the clock pauses');
update public.web_projects set status = 'build', status_note = 'Logo received; building again.' where id = :'proj';
select t99zz.ok((select clock_paused_on is null from public.web_projects where id = :'proj'), 'the clock resumes');

-- ===========================================================================
-- QA and release
-- ===========================================================================
select t99zz.expect_error(format($$insert into public.web_qa_runs (project_id, org_id, revision_id, verdict, critical_open, checked, evidence)
  values (%L, %L, %L, 'pass', 0, '{pages}', 'All pages checked on desktop and mobile.')$$, :'proj', :'org', :'rev1'), 'TEBOS_VALIDATION');
update public.web_projects set status = 'qa', status_note = 'Build finished; handed to QA.' where id = :'proj';
select t99zz.expect_error(format($$update public.web_projects set status = 'client_review', status_note = 'Skipping QA results.' where id = %L$$, :'proj'), 'TEBOS_VALIDATION');
select t99zz.expect_error(format($$insert into public.web_qa_runs (project_id, org_id, revision_id, verdict, critical_open, checked, evidence)
  values (%L, %L, %L, 'pass', 1, '{pages}', 'A pass with a critical defect open.')$$, :'proj', :'org', :'rev1'), '23514');
insert into public.web_qa_runs (project_id, org_id, revision_id, verdict, critical_open, checked, evidence)
  values (:'proj', :'org', :'rev1', 'fail', 1, '{pages,forms,mobile}', 'The enquiry form shows "sent" when saving fails.') returning id as qa1 \gset
select t99zz.expect_error(format($$update public.web_projects set status = 'client_review', status_note = 'QA has run, moving on.' where id = %L$$, :'proj'), 'TEBOS_VALIDATION');
reset role;
select t99zz.expect_error(format($$update public.web_qa_runs set verdict = 'pass', critical_open = 0 where id = %L$$, :'qa1'), 'TEBOS_INPUT_FROZEN');
set role authenticated;
select set_config('request.jwt.claim.sub', :'staff', false);
update public.web_projects set status = 'qa_failed', status_note = 'Critical: false success on the form.' where id = :'proj';
update public.web_projects set status = 'build', status_note = 'Fixing the form''s failure state.' where id = :'proj';
update public.web_projects set status = 'qa', status_note = 'Fix done; QA again.' where id = :'proj';
insert into public.web_qa_runs (project_id, org_id, revision_id, verdict, critical_open, checked, evidence, tested_url)
  values (:'proj', :'org', :'rev1', 'pass', 0, '{pages,forms,mobile,keyboard}', 'Form failure now shows an error; all criteria pass.', 'https://preview.example/client-99zz');
update public.web_projects set status = 'client_review', status_note = 'QA passed; preview sent to the client.' where id = :'proj';
select t99zz.expect_error(format($$update public.web_projects set status = 'release', status_note = 'Releasing without approval.' where id = %L$$, :'proj'), 'TEBOS_VALIDATION');

select set_config('request.jwt.claim.sub', :'owner', false);
insert into public.web_project_approvals (project_id, org_id, revision_id, kind, note) values (:'proj', :'org', :'rev1', 'release', 'Go live.');
select t99zz.ok((select count(*) = 2 from public.web_qa_runs), 'the client reads QA verdicts on their project');
select set_config('request.jwt.claim.sub', :'staff', false);
update public.web_projects set status = 'release', status_note = 'Client approved the release.' where id = :'proj';
-- handover needs the site live in production (milestone 2, web_delivery_ledger)
insert into public.web_deployments (project_id, org_id, environment, url, commit_ref, outcome, checked)
  values (:'proj', :'org', 'production', 'https://client-99zz.example', '1de4b0b', 'live', 'Home and the enquiry form load on the live domain.');
update public.web_projects set status = 'handover', status_note = 'Live; handover pack sent.' where id = :'proj';
update public.web_projects set status = 'closed', status_note = 'Handover accepted by the client.' where id = :'proj';
select t99zz.expect_error(format($$update public.web_projects set status = 'build', status_note = 'Reopening a closed project.' where id = %L$$, :'proj'), 'TEBOS_ILLEGAL_TRANSITION');

-- nothing is deleted
select t99zz.expect_error(format($$delete from public.web_projects where id = %L$$, :'proj'), '42501');

reset role;
select t99zz.ok((select count(*) >= 15 from public.audit_events where entity_type = 'web_projects'), 'every change is on the audit trail');
select t99zz.ok(tebos_private.add_business_days('2026-10-30', 3) = '2026-11-04', 'business days skip the weekend');
select t99zz.ok(tebos_private.business_days_between('2026-11-02', '2026-11-09') = 5, 'paused business days are counted');
drop schema t99zz cascade;
