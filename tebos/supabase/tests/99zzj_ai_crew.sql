-- AI crew: agents in teams and shifts draft the work; only an admin who is a person approves or rejects; a person marks
-- it sent after sending it; social work only for a shoot whose customer agreed to publishing. Publishing consent is
-- asked at intake and must be answered.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99zzj;
grant usage on schema t99zzj to anon, authenticated;
create function t99zzj.expect_error(p_sql text, p_expect text) returns void
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
create function t99zzj.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t99zzj to anon, authenticated;

select '9faf0000-0000-0000-0000-00000000000a' as admin, '9faf0000-0000-0000-0000-00000000000b' as op,
       '9faf0000-0000-0000-0000-00000000000c' as viewer, '9faf0000-0000-0000-0000-0000000000c1' as org \gset
insert into auth.users (id, email, email_confirmed_at) values (:'admin', 'a@d99zzj.test', now()), (:'op', 'o@d99zzj.test', now()), (:'viewer', 'v@d99zzj.test', now());
insert into public.organisations (id, name, slug) values (:'org', 'Studio 99zzj', 'studio-99zzj');
insert into public.memberships (org_id, user_id, role) values (:'org', :'admin', 'org_admin'), (:'org', :'op', 'operator'), (:'org', :'viewer', 'viewer');

set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
insert into public.booking_settings (org_id, public_name, contact_email, deposit_instructions, accepting)
  values (:'org', 'Studio 99zzj', 'bookings@studio99zzj.test', 'Pay the deposit by EFT; use your booking reference.', true);
insert into public.booking_services (org_id, key, name, delivery_days, at_studio, sort)
  values (:'org', 'studio', 'Studio shoots', '[2,5)', true, 1) returning id as svc \gset
insert into public.booking_packages (service_id, org_id, label, minutes, price_cents, sort)
  values (:'svc', :'org', '1 hour', 60, 260000, 1) returning id as hour \gset
insert into public.booking_hours (org_id, weekday, opens, closes) select :'org', d, '08:00', '18:00' from generate_series(1, 7) d;

-- the crew: teams and shifts; names unique; only admins hire; agents are paused, never deleted
insert into public.ai_agents (org_id, name, team, shift) values
  (:'org', 'Bookings · day', 'bookings', 'day'), (:'org', 'Bookings · night', 'bookings', 'night'),
  (:'org', 'Admin · day', 'admin', 'day'), (:'org', 'Social · day', 'social', 'day');
select t99zzj.expect_error(format($$insert into public.ai_agents (org_id, name, team, shift) values (%L, 'Bookings · day', 'bookings', 'night')$$, :'org'), '23505');
select t99zzj.expect_error(format($$insert into public.ai_agents (org_id, name, team, shift) values (%L, 'Shooter', 'photography', 'day')$$, :'org'), '23514');
select t99zzj.expect_error(format($$insert into public.ai_agents (org_id, name, team, shift, instructions) values (%L, 'Leaky', 'admin', 'night', 'api key: x9f8a7b6c5d4e3')$$, :'org'), '23514');
-- on duty: exactly the agents of the shift it is now (three by day, one by night), whatever the time the test runs
select (case when extract(hour from now() at time zone 'Africa/Johannesburg') between 6 and 17 then 'day' else 'night' end) as shift_now \gset
select t99zzj.ok((select count(*) from public.ai_on_duty(:'org')) = (case when :'shift_now' = 'day' then 3 else 1 end)
  and not exists (select 1 from public.ai_on_duty(:'org') d where d.shift <> :'shift_now'), 'the shift on duty now is listed');
reset role;
select t99zzj.ok(tebos_private.ai_shift_at('2026-11-02 08:00+02') = 'day' and tebos_private.ai_shift_at('2026-11-02 18:00+02') = 'night'
  and tebos_private.ai_shift_at('2026-11-02 05:59+02') = 'night' and tebos_private.ai_shift_at('2026-11-02 17:59+02') = 'day', 'day is 06:00 to 18:00 SA time');
set role authenticated;
select t99zzj.expect_error(format($$delete from public.ai_agents where org_id = %L$$, :'org'), '42501');
select set_config('request.jwt.claim.sub', :'op', false);
select t99zzj.expect_error(format($$insert into public.ai_agents (org_id, name, team, shift) values (%L, 'Sneaky', 'admin', 'day')$$, :'org'), '42501');

-- intake: the publishing question must be answered
set role anon;
select t99zzj.expect_error(format($$select public.booking_request('studio-99zzj', %L, %L, %L, 60, 'Lerato', 'lerato@example.co.za', null, null, true, null)$$,
  :'svc', :'hour', ((current_date + 7) + time '10:00') at time zone 'Africa/Johannesburg'), 'TEBOS_VALIDATION');
select public.booking_request('studio-99zzj', :'svc', :'hour', ((current_date + 7) + time '10:00') at time zone 'Africa/Johannesburg', 60,
  'Lerato M', 'lerato@example.co.za', '061 000 0000', null, true, false) as req \gset
reset role;
select id as bk from public.bookings where customer_email = 'lerato@example.co.za' and org_id = :'org' \gset
select t99zzj.ok((select publish_consent = false and publish_consent_at is not null from public.bookings where id = :'bk'), 'the answer is recorded with its time');

-- a request queues a reply for the bookings team, with no contact details in the brief
select t99zzj.ok((select count(*) = 1 from public.ai_tasks where booking_id = :'bk' and kind = 'reply_enquiry' and team = 'bookings' and status = 'queued'), 'a request queues a reply');
select t99zzj.ok((select brief not like '%lerato@%' and brief not like '%061%' from public.ai_tasks where booking_id = :'bk'), 'the brief carries no contact details');
select id as task from public.ai_tasks where booking_id = :'bk' \gset

-- the worker drafts (as the service, no person): it must name the agent, from the right team
select id as bday from public.ai_agents where name = 'Bookings · day' and org_id = :'org' \gset
select id as social from public.ai_agents where name = 'Social · day' and org_id = :'org' \gset
select t99zzj.expect_error(format($$update public.ai_tasks set status = 'drafted', draft = 'Hi Lerato, thanks for booking.' where id = %L$$, :'task'), 'TEBOS_VALIDATION');
select t99zzj.expect_error(format($$update public.ai_tasks set status = 'drafted', draft = 'Hi Lerato, thanks for booking.', agent_id = %L where id = %L$$, :'social', :'task'), 'TEBOS_VALIDATION');
update public.ai_tasks set status = 'drafted', draft = 'Hi Lerato, thanks for your request for a studio shoot.', agent_id = :'bday' where id = :'task';
-- the worker can't approve its own draft
select t99zzj.expect_error(format($$update public.ai_tasks set status = 'approved' where id = %L$$, :'task'), '42501');

-- people: an operator edits the draft but can't approve; the admin approves; nobody edits it afterwards
set role authenticated;
select set_config('request.jwt.claim.sub', :'op', false);
update public.ai_tasks set draft = 'Hi Lerato, thanks for your request for a studio shoot next week.' where id = :'task';
select t99zzj.expect_error(format($$update public.ai_tasks set status = 'approved' where id = %L$$, :'task'), '42501');
select set_config('request.jwt.claim.sub', :'admin', false);
update public.ai_tasks set status = 'approved' where id = :'task';
select t99zzj.ok((select decided_by = :'admin'::uuid and decided_at is not null from public.ai_tasks where id = :'task'), 'the decision names the admin');
select t99zzj.expect_error(format($$update public.ai_tasks set draft = 'Changed after approval.' where id = %L$$, :'task'), 'TEBOS_INPUT_FROZEN');
-- sending is a person's act, recorded with how
select t99zzj.expect_error(format($$update public.ai_tasks set status = 'sent' where id = %L$$, :'task'), 'TEBOS_VALIDATION');
update public.ai_tasks set status = 'sent', sent_note = 'Sent from the bookings email to the customer.' where id = :'task';
select t99zzj.expect_error(format($$update public.ai_tasks set brief = 'Something else entirely.' where id = %L$$, :'task'), '42501');

-- social work needs the customer's yes: this customer said no
select t99zzj.expect_error(format($$insert into public.ai_tasks (org_id, team, kind, booking_id, brief) values (%L, 'social', 'caption', %L, 'Caption the shoot.')$$, :'org', :'bk'), 'TEBOS_VALIDATION');
select t99zzj.expect_error(format($$insert into public.ai_tasks (org_id, team, kind, booking_id, brief) values (%L, 'admin', 'caption', %L, 'Caption the shoot.')$$, :'org', :'bk'), 'TEBOS_VALIDATION');
-- a customer who said yes
set role anon;
select public.booking_request('studio-99zzj', :'svc', :'hour', ((current_date + 8) + time '10:00') at time zone 'Africa/Johannesburg', 60,
  'Sipho N', 'sipho@example.co.za', null, null, true, true) as req2 \gset
reset role;
select id as bk2 from public.bookings where customer_email = 'sipho@example.co.za' and org_id = :'org' \gset
set role authenticated;
select set_config('request.jwt.claim.sub', :'op', false);
insert into public.ai_tasks (org_id, team, kind, booking_id, brief) values (:'org', 'social', 'caption', :'bk2', 'Caption the studio shoot for Instagram.');
-- viewers see none of it
select set_config('request.jwt.claim.sub', :'viewer', false);
select t99zzj.ok((select count(*) = 0 from public.ai_tasks), 'a viewer can''t read the crew''s work');
reset role;
select t99zzj.ok((select count(*) >= 5 from public.audit_events where entity_type = 'ai_tasks'), 'the crew''s work is on the audit trail');
drop schema t99zzj cascade;
