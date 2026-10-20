-- The client channel: messages between a client and TEBOS, and change requests within the plan's monthly allowance.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99zq;
grant usage on schema t99zq to anon, authenticated;
create function t99zq.expect_error(p_sql text, p_expect text) returns void
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
create function t99zq.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t99zq to anon, authenticated;

select '9f9e0000-0000-0000-0000-00000000000a' as owner, '9f9e0000-0000-0000-0000-00000000000b' as viewer,
       '9f9e0000-0000-0000-0000-00000000000c' as outsider, '9f9e0000-0000-0000-0000-00000000000d' as maint,
       '9f9e0000-0000-0000-0000-00000000000e' as sales,
       '9f9e0000-0000-0000-0000-0000000000c1' as org, '9f9e0000-0000-0000-0000-0000000000c2' as unpaid \gset
insert into auth.users (id, email, email_confirmed_at) values
  (:'owner', 'owner@c99zq.test', now()), (:'viewer', 'v@c99zq.test', now()), (:'outsider', 'x@c99zq.test', now()),
  (:'maint', 'm@tebos99zq.test', now()), (:'sales', 's@tebos99zq.test', now());
insert into public.platform_staff (user_id, role) values (:'maint', 'maintainer'), (:'sales', 'sales');
insert into public.organisations (id, name, slug) values (:'org', 'Client 99zq', 'client-99zq'), (:'unpaid', 'Unpaid 99zq', 'unpaid-99zq');
insert into public.memberships (org_id, user_id, role) values
  (:'org', :'owner', 'org_admin'), (:'org', :'viewer', 'viewer'), (:'unpaid', :'owner', 'org_admin');

-- the client is on the Small plan (starter): 5 changes a month
select set_config('tebos.actor_type', 'agent', false), set_config('tebos.actor_id', 'channel:sql', false);
insert into public.enquiries (plan, name, business, email) values ('starter', 'O', 'Client 99zq', 'owner@c99zq.test') returning id as enq \gset
insert into public.opportunities (enquiry_id, plan, contact_name, business, email, org_id)
  values (:'enq', 'starter', 'O', 'Client 99zq', 'owner@c99zq.test', :'org') returning id as opp \gset
insert into public.billing_accounts (opportunity_id, org_id, plan, monthly_cents, anchor_day, next_invoice_on, status)
  values (:'opp', :'org', 'starter', 50000, 1, current_date, 'active');

-- the server writes only as TEBOS
insert into public.client_messages (org_id, from_tebos, body) values (:'org', true, 'Welcome to your TEBOS channel.');
select t99zq.expect_error(format($$insert into public.client_messages (org_id, body) values (%L, 'pretending')$$, :'org'), 'TEBOS_PERMISSION_DENIED');

set role authenticated;

-- ===========================================================================
-- Messages
-- ===========================================================================
select set_config('request.jwt.claim.sub', :'viewer', false);
insert into public.client_messages (org_id, body) values (:'org', 'Hello TEBOS, can we talk about the gallery?');
select t99zq.ok((select author_id = :'viewer' and not from_tebos from public.client_messages where body like 'Hello TEBOS%'), 'anyone in the organisation writes, as themselves');
select t99zq.expect_error(format($$insert into public.client_messages (org_id, from_tebos, body) values (%L, true, 'I am TEBOS')$$, :'org'), 'TEBOS_PERMISSION_DENIED');
select t99zq.expect_error(format($$insert into public.client_messages (org_id, body) values (%L, 'our password: hunter22')$$, :'org'), 'TEBOS_SECRET_REFUSED');
select t99zq.expect_error(format($$insert into public.client_messages (org_id, body) values (%L, '   ')$$, :'org'), '23514');
select t99zq.ok((select count(*) = 2 from public.client_messages where org_id = :'org'), 'the organisation reads its conversation');
select t99zq.expect_error(format($$update public.client_messages set body = 'changed' where org_id = %L$$, :'org'), '42501');
select t99zq.expect_error(format($$delete from public.client_messages where org_id = %L$$, :'org'), '42501');

select set_config('request.jwt.claim.sub', :'outsider', false);
select t99zq.ok((select count(*) = 0 from public.client_messages), 'an outsider sees nothing');
select t99zq.expect_error(format($$insert into public.client_messages (org_id, body) values (%L, 'hi')$$, :'org'), '42501');

select set_config('request.jwt.claim.sub', :'sales', false);
select t99zq.ok((select count(*) = 0 from public.client_messages), 'sales staff don''t read client conversations');

select set_config('request.jwt.claim.sub', :'maint', false);
select t99zq.ok((select count(*) = 2 from public.client_messages), 'a maintainer reads them');
insert into public.client_messages (org_id, from_tebos, body) values (:'org', true, 'Of course. Send it as a change request.');
select t99zq.ok((select author_id = :'maint' from public.client_messages where body like 'Of course%'), 'a maintainer answers as TEBOS, on the record');

-- ===========================================================================
-- Change requests and the allowance
-- ===========================================================================
select set_config('request.jwt.claim.sub', :'viewer', false);
select t99zq.expect_error(format($$insert into public.change_requests (org_id, title) values (%L, 'New photos')$$, :'org'), '42501');

select set_config('request.jwt.claim.sub', :'owner', false);
select t99zq.ok((select plan = 'starter' and allowance = 5 and used = 0 from public.change_allowance(:'org')), 'Small: 5 a month, none used');
select t99zq.expect_error(format($$insert into public.change_requests (org_id, title, units, status) values (%L, 'Huge', 9, 'done')$$, :'org'), '42501');
insert into public.change_requests (org_id, title, detail) values (:'org', 'New gallery photos', 'From the media library')
  returning id as r1 \gset
select t99zq.ok((select units = 1 and status = 'received' and requested_by = :'owner'
                   and period = date_trunc('month', now() at time zone 'Africa/Johannesburg')::date
                 from public.change_requests where id = :'r1'), 'a request starts received, costing 1, in this month');
select t99zq.expect_error(format($$insert into public.change_requests (org_id, title) values (%L, 'Use key sk_live_abcdefghijklmnop')$$, :'org'), 'TEBOS_SECRET_REFUSED');
insert into public.change_requests (org_id, title) values (:'org', 'Change the opening hours'), (:'org', 'Add a pricing page'),
  (:'org', 'New logo on the header');
insert into public.change_requests (org_id, title) values (:'org', 'Fix the contact form') returning id as r5 \gset
select t99zq.ok((select used = 5 from public.change_allowance(:'org')), 'five used');
select t99zq.expect_error(format($$insert into public.change_requests (org_id, title) values (%L, 'One more')$$, :'org'), 'TEBOS_OUT_OF_PLAN');

-- withdrawing one before work starts gives it back
update public.change_requests set status = 'cancelled' where id = :'r5';
select t99zq.ok((select used = 4 from public.change_allowance(:'org')), 'a cancelled request doesn''t count');
insert into public.change_requests (org_id, title) values (:'org', 'Fix the contact form, properly');

-- the client can't do TEBOS's part
select t99zq.expect_error(format($$update public.change_requests set status = 'in_progress' where id = %L$$, :'r1'), 'TEBOS_SERVER_ONLY');
select t99zq.expect_error(format($$update public.change_requests set units = 1, outcome_note = 'done by me' where id = %L$$, :'r1'), 'TEBOS_SERVER_ONLY');
select t99zq.expect_error(format($$update public.change_requests set title = 'Something bigger' where id = %L$$, :'r1'), '42501');
select t99zq.expect_error(format($$delete from public.change_requests where id = %L$$, :'r1'), '42501');

-- no plan, no change requests (messages still work)
select t99zq.ok((select plan is null and allowance = 0 from public.change_allowance(:'unpaid')), 'no active plan, no allowance');
select t99zq.expect_error(format($$insert into public.change_requests (org_id, title) values (%L, 'Anything')$$, :'unpaid'), 'TEBOS_OUT_OF_PLAN');
insert into public.client_messages (org_id, body) values (:'unpaid', 'How do we subscribe?');

select set_config('request.jwt.claim.sub', :'outsider', false);
select t99zq.ok((select count(*) = 0 from public.change_requests), 'an outsider sees no requests');
select t99zq.expect_error(format($$select * from public.change_allowance(%L)$$, :'org'), 'TEBOS_PERMISSION_DENIED');

-- TEBOS carries out the work and closes it with what was done
select set_config('request.jwt.claim.sub', :'maint', false);
select t99zq.expect_error(format($$update public.change_requests set units = 2 where id = %L$$, :'r1'), 'TEBOS_OUT_OF_PLAN');
update public.change_requests set status = 'in_progress' where id = :'r1';
select t99zq.expect_error(format($$update public.change_requests set units = 2 where id = %L$$, :'r1'), 'TEBOS_INPUT_FROZEN');
select t99zq.expect_error(format($$update public.change_requests set status = 'done' where id = %L$$, :'r1'), 'TEBOS_VALIDATION');
update public.change_requests set status = 'done', outcome_note = 'Six new photos on the gallery page.' where id = :'r1';
select t99zq.ok((select finished_at is not null from public.change_requests where id = :'r1'), 'a finished request records when');
select t99zq.expect_error(format($$update public.change_requests set status = 'in_progress' where id = %L$$, :'r1'), 'TEBOS_ILLEGAL_TRANSITION');
select t99zq.expect_error(format($$update public.change_requests set status = 'cancelled' where id = %L$$, :'r1'), 'TEBOS_ILLEGAL_TRANSITION');

reset role;
select set_config('tebos.actor_type', 'agent', false), set_config('tebos.actor_id', 'channel:sql', false);

-- private organisations have no channel
select '9f9e0000-0000-0000-0000-0000000000c3' as vault \gset
insert into public.organisations (id, name, slug, app) values (:'vault', 'Vault 99zq', 'vault-99zq', 'tepos');
select t99zq.expect_error(format($$insert into public.client_messages (org_id, from_tebos, body) values (%L, true, 'hi')$$, :'vault'), 'TEBOS_VALIDATION');

-- every message and request is on the audit trail
select t99zq.ok((select count(*) = 3 from public.audit_events where org_id = :'org' and entity_type = 'client_messages'), 'messages are audited');
select t99zq.ok((select count(*) >= 6 from public.audit_events where org_id = :'org' and entity_type = 'change_requests'), 'requests are audited');
