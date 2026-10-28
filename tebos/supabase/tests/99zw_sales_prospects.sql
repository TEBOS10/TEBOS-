-- The daily sales desk: staff only; every prospect has its source and reason; business details only; one record per
-- business; outcomes need a note; "do not contact" is final; today's calls are due ones, most promising first.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99zw;
grant usage on schema t99zw to anon, authenticated;
create function t99zw.expect_error(p_sql text, p_expect text) returns void
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
create function t99zw.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t99zw to anon, authenticated;

select '9fa40000-0000-0000-0000-00000000000a' as rep, '9fa40000-0000-0000-0000-00000000000b' as client,
       '9fa40000-0000-0000-0000-0000000000b1' as client_org \gset
insert into auth.users (id, email, email_confirmed_at) values (:'rep', 'rep@s99zw.test', now()), (:'client', 'c@c99zw.test', now());
insert into public.platform_staff (user_id, role) values (:'rep', 'sales');
insert into public.organisations (id, name, slug) values (:'client_org', 'Client 99zw', 'client-99zw');
insert into public.memberships (org_id, user_id, role) values (:'client_org', :'client', 'org_admin');

set role authenticated;
select set_config('request.jwt.claim.sub', :'rep', false);

-- a prospect needs where it was found and why it fits
insert into public.sales_prospects (business_name, industry, area, website, phone, source_url, why_fit, added_by)
values ('Rivonia Dental 99zw', 'Dental practice', 'Rivonia, Johannesburg', 'https://rivonia-dental.example', '011 234 5678',
        'https://directory.example/rivonia-dental', 'Bookings by phone only on its site; three dentists, no online booking or reminders.', 'reeds');
insert into public.sales_prospects (business_name, industry, area, source_url, why_fit)
values ('Sandton Tutors 99zw', 'Tutoring', 'Sandton', 'https://directory.example/sandton-tutors', 'Enrolments taken by a WhatsApp number; no class schedule online.');
insert into public.sales_prospects (business_name, industry, area, source_url, why_fit)
values ('Fourways Plumbing 99zw', 'Plumbing', 'Fourways', 'https://directory.example/fourways-plumbing', 'Call-outs booked by phone; reviews mention missed callbacks.');
select t99zw.expect_error($$insert into public.sales_prospects (business_name, industry, area, source_url, why_fit) values ('No Source 99zw', 'X', 'Y', 'http://insecure.example', 'Some reason that is long enough')$$, '23514');
select t99zw.expect_error($$insert into public.sales_prospects (business_name, industry, area, source_url, why_fit) values ('No Reason 99zw', 'XX', 'YY', 'https://ok.example', 'short')$$, '23514');
-- one record per business
select t99zw.expect_error($$insert into public.sales_prospects (business_name, industry, area, website, source_url, why_fit) values ('rivonia dental 99zw', 'Dental', 'Rivonia', 'https://rivonia-dental.example', 'https://x.example', 'A second copy of the same business.')$$, '23505');
-- business details only: no personal email in the free text
select t99zw.expect_error($$insert into public.sales_prospects (business_name, industry, area, source_url, why_fit) values ('Personal 99zw', 'XX', 'YY', 'https://ok.example', 'Owner is thandi.m@gmail.com, call her')$$, '23514');
-- a prospect starts new
select t99zw.expect_error($$insert into public.sales_prospects (business_name, industry, area, source_url, why_fit, status) values ('Jumped 99zw', 'XX', 'YY', 'https://ok.example', 'Starts already interested?', 'interested')$$, 'TEBOS_ILLEGAL_TRANSITION');

select id as dental from public.sales_prospects where business_name = 'Rivonia Dental 99zw' \gset
select id as tutors from public.sales_prospects where business_name = 'Sandton Tutors 99zw' \gset
select id as plumbing from public.sales_prospects where business_name = 'Fourways Plumbing 99zw' \gset

-- today's calls: all three are new and due
select t99zw.ok((select count(*) = 3 from public.sales_calls_today(10) where business_name like '%99zw'), 'three new prospects are due');

-- outcomes need a note
select t99zw.expect_error(format($$update public.sales_prospects set status = 'interested' where id = %L$$, :'dental'), '23514');
update public.sales_prospects set status = 'interested', last_outcome = 'Practice manager wants to see the booking flow.', next_call_on = tebos_private.sa_today() where id = :'dental';
update public.sales_prospects set status = 'no_answer', next_call_on = tebos_private.sa_today() + 2 where id = :'tutors';
-- the interested one comes first; the one called back later isn't due today
select t99zw.ok((select business_name = 'Rivonia Dental 99zw' from public.sales_calls_today(10) where business_name like '%99zw' limit 1), 'interest comes first');
select t99zw.ok((select count(*) = 0 from public.sales_calls_today(10) where id = :'tutors'), 'a call-back in two days is not due today');

-- becoming an enquiry needs the enquiry
select t99zw.expect_error(format($$update public.sales_prospects set status = 'became_enquiry' where id = %L$$, :'dental'), '23514');
reset role;
insert into public.enquiries (plan, name, business, email, message) values ('starter', 'Practice manager', 'Rivonia Dental 99zw', 'pm@rivonia-dental.example', 'From a call') returning id as enq \gset
set role authenticated;
select set_config('request.jwt.claim.sub', :'rep', false);
update public.sales_prospects set status = 'became_enquiry', enquiry_id = :'enq', next_call_on = null where id = :'dental';
select t99zw.ok((select count(*) = 0 from public.sales_calls_today(10) where id = :'dental'), 'an enquiry leaves the call list');

-- "do not contact" is final, and leaves the list
update public.sales_prospects set status = 'do_not_contact', next_call_on = null where id = :'plumbing';
select t99zw.expect_error(format($$update public.sales_prospects set status = 'interested', last_outcome = 'Changed their mind?' where id = %L$$, :'plumbing'), 'TEBOS_ILLEGAL_TRANSITION');
select t99zw.expect_error(format($$update public.sales_prospects set next_call_on = current_date where id = %L$$, :'plumbing'), '23514');
select t99zw.ok((select count(*) = 0 from public.sales_calls_today(10) where id = :'plumbing'), 'do-not-contact never appears');
-- staff can't rewrite where a prospect came from or why
select t99zw.expect_error(format($$update public.sales_prospects set source_url = 'https://other.example' where id = %L$$, :'tutors'), '42501');

-- a client sees nothing and can add nothing
select set_config('request.jwt.claim.sub', :'client', false);
select t99zw.ok((select count(*) = 0 from public.sales_prospects), 'a client sees no prospects');
select t99zw.ok((select count(*) = 0 from public.sales_calls_today(10)), 'a client gets no call list');
select t99zw.expect_error($$insert into public.sales_prospects (business_name, industry, area, source_url, why_fit) values ('Client Added 99zw', 'XX', 'YY', 'https://ok.example', 'A client tries to add a prospect.')$$, '42501');
set role anon;
select t99zw.expect_error($$select * from public.sales_calls_today(10)$$, '42501');

reset role;
select t99zw.ok((select count(*) >= 3 from public.audit_events where entity_type = 'sales_prospects'), 'the desk is on the audit trail');
drop schema t99zw cascade;
