-- Bookings: a business lists services and rates; anyone may request a time inside working hours, a day ahead, that
-- doesn't overlap; the team confirms once the deposit has arrived; the customer follows it by a private link; viewers
-- see the schedule without customers' details; bookings are never deleted.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99zzh;
grant usage on schema t99zzh to anon, authenticated;
create function t99zzh.expect_error(p_sql text, p_expect text) returns void
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
create function t99zzh.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t99zzh to anon, authenticated;

select '9fad0000-0000-0000-0000-00000000000a' as admin, '9fad0000-0000-0000-0000-00000000000b' as op,
       '9fad0000-0000-0000-0000-00000000000c' as viewer, '9fad0000-0000-0000-0000-00000000000d' as other,
       '9fad0000-0000-0000-0000-0000000000c1' as org, '9fad0000-0000-0000-0000-0000000000c2' as org2 \gset
insert into auth.users (id, email, email_confirmed_at) values
  (:'admin', 'a@b99zzh.test', now()), (:'op', 'o@b99zzh.test', now()), (:'viewer', 'v@b99zzh.test', now()), (:'other', 'x@b99zzh.test', now());
insert into public.organisations (id, name, slug) values (:'org', 'Studio 99zzh', 'studio-99zzh'), (:'org2', 'Other 99zzh', 'other-99zzh');
insert into public.memberships (org_id, user_id, role) values (:'org', :'admin', 'org_admin'), (:'org', :'op', 'operator'),
  (:'org', :'viewer', 'viewer'), (:'org2', :'other', 'org_admin');

set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
insert into public.booking_settings (org_id, public_name, contact_email, deposit_instructions, accepting)
  values (:'org', 'Studio 99zzh', 'bookings@studio99zzh.test', 'Pay the deposit by EFT; use your booking reference.', false);
insert into public.booking_services (org_id, key, name, cover_path, delivery_days, at_studio, sort)
  values (:'org', 'studio', 'Studio shoots', '/work/grape/studio.jpg', '[2,5)', true, 1) returning id as svc \gset
insert into public.booking_services (org_id, key, name, delivery_days, travel_min, travel_max, sort)
  values (:'org', 'events', 'Events', '[2,5)', 300, 400, 6) returning id as events \gset
insert into public.booking_packages (service_id, org_id, label, minutes, price_cents, sort)
  values (:'svc', :'org', '1 hour', 60, 260000, 1) returning id as hour \gset
insert into public.booking_packages (service_id, org_id, label, minutes, price_cents, sort)
  values (:'svc', :'org', '2 hours', 120, 340000, 2) returning id as two \gset
insert into public.booking_hours (org_id, weekday, opens, closes)
  select :'org', d, '08:00', '18:00' from generate_series(1, 7) d;
select t99zzh.expect_error(format($$insert into public.booking_hours (org_id, weekday, opens, closes) values (%L, 1, '09:00', '08:00')$$, :'org2'), '42501');
select set_config('request.jwt.claim.sub', :'op', false);
select t99zzh.expect_error(format($$insert into public.booking_services (org_id, key, name) values (%L, 'x', 'Sneaky')$$, :'org'), '42501');

-- times: a week out at 10:00 and 10:30 South African time, and tomorrow-minus-an-hour
select ((current_date + 7) + time '10:00') at time zone 'Africa/Johannesburg' as t10,
       ((current_date + 7) + time '10:30') at time zone 'Africa/Johannesburg' as t1030,
       ((current_date + 7) + time '17:30') at time zone 'Africa/Johannesburg' as t1730,
       ((current_date + 7) + time '06:00') at time zone 'Africa/Johannesburg' as t06,
       now() + interval '2 hours' as soon \gset

-- ===========================================================================
-- Requesting, from the public
-- ===========================================================================
set role anon;
select t99zzh.ok((public.booking_catalogue('studio-99zzh') ->> 'accepting')::boolean = false, 'the catalogue says it isn''t accepting yet');
select t99zzh.ok(jsonb_array_length(public.booking_catalogue('studio-99zzh') -> 'services') = 2, 'both services are listed');
select t99zzh.ok(jsonb_array_length(public.booking_catalogue('studio-99zzh') -> 'services' -> 0 -> 'packages') = 2, 'with their rates');
select t99zzh.expect_error(format($$select public.booking_request('studio-99zzh', %L, %L, %L, 60, 'Lerato', 'lerato@example.co.za', null, null, true)$$, :'svc', :'hour', :'t10'), 'TEBOS_VALIDATION');
reset role;
update public.booking_settings set accepting = true where org_id = :'org';
set role anon;
select t99zzh.expect_error('select * from public.bookings', '42501');
select t99zzh.expect_error(format($$select public.booking_request('studio-99zzh', %L, %L, %L, 60, 'Lerato', 'lerato@example.co.za', null, null, false)$$, :'svc', :'hour', :'t10'), 'TEBOS_VALIDATION');
select t99zzh.expect_error(format($$select public.booking_request('studio-99zzh', %L, %L, %L, 60, 'Lerato', 'lerato@example.co.za', null, null, true)$$, :'svc', :'hour', :'soon'), 'TEBOS_VALIDATION');
select t99zzh.expect_error(format($$select public.booking_request('studio-99zzh', %L, %L, %L, 60, 'Lerato', 'lerato@example.co.za', null, null, true)$$, :'svc', :'hour', :'t06'), 'TEBOS_VALIDATION');
select t99zzh.expect_error(format($$select public.booking_request('studio-99zzh', %L, %L, %L, 60, 'Lerato', 'lerato@example.co.za', null, null, true)$$, :'svc', :'hour', :'t1730'), 'TEBOS_VALIDATION');
select t99zzh.expect_error(format($$select public.booking_request('studio-99zzh', %L, null, %L, 120, 'Lerato', 'lerato@example.co.za', null, 'short', true)$$, :'events', :'t10'), 'TEBOS_VALIDATION');
select t99zzh.expect_error(format($$select public.booking_request('studio-99zzh', %L, %L, %L, 60, 'Lerato', 'not-an-email', null, null, true)$$, :'svc', :'hour', :'t10'), '23514');
select public.booking_request('studio-99zzh', :'svc', :'hour', :'t10', 999, 'Lerato M', 'Lerato@Example.co.za', '061 000 0000', null, true) as req \gset
select (:'req'::jsonb ->> 'token') as tok, (:'req'::jsonb ->> 'ref') as ref \gset
select t99zzh.ok(:'ref' like 'BK-%', 'a booking gets a reference');
-- the slot is taken now: overlapping is refused, the next free half hour is not offered
select t99zzh.expect_error(format($$select public.booking_request('studio-99zzh', %L, %L, %L, 60, 'Sipho', 'sipho@example.co.za', null, null, true)$$, :'svc', :'hour', :'t1030'), 'TEBOS_VALIDATION');
select t99zzh.ok(not exists (select 1 from public.booking_free_times('studio-99zzh', current_date + 7, 60) f where f.starts_at in (:'t10'::timestamptz, :'t1030'::timestamptz)), 'taken times aren''t offered');
select t99zzh.ok(exists (select 1 from public.booking_free_times('studio-99zzh', current_date + 7, 60) f where f.starts_at = :'t10'::timestamptz + interval '1 hour'), 'the next hour is');
-- the link shows the booking and the deposit, never anyone else's details
select t99zzh.ok((public.booking_for_token(:'tok') ->> 'status') = 'requested', 'the link shows the booking');
select t99zzh.ok((public.booking_for_token(:'tok') ->> 'deposit_cents')::int = 130000, 'the deposit is half');
select t99zzh.ok((public.booking_for_token(:'tok') ->> 'deposit_instructions') like 'Pay the deposit%', 'with how to pay it');
select t99zzh.ok(public.booking_for_token(:'tok')::text not like '%lerato%', 'the link carries no contact details');
select t99zzh.ok(public.booking_for_token('not-a-real-token') is null, 'a wrong link shows nothing');
-- a custom rate: a brief, no price yet
select public.booking_request('studio-99zzh', :'events', null, :'t10'::timestamptz + interval '1 day', 180, 'Thandi', 'thandi@example.co.za', null, 'A 30th birthday, about 40 guests.', true) as req2 \gset
select (:'req2'::jsonb ->> 'token') as tok2 \gset
select t99zzh.ok((public.booking_for_token(:'tok2') ->> 'price_cents') is null, 'a custom rate has no price until quoted');
select t99zzh.ok((public.booking_for_token(:'tok2') ->> 'deposit_instructions') is null, 'and no deposit is asked for yet');

-- ===========================================================================
-- The team
-- ===========================================================================
set role authenticated;
select set_config('request.jwt.claim.sub', :'op', false);
select id as bk from public.bookings where ref = :'ref' \gset
select t99zzh.ok((select customer_email = 'lerato@example.co.za' and price_cents = 260000 and ends_at = :'t10'::timestamptz + interval '1 hour' from public.bookings where id = :'bk'), 'the rate sets the length and the price');
select t99zzh.expect_error(format($$update public.bookings set status = 'confirmed', status_note = 'Deposit in.' where id = %L$$, :'bk'), 'TEBOS_VALIDATION');
select t99zzh.expect_error(format($$update public.bookings set price_cents = 100 where id = %L$$, :'bk'), 'TEBOS_INPUT_FROZEN');
select t99zzh.expect_error(format($$update public.bookings set customer_email = 'x@example.co.za' where id = %L$$, :'bk'), '42501');
select t99zzh.expect_error(format($$update public.bookings set status = 'completed', status_note = 'Done early.' where id = %L$$, :'bk'), 'TEBOS_ILLEGAL_TRANSITION');
update public.bookings set status = 'confirmed', status_note = 'Deposit received by EFT.', deposit_ref = 'EFT BK-1 1300', assignee_id = :'op' where id = :'bk';
select t99zzh.ok((select deposit_cents = 130000 from public.bookings where id = :'bk'), 'confirming records half as the deposit');
select t99zzh.ok((public.booking_for_token(:'tok') ->> 'deposit_paid')::boolean, 'the customer sees the deposit arrived');
select t99zzh.expect_error(format($$update public.bookings set status = 'completed', status_note = 'Shot it.' where id = %L$$, :'bk'), 'TEBOS_VALIDATION');
select t99zzh.expect_error(format($$delete from public.bookings where id = %L$$, :'bk'), '42501');
-- the custom request: quote, then confirm; moving it onto a taken time is refused
select id as bk2 from public.bookings where customer_email = 'thandi@example.co.za' \gset
select t99zzh.expect_error(format($$update public.bookings set starts_at = %L, ends_at = %L where id = %L$$, :'t10', :'t10'::timestamptz + interval '3 hours', :'bk2'), 'TEBOS_VALIDATION');
update public.bookings set price_cents = 450000 where id = :'bk2';
select t99zzh.expect_error(format($$update public.bookings set status = 'declined', status_note = 'Requested online.' where id = %L$$, :'bk2'), 'TEBOS_VALIDATION');
update public.bookings set status = 'declined', status_note = 'Fully booked that weekend.' where id = :'bk2';
select t99zzh.ok((public.booking_for_token(:'tok2') ->> 'status_note') = 'Fully booked that weekend.', 'a declined customer sees why');
-- time off closes the studio
insert into public.booking_time_off (org_id, starts_at, ends_at, reason) values (:'org', :'t10'::timestamptz + interval '2 days', :'t10'::timestamptz + interval '2 days 4 hours', 'Away at a wedding');
select t99zzh.ok(not exists (select 1 from public.booking_free_times('studio-99zzh', current_date + 9, 60) f where f.starts_at = :'t10'::timestamptz + interval '2 days'), 'time off isn''t offered');

-- ===========================================================================
-- The schedule: a viewer sees when, not who; outsiders see nothing
-- ===========================================================================
select t99zzh.ok((select count(*) = 2 from public.booking_schedule(:'org', current_date, 14) where kind = 'booking' or kind = 'time_off'), 'the team sees the booking and the time off, not the declined one');
select t99zzh.ok((select customer_name = 'Lerato M' from public.booking_schedule(:'org', current_date, 14) where kind = 'booking'), 'the team sees who');
select set_config('request.jwt.claim.sub', :'viewer', false);
select t99zzh.ok((select count(*) = 0 from public.bookings), 'a viewer can''t read the bookings table');
select t99zzh.ok((select customer_name is null from public.booking_schedule(:'org', current_date, 14) where kind = 'booking'), 'a viewer sees when, not who');
update public.bookings set status = 'cancelled', status_note = 'Viewer tries.' where id = :'bk';
select set_config('request.jwt.claim.sub', :'other', false);
select t99zzh.expect_error(format($$select * from public.booking_schedule(%L, current_date, 14)$$, :'org'), '42501');

reset role;
select t99zzh.ok((select status = 'confirmed' from public.bookings where id = :'bk'), 'a viewer''s attempt to cancel changes nothing');
select t99zzh.ok((select count(*) >= 4 from public.audit_events where entity_type = 'bookings'), 'bookings are on the audit trail');
drop schema t99zzh cascade;
