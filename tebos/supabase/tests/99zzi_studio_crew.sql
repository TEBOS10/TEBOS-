-- Studio crew: a booking is confirmed only with someone on the team assigned; a shoot is done once its files are
-- backed up and releases are noted; the gallery reaches the customer only when delivered, and delivery needs the
-- balance paid. Records are facts: stamped once, never in the future, frozen once the booking closes.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99zzi;
grant usage on schema t99zzi to anon, authenticated;
create function t99zzi.expect_error(p_sql text, p_expect text) returns void
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
create function t99zzi.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t99zzi to anon, authenticated;

select '9fae0000-0000-0000-0000-00000000000a' as admin, '9fae0000-0000-0000-0000-00000000000b' as op,
       '9fae0000-0000-0000-0000-00000000000c' as viewer, '9fae0000-0000-0000-0000-00000000000d' as other,
       '9fae0000-0000-0000-0000-0000000000c1' as org \gset
insert into auth.users (id, email, email_confirmed_at) values
  (:'admin', 'a@c99zzi.test', now()), (:'op', 'o@c99zzi.test', now()), (:'viewer', 'v@c99zzi.test', now()), (:'other', 'x@c99zzi.test', now());
insert into public.organisations (id, name, slug) values (:'org', 'Studio 99zzi', 'studio-99zzi');
insert into public.memberships (org_id, user_id, role) values (:'org', :'admin', 'org_admin'), (:'org', :'op', 'operator'), (:'org', :'viewer', 'viewer');
insert into public.profiles (user_id, display_name) values (:'op', 'Second Photographer');

set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
insert into public.booking_settings (org_id, public_name, contact_email, deposit_instructions, accepting)
  values (:'org', 'Studio 99zzi', 'bookings@studio99zzi.test', 'Pay the deposit by EFT; use your booking reference.', true);
insert into public.booking_services (org_id, key, name, delivery_days, at_studio, sort)
  values (:'org', 'studio', 'Studio shoots', '[2,5)', true, 1) returning id as svc \gset
insert into public.booking_packages (service_id, org_id, label, minutes, price_cents, sort)
  values (:'svc', :'org', '1 hour', 60, 260000, 1) returning id as hour \gset
insert into public.booking_hours (org_id, weekday, opens, closes) select :'org', d, '08:00', '18:00' from generate_series(1, 7) d;

-- the crew list: admins and operators, with names; members only
select t99zzi.ok((select count(*) = 2 from public.booking_crew(:'org')), 'the crew is the admins and operators');
select t99zzi.ok(exists (select 1 from public.booking_crew(:'org') where display_name = 'Second Photographer'), 'with their names');
select set_config('request.jwt.claim.sub', :'other', false);
select t99zzi.expect_error(format($$select * from public.booking_crew(%L)$$, :'org'), '42501');

-- a requested booking a week out
set role anon;
select public.booking_request('studio-99zzi', :'svc', :'hour', ((current_date + 7) + time '10:00') at time zone 'Africa/Johannesburg', 60,
  'Lerato M', 'lerato@example.co.za', null, null, true, false) as req \gset
select (:'req'::jsonb ->> 'token') as tok \gset
set role authenticated;
select set_config('request.jwt.claim.sub', :'op', false);
select id as bk from public.bookings where customer_email = 'lerato@example.co.za' \gset

-- confirming needs someone assigned, and only someone on the team
select t99zzi.expect_error(format($$update public.bookings set status = 'confirmed', status_note = 'Deposit in by EFT.', deposit_ref = 'EFT 1300' where id = %L$$, :'bk'), 'TEBOS_VALIDATION');
select t99zzi.expect_error(format($$update public.bookings set assignee_id = %L where id = %L$$, :'viewer', :'bk'), 'TEBOS_VALIDATION');
select t99zzi.expect_error(format($$update public.bookings set assignee_id = %L where id = %L$$, :'other', :'bk'), 'TEBOS_VALIDATION');
update public.bookings set assignee_id = :'op' where id = :'bk';
update public.bookings set status = 'confirmed', status_note = 'Deposit in by EFT.', deposit_ref = 'EFT 1300' where id = :'bk';
-- the call sheet: recorded once, never in the future
select t99zzi.expect_error(format($$update public.bookings set call_sheet_at = now() + interval '1 day' where id = %L$$, :'bk'), 'TEBOS_VALIDATION');
update public.bookings set call_sheet_at = now() where id = :'bk';
select t99zzi.expect_error(format($$update public.bookings set call_sheet_at = now() - interval '1 hour' where id = %L$$, :'bk'), 'TEBOS_INPUT_FROZEN');
-- a backup can't be recorded before the shoot, nor a gallery
select t99zzi.expect_error(format($$update public.bookings set backed_up_at = now() where id = %L$$, :'bk'), 'TEBOS_VALIDATION');
select t99zzi.expect_error(format($$update public.bookings set gallery_url = 'https://gallery.example/x' where id = %L$$, :'bk'), 'TEBOS_VALIDATION');

-- a shoot that happened yesterday, confirmed and assigned (placed directly: the public can only book ahead)
reset role;
set session_replication_role = replica;
insert into public.bookings (id, org_id, service_id, package_id, starts_at, ends_at, status, status_note, customer_name, customer_email,
                             price_cents, deposit_cents, deposit_ref, token_hash, consent_at, assignee_id)
values ('9fae0000-0000-0000-0000-0000000000b2', :'org', :'svc', :'hour', now() - interval '26 hours', now() - interval '25 hours', 'confirmed',
        'Deposit in by EFT.', 'Sipho N', 'sipho@example.co.za', 260000, 130000, 'EFT 1300', tebos_private.hash_token('past-shoot-token'), now(), :'op');
set session_replication_role = origin;
set role authenticated;
select set_config('request.jwt.claim.sub', :'op', false);
select '9fae0000-0000-0000-0000-0000000000b2' as past \gset

-- done only once backed up and releases noted
select t99zzi.expect_error(format($$update public.bookings set status = 'completed', status_note = 'Shot, 400 frames.' where id = %L$$, :'past'), 'TEBOS_VALIDATION');
select t99zzi.expect_error(format($$update public.bookings set backed_up_at = now() - interval '2 days' where id = %L$$, :'past'), 'TEBOS_VALIDATION');
update public.bookings set backed_up_at = now() - interval '20 hours', releases_note = 'Model release signed by Sipho.' where id = :'past';
select t99zzi.expect_error(format($$update public.bookings set releases_note = 'Changed my mind.' where id = %L$$, :'past'), 'TEBOS_INPUT_FROZEN');
-- before the shoot is marked done, someone else may still take it over
update public.bookings set assignee_id = :'admin' where id = :'past';
update public.bookings set assignee_id = :'op' where id = :'past';
update public.bookings set status = 'completed', status_note = 'Shot, 400 frames.' where id = :'past';
select t99zzi.ok((public.booking_for_token('past-shoot-token') ->> 'balance_due')::boolean, 'the customer sees the balance is due');
-- the photographer is fixed once shot
select t99zzi.expect_error(format($$update public.bookings set assignee_id = %L where id = %L$$, :'admin', :'past'), 'TEBOS_INPUT_FROZEN');
-- delivered only with the gallery and the balance paid; the link is shown only then
select t99zzi.expect_error(format($$update public.bookings set gallery_url = 'http://gallery.example/x' where id = %L$$, :'past'), '23514');
update public.bookings set gallery_url = 'https://gallery.example/sipho' where id = :'past';
select t99zzi.ok((public.booking_for_token('past-shoot-token') ->> 'gallery_url') is null, 'the gallery isn''t shown before delivery');
select t99zzi.expect_error(format($$update public.bookings set status = 'delivered', status_note = 'Gallery sent.', delivered_note = 'Gallery link by email.' where id = %L$$, :'past'), 'TEBOS_VALIDATION');
update public.bookings set balance_ref = 'EFT balance 1300' where id = :'past';
update public.bookings set status = 'delivered', status_note = 'Gallery sent.', delivered_note = 'Gallery link by email.' where id = :'past';
select t99zzi.ok((public.booking_for_token('past-shoot-token') ->> 'gallery_url') = 'https://gallery.example/sipho', 'delivered: the customer has the gallery');
select t99zzi.ok(not (public.booking_for_token('past-shoot-token') ->> 'balance_due')::boolean, 'and owes nothing');
-- a closed booking's records stay as they are
select t99zzi.expect_error(format($$update public.bookings set gallery_url = 'https://gallery.example/other' where id = %L$$, :'past'), 'TEBOS_INPUT_FROZEN');
-- a viewer can't record anything (no error under RLS: nothing changes)
select set_config('request.jwt.claim.sub', :'viewer', false);
update public.bookings set assignee_id = null where id = :'bk';
reset role;
select t99zzi.ok((select assignee_id = :'op'::uuid from public.bookings where id = :'bk'), 'a viewer''s attempt to unassign changes nothing');
-- a new booking can't arrive with records already filled in
select t99zzi.expect_error(format($$insert into public.bookings (org_id, service_id, package_id, starts_at, ends_at, status_note, customer_name, customer_email, token_hash, consent_at, backed_up_at)
  values (%L, %L, %L, %L, %L, 'Requested online.', 'Fake', 'fake@example.co.za', 'x', now(), now())$$, :'org', :'svc', :'hour',
  ((current_date + 8) + time '10:00') at time zone 'Africa/Johannesburg', ((current_date + 8) + time '11:00') at time zone 'Africa/Johannesburg'), 'TEBOS_VALIDATION');
select t99zzi.ok((select count(*) >= 6 from public.audit_events where entity_type = 'bookings' and entity_id::text = :'past'), 'every record is on the audit trail');
drop schema t99zzi cascade;
