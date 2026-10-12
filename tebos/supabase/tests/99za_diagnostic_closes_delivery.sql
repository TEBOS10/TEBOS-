-- A client's completed diagnostic interview closes their "diagnostic"
-- delivery step, by itself, with a note of what happened. It closes only on a
-- real completion, only for that client, and records no person as closer.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99za;
grant usage on schema t99za to anon, authenticated;
create function t99za.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t99za to anon, authenticated;

select '9a2a0000-0000-0000-0000-00000000000a' as maint, '9a2a0000-0000-0000-0000-00000000000c' as owner,
       '9a2a0000-0000-0000-0000-0000000000c1' as org, '9a2a0000-0000-0000-0000-0000000000c2' as org2 \gset
insert into auth.users (id, email, email_confirmed_at) values
  (:'maint', 'm@tebos99za.test', now()), (:'owner', 'owner@client99za.test', now());
insert into public.platform_staff (user_id, role) values (:'maint', 'maintainer');
insert into public.organisations (id, name, slug) values (:'org', 'Client 99za', 'client-99za'), (:'org2', 'Other 99za', 'other-99za');
insert into public.memberships (org_id, user_id, role) values (:'org', :'owner', 'org_admin'), (:'org', :'maint', 'operator');

-- the server onboards two clients, each with a plan and an open written interview
select set_config('tebos.actor_type', 'agent', false), set_config('tebos.actor_id', 'pipeline-worker:sql', false);
insert into public.businesses (org_id, name) values (:'org', 'Client 99za') returning id as biz \gset
insert into public.businesses (org_id, name) values (:'org2', 'Other 99za') returning id as biz2 \gset
insert into public.enquiries (plan, name, business, email) values ('starter', 'O', 'Client 99za', 'owner@client99za.test') returning id as enq \gset
insert into public.enquiries (plan, name, business, email) values ('starter', 'P', 'Other 99za', 'p@other99za.test') returning id as enq2 \gset
insert into public.opportunities (enquiry_id, plan, contact_name, business, email, maintainer_id, org_id, business_id)
  values (:'enq', 'starter', 'O', 'Client 99za', 'owner@client99za.test', :'maint', :'org', :'biz') returning id as opp \gset
insert into public.opportunities (enquiry_id, plan, contact_name, business, email, maintainer_id, org_id, business_id)
  values (:'enq2', 'starter', 'P', 'Other 99za', 'p@other99za.test', :'maint', :'org2', :'biz2') returning id as opp2 \gset
insert into public.delivery_tasks (opportunity_id, org_id, key, position, title, done_means, due_at) values
  (:'opp', :'org', 'kickoff', 1, 'Kick-off call', 'Met the owner.', now() + interval '1 day'),
  (:'opp', :'org', 'diagnostic', 3, 'Diagnostic interview', 'Held the interview.', now() + interval '2 days'),
  (:'opp2', :'org2', 'diagnostic', 3, 'Diagnostic interview', 'Held the interview.', now() + interval '2 days');
insert into public.interview_sessions (org_id, business_id, channel, playbook_key, playbook_version, status)
  values (:'org', :'biz', 'form', 'small-business', 1, 'open') returning id as form \gset
insert into public.interview_sessions (org_id, business_id, channel, playbook_key, playbook_version, status)
  values (:'org2', :'biz2', 'form', 'small-business', 1, 'open') returning id as form2 \gset
select set_config('tebos.actor_type', '', false), set_config('tebos.actor_id', '', false);

-- the owner submits their written answers
set role authenticated;
select set_config('request.jwt.claim.sub', :'owner', false);
select public.submit_interview_answers(:'form', '[
  {"question_key":"owner.week","question":"Which jobs do only you do?","answer":"Quotes, payroll and every supplier order."},
  {"question_key":"money.invoicing","question":"How do invoices go out?","answer":"I send them on Fridays from a spreadsheet."},
  {"question_key":"numbers.goal","question":"The one result?","answer":""}
]'::jsonb);
reset role;

select t99za.ok((select status = 'done' and closed_by is null and closed_at is not null from public.delivery_tasks
                  where opportunity_id = :'opp' and key = 'diagnostic'), 'the diagnostic step closed itself, recording no person');
select t99za.ok((select note like 'The owner answered 2 questions of the written diagnostic interview on TEBOS (small-business@1)%'
                   from public.delivery_tasks where opportunity_id = :'opp' and key = 'diagnostic'), 'the note says what was really answered');
select t99za.ok((select status = 'open' from public.delivery_tasks where opportunity_id = :'opp' and key = 'kickoff'), 'other steps are untouched');
select t99za.ok((select status = 'open' from public.delivery_tasks where opportunity_id = :'opp2'), 'another client''s step is untouched');

-- cancelling an interview closes nothing
update public.interview_sessions set status = 'cancelled' where id = :'form2';
select t99za.ok((select status = 'open' from public.delivery_tasks where opportunity_id = :'opp2'), 'a cancelled interview closes nothing');

-- the closing is audited like any other
select t99za.ok((select count(*) >= 1 from public.audit_events where entity_type = 'delivery_tasks' and entity_id = (
  select id from public.delivery_tasks where opportunity_id = :'opp' and key = 'diagnostic')), 'closing the step is audited');
