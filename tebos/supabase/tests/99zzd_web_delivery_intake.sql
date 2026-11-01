-- Web delivery, milestone 4: the client writes and submits their own brief; a submitted brief is fixed until a
-- maintainer reopens it with a reason; an incomplete brief or one with personal details or secrets is refused;
-- the work queue shows maintainers every client's open requests, new briefs, due tasks and late projects, and nobody else.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99zzd;
grant usage on schema t99zzd to anon, authenticated;
create function t99zzd.expect_error(p_sql text, p_expect text) returns void
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
create function t99zzd.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t99zzd to anon, authenticated;

select '9faa0000-0000-0000-0000-00000000000a' as m1, '9faa0000-0000-0000-0000-00000000000b' as owner,
       '9faa0000-0000-0000-0000-00000000000c' as viewer, '9faa0000-0000-0000-0000-00000000000d' as other,
       '9faa0000-0000-0000-0000-0000000000c1' as org, '9faa0000-0000-0000-0000-0000000000c2' as org2 \gset
insert into auth.users (id, email, email_confirmed_at) values
  (:'m1', 'm1@t99zzd.test', now()), (:'owner', 'o@c99zzd.test', now()), (:'viewer', 'v@c99zzd.test', now()), (:'other', 'x@d99zzd.test', now());
insert into public.platform_staff (user_id, role) values (:'m1', 'maintainer');
insert into public.organisations (id, name, slug) values (:'org', 'Client 99zzd', 'client-99zzd'), (:'org2', 'Other 99zzd', 'other-99zzd');
insert into public.memberships (org_id, user_id, role) values (:'org', :'owner', 'org_admin'), (:'org', :'viewer', 'viewer'), (:'org2', :'other', 'org_admin');
select set_config('tebos.actor_type', 'agent', false), set_config('tebos.actor_id', 'web-intake:sql', false);
insert into public.enquiries (plan, name, business, email) values ('starter', 'O', 'Client 99zzd', 'o@c99zzd.test') returning id as enq \gset
insert into public.opportunities (enquiry_id, plan, contact_name, business, email, org_id, maintainer_id)
  values (:'enq', 'starter', 'O', 'Client 99zzd', 'o@c99zzd.test', :'org', :'m1') returning id as opp \gset
insert into public.billing_accounts (opportunity_id, org_id, plan, monthly_cents, anchor_day, next_invoice_on, status)
  values (:'opp', :'org', 'starter', 50000, 1, current_date, 'active');

set role authenticated;
select set_config('request.jwt.claim.sub', :'m1', false);
insert into public.web_projects (org_id, name, website_type, primary_objective, plan, status_note)
  values (:'org', 'Client 99zzd website', 'service_business', 'leads', 'starter', 'Opened; the brief is with the client.') returning id as proj \gset

-- ===========================================================================
-- The brief: the client's own
-- ===========================================================================
select t99zzd.expect_error(format($$insert into public.web_intakes (project_id, org_id) values (%L, %L)$$, :'proj', :'org'), '42501');
select set_config('request.jwt.claim.sub', :'viewer', false);
select t99zzd.expect_error(format($$insert into public.web_intakes (project_id, org_id) values (%L, %L)$$, :'proj', :'org'), '42501');
select set_config('request.jwt.claim.sub', :'owner', false);
insert into public.web_intakes (project_id, org_id, answers, status)
  values (:'proj', :'org', '{"business_name": "Client 99zzd"}', 'submitted') returning id as brief, status as first_status \gset
select t99zzd.ok(:'first_status' = 'draft', 'a brief starts as a draft');
select t99zzd.expect_error(format($$update public.web_intakes set status = 'submitted' where id = %L$$, :'brief'), 'TEBOS_VALIDATION');
select t99zzd.expect_error(format($$update public.web_intakes set answers = answers || '{"audience": "Call me on 082 555 1234 about it"}' where id = %L$$, :'brief'), '23514');
select t99zzd.expect_error(format($$update public.web_intakes set answers = answers || '{"likes": "api_key: sk_live_abcdefghijkl"}' where id = %L$$, :'brief'), '23514');
update public.web_intakes set answers = '{"business_name": "Client 99zzd", "audience": "Homeowners in Randburg needing a plumber today.",
  "first_action": "Request a call-out", "success_measure": "Ten call-outs a month", "pages": ["Home", "Services", "Contact"],
  "visual_direction": "minimal", "confirmations": {"rights": true, "privacy": false}}' where id = :'brief';
select t99zzd.ok((select tebos_private.web_intake_missing(answers) = array['confirm_privacy'] from public.web_intakes where id = :'brief'), 'only the privacy confirmation is missing');
select t99zzd.expect_error(format($$update public.web_intakes set status = 'submitted' where id = %L$$, :'brief'), 'TEBOS_VALIDATION');
update public.web_intakes set answers = jsonb_set(answers, '{confirmations,privacy}', 'true') where id = :'brief';
update public.web_intakes set status = 'submitted' where id = :'brief';
select t99zzd.ok((select submitted_by = :'owner' and submitted_at is not null from public.web_intakes where id = :'brief'), 'the database records who submitted it');
select t99zzd.expect_error(format($$update public.web_intakes set answers = answers || '{"likes": "Changed my mind"}' where id = %L$$, :'brief'), 'TEBOS_INPUT_FROZEN');
select t99zzd.expect_error(format($$delete from public.web_intakes where id = %L$$, :'brief'), '42501');

-- ===========================================================================
-- The work queue: maintainers see every client's work, oldest first; nobody else sees any of it
-- ===========================================================================
insert into public.change_requests (org_id, title, web_project_id) values (:'org', 'Add our new opening hours', :'proj');
select t99zzd.ok((select count(*) = 0 from public.web_work_queue()), 'a client sees no work queue');
select set_config('request.jwt.claim.sub', :'other', false);
select t99zzd.ok((select count(*) = 0 from public.web_intakes), 'another client reads no brief');
select set_config('request.jwt.claim.sub', :'m1', false);
select t99zzd.ok((select count(*) = 1 from public.web_work_queue() where kind = 'brief' and project_id = :'proj' and maintainer_id = :'m1'), 'the submitted brief waits for its scope');
select t99zzd.ok((select count(*) = 1 from public.web_work_queue() where kind = 'request' and title = 'Add our new opening hours'), 'the client''s request is in the queue');
insert into public.web_tasks (project_id, org_id, role, title, done_when, due_on)
  values (:'proj', :'org', 'intake', 'Call the client about the brief', 'The client confirmed the pages.', current_date - 1);
select t99zzd.ok((select count(*) = 1 from public.web_work_queue() where kind = 'task' and due_on < current_date), 'a late task is in the queue');

-- a maintainer can't write the client's brief, but reopens it with a reason
select t99zzd.expect_error(format($$update public.web_intakes set status = 'draft' where id = %L$$, :'brief'), 'TEBOS_INPUT_FROZEN');
update public.web_intakes set status = 'draft', reopen_reason = 'Please add the services you offer on weekends.' where id = :'brief';
select t99zzd.ok((select status = 'draft' and submitted_at is null from public.web_intakes where id = :'brief'), 'reopened for the client');
select t99zzd.expect_error(format($$update public.web_intakes set answers = '{}' where id = %L$$, :'brief'), 'TEBOS_PERMISSION_DENIED');
select t99zzd.ok((select count(*) = 0 from public.web_work_queue() where kind = 'brief'), 'a reopened brief leaves the queue');

reset role;
select t99zzd.ok((select count(*) >= 4 from public.audit_events where entity_type = 'web_intakes'), 'the brief is on the audit trail');
drop schema t99zzd cascade;
