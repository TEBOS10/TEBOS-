\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99y;
grant usage on schema t99y to anon, authenticated;
create function t99y.expect_error(p_sql text, p_expect text) returns void
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
create function t99y.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t99y to anon, authenticated;

-- Marketing staff: draft content and read the marketing playbook; nothing else.
select '99b10000-0000-0000-0000-00000000000a' as boss, '99b10000-0000-0000-0000-00000000000b' as mkt,
       '99b10000-0000-0000-0000-00000000000c' as rep, '99b10000-0000-0000-0000-00000000000d' as client \gset
insert into auth.users (id, email, email_confirmed_at) values
  (:'boss', 'boss@mkt.test', now()), (:'mkt', 'mkt@mkt.test', now()), (:'rep', 'rep@mkt.test', now()), (:'client', 'client@mkt.test', now());
insert into public.platform_admins (user_id) values (:'boss');
insert into public.platform_staff (user_id, role) values (:'rep', 'sales');
select t99y.expect_error(format('insert into public.platform_staff (user_id, role) values (%L, %L)', :'mkt', 'finance'), '23514');

set role authenticated;
-- a platform admin invites marketing staff; the invitation gives the role only
select set_config('request.jwt.claim.sub', :'boss', false);
select public.create_staff_invitation('mkt@mkt.test', 'marketing') as token \gset
select set_config('request.jwt.claim.sub', :'mkt', false);
select public.accept_staff_invitation(:'token');
select t99y.ok((select count(*) = 1 from public.platform_staff where user_id = :'mkt' and role = 'marketing'), 'the marketer has the marketing role');
select t99y.ok(not exists (select 1 from public.memberships where user_id = :'mkt'), 'and no client organisation');

-- the marketing playbook, not the sales one
select t99y.ok((select count(*) >= 5 from public.sales_playbook where department = 'marketing'), 'marketing reads its playbook');
select t99y.ok(not exists (select 1 from public.sales_playbook where department = 'sales'), 'marketing does not read the sales playbook');
select t99y.ok(not exists (select 1 from public.sales_playbook where body ~ 'R[0-9]'), 'no prices typed into any playbook');
update public.sales_playbook set body = 'Say we tripled revenue' where department = 'marketing' and key = 'claims';
select t99y.ok((select body <> 'Say we tripled revenue' from public.sales_playbook where key = 'claims'), 'marketing cannot rewrite its playbook');

-- nothing about sales or clients
select t99y.ok((select count(*) = 0 from public.opportunities), 'no pipeline');
select t99y.expect_error('select * from public.enquiries', '42501');
select t99y.ok((select count(*) = 0 from public.organisations), 'no client organisations');
select t99y.ok((select count(*) = 0 from public.platform_staff where user_id <> :'mkt'), 'no other staff rows');
select t99y.expect_error(format('insert into public.platform_staff (user_id, role) values (%L, %L)', :'mkt', 'sales'), '42501');
select t99y.ok((select count(*) >= 3 from public.staff_directory()), 'sees colleagues'' names');

-- drafts content, but can't approve it
insert into public.content_drafts (channel, body) values ('linkedin', 'TEBOS maps how a business really runs.');
select id as d from public.content_drafts where author_id = :'mkt' \gset
update public.content_drafts set status = 'in_review' where id = :'d';
select t99y.expect_error(format('update public.content_drafts set status = %L where id = %L', 'approved', :'d'), 'TEBOS_NOT_APPROVER');

-- sales reads both playbooks
select set_config('request.jwt.claim.sub', :'rep', false);
select t99y.ok((select count(distinct department) = 2 from public.sales_playbook), 'sales reads both playbooks');
select t99y.ok((select count(*) = 1 from public.content_drafts where id = :'d'), 'sales sees marketing''s drafts');

-- the admin approves marketing's draft
select set_config('request.jwt.claim.sub', :'boss', false);
update public.content_drafts set status = 'approved' where id = :'d';
select t99y.ok((select status = 'approved' and reviewed_by = :'boss' from public.content_drafts where id = :'d'), 'admin approves');

-- a client account sees neither playbook
select set_config('request.jwt.claim.sub', :'client', false);
select t99y.ok((select count(*) = 0 from public.sales_playbook), 'a client sees no playbook');
reset role;

drop schema t99y cascade;
