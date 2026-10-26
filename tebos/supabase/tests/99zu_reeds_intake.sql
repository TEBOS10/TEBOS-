-- REEDS executive intake: a source is captured once, its commitments keep their source, an unknown date stays
-- unknown, a disagreeing source becomes a conflict, done needs evidence, sync health can't be faked, and founder-
-- private records stay out of every client's reach (and clients out of each other's).
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99zu;
grant usage on schema t99zu to anon, authenticated;
create function t99zu.expect_error(p_sql text, p_expect text) returns void
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
create function t99zu.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t99zu to anon, authenticated;

select '9fa20000-0000-0000-0000-00000000000a' as owner, '9fa20000-0000-0000-0000-00000000000b' as client_a,
       '9fa20000-0000-0000-0000-00000000000c' as client_b,
       '9fa20000-0000-0000-0000-0000000000a1' as org_a, '9fa20000-0000-0000-0000-0000000000b1' as org_b \gset
insert into auth.users (id, email, email_confirmed_at) values
  (:'owner', 'owner@p99zu.test', now()), (:'client_a', 'a@c99zu.test', now()), (:'client_b', 'b@c99zu.test', now());
insert into public.organisations (id, name, slug) values (:'org_a', 'Client A 99zu', 'client-a-99zu'), (:'org_b', 'Client B 99zu', 'client-b-99zu');
insert into public.memberships (org_id, user_id, role) values (:'org_a', :'client_a', 'org_admin'), (:'org_b', :'client_b', 'org_admin');

set role authenticated;
select set_config('request.jwt.claim.sub', :'owner', false);
select set_config('request.jwt.claims', '{"aal":"aal2"}', false);
select public.create_private_organisation('REEDS 99zu', 'reeds-99zu') as org \gset

-- each source starts not connected; the owner can't claim a connection
insert into public.reeds_integrations (org_id, source_type) values (:'org', 'manual'), (:'org', 'email'), (:'org', 'whatsapp_export');
select t99zu.ok((select bool_and(state = 'not_connected' and last_success_at is null) from public.reeds_integrations where org_id = :'org'), 'sources start not connected');
select t99zu.expect_error(format($$update public.reeds_integrations set state = 'connected' where org_id = %L and source_type = 'email'$$, :'org'), '42501');
select t99zu.expect_error(format($$insert into public.reeds_integrations (org_id, source_type, state) values (%L, 'calendar', 'connected')$$, :'org'), '42501');

-- ===========================================================================
-- Capture: once, with its source; only real actions become commitments
-- ===========================================================================
select public.reeds_capture(:'org', 'email', 'msg-001@mail.test', 'https://mail.example/msg-001', now() - interval '1 hour',
  'Principal', 'Please send the FICA checklist for the Linden listing by Friday; also, the office is closed on Monday.',
  'commitment', 'agency',
  '[{"title":"Send the FICA checklist for the Linden listing","due_on":"2026-10-30","due_basis":"reported","next_action":"Draft the checklist email","priority":"high","priority_reason":"Principal asked"},
    {"title":"Confirm the valuation date with the owner"},
    {"kind":"decision","title":"Take the Saturday show day?","recommendation":"Yes, if the photographer is booked"}]'::jsonb) as r1 \gset
select t99zu.ok((:'r1'::jsonb ->> 'duplicate')::boolean = false and (:'r1'::jsonb ->> 'created')::int = 3, 'first capture creates its records');
select (:'r1'::jsonb ->> 'source_event_id') as ev1 \gset

-- the same email again: nothing new
select public.reeds_capture(:'org', 'email', 'msg-001@mail.test', 'https://mail.example/msg-001', now(), 'Principal', 'Different text, same message ID', 'commitment', 'agency',
  '[{"title":"Send the FICA checklist for the Linden listing","due_on":"2026-10-30"}]'::jsonb) as r2 \gset
select t99zu.ok((:'r2'::jsonb ->> 'duplicate')::boolean and (:'r2'::jsonb ->> 'source_event_id') = :'ev1', 'the same source is recognised');
select t99zu.ok((select count(*) = 1 from public.reeds_source_events where org_id = :'org'), 'one source event');
select t99zu.ok((select count(*) = 2 from public.reeds_commitments where org_id = :'org'), 'no duplicate commitments');
-- a manual note pasted twice (whitespace and case aside) is the same note
select public.reeds_capture(:'org', 'manual', null, null, now(), null, 'Call the  photographer about Saturday', 'commitment', 'agency', '[{"title":"Call the photographer"}]'::jsonb) as m1 \gset
select public.reeds_capture(:'org', 'manual', null, null, now(), null, 'call the photographer about saturday ', 'commitment', 'agency', '[{"title":"Call the photographer"}]'::jsonb) as m2 \gset
select t99zu.ok((:'m2'::jsonb ->> 'duplicate')::boolean, 'a repeated manual note is one record');

-- the source survives into the commitment
select t99zu.ok((select e.source_ref = 'msg-001@mail.test' and e.source_link = 'https://mail.example/msg-001'
                 from public.reeds_commitments c join public.reeds_source_events e on e.id = c.source_event_id
                 where c.title like 'Send the FICA%'), 'the commitment carries its source ID and link');
-- a missing date stays unknown; nothing is invented
select t99zu.ok((select due_on is null and due_basis = 'unknown' and status = 'captured' from public.reeds_commitments where title like 'Confirm the valuation%'),
  'no date given: the date is unknown, not guessed');
select t99zu.expect_error(format($$update public.reeds_commitments set due_basis = 'verified' where org_id = %L and title like 'Confirm the valuation%%'$$, :'org'), '23514');
select t99zu.ok((select count(*) = 1 from public.reeds_decisions where org_id = :'org' and status = 'open'), 'the decision is queued for the founder');

-- ===========================================================================
-- A later source disagrees: a conflict, not an overwrite
-- ===========================================================================
select public.reeds_capture(:'org', 'whatsapp_export', 'wa-2026-10-26-0915', null, now(), 'Principal', 'Actually Thursday for the FICA checklist please', 'commitment', 'agency',
  '[{"title":"Send the FICA checklist for the Linden listing","due_on":"2026-10-29"}]'::jsonb) as r3 \gset
select t99zu.ok((:'r3'::jsonb ->> 'conflicts')::int = 1, 'the disagreement is counted');
select t99zu.ok((select due_on = '2026-10-30' from public.reeds_commitments where title like 'Send the FICA%'), 'the recorded date is kept');
select t99zu.ok((select recorded_value = '2026-10-30' and reported_value = '2026-10-29' and resolution is null from public.reeds_conflicts where org_id = :'org'),
  'both dates are kept, unresolved, for the founder');

-- ===========================================================================
-- Done needs evidence; approval comes first where it is required
-- ===========================================================================
select id as fica from public.reeds_commitments where title like 'Send the FICA%' \gset
select t99zu.expect_error(format($$update public.reeds_commitments set status = 'done' where id = %L$$, :'fica'), 'TEBOS_EVIDENCE_REQUIRED');
select t99zu.expect_error(format($$update public.reeds_commitments set status = 'blocked' where id = %L$$, :'fica'), 'TEBOS_VALIDATION');
update public.reeds_commitments set approval = 'required', status = 'in_progress' where id = :'fica';
select t99zu.expect_error(format($$update public.reeds_commitments set status = 'done', completion_evidence = 'Drafted the email' where id = %L$$, :'fica'), 'TEBOS_APPROVAL_REQUIRED');
update public.reeds_commitments set approval = 'approved' where id = :'fica';
update public.reeds_commitments set status = 'done', completion_evidence = 'Sent 26 Oct 10:42, message ID msg-007 in Sent' where id = :'fica';
select t99zu.ok((select completed_by = :'owner' and completed_at is not null from public.reeds_commitments where id = :'fica'), 'done records who and when');
-- the server can't approve on the founder's behalf
reset role;
select set_config('request.jwt.claim.sub', '', false);
select t99zu.expect_error(format($$update public.reeds_commitments set approval = 'approved' where org_id = %L and title like 'Confirm the valuation%%'$$, :'org'), 'TEBOS_PERMISSION_DENIED');
select t99zu.expect_error(format($$update public.reeds_decisions set status = 'decided', decision = 'Yes' where org_id = %L$$, :'org'), 'TEBOS_PERMISSION_DENIED');

-- ===========================================================================
-- Sync health: a failure is shown, a success is only what really happened
-- ===========================================================================
select public.reeds_report_sync(:'org', 'email', false, 'Mailbox not authorised (401)');
select t99zu.ok((select state = 'failing' and last_error like 'Mailbox not authorised%' and last_success_at is null from public.reeds_integrations where org_id = :'org' and source_type = 'email'),
  'a failed sync is visible, with its error, and no success is claimed');
select public.reeds_report_sync(:'org', 'email', true);
select t99zu.ok((select state = 'connected' and last_success_at is not null from public.reeds_integrations where org_id = :'org' and source_type = 'email'), 'a real success is recorded');
select t99zu.ok((select duplicates >= 1 from public.reeds_integrations where org_id = :'org' and source_type = 'email'), 'suppressed duplicates are counted');
set role authenticated;
select set_config('request.jwt.claim.sub', :'owner', false);
select t99zu.expect_error(format($$select public.reeds_report_sync(%L, 'email', true)$$, :'org'), '42501');

-- a source record is kept as it arrived; secrets are refused
select t99zu.expect_error(format($$update public.reeds_source_events set summary = 'rewritten' where id = %L$$, :'ev1'), '42501');
select t99zu.expect_error(format($$select public.reeds_capture(%L, 'manual', null, null, now(), null, 'our password: hunter22', 'information', 'personal')$$, :'org'), 'TEBOS_SECRET_REFUSED');

-- ===========================================================================
-- Isolation: founder-private records, and two clients
-- ===========================================================================
select set_config('request.jwt.claims', '{"aal":"aal1"}', false);
select t99zu.ok((select count(*) = 0 from public.reeds_commitments), 'without two-step sign-in, nothing is visible');
select set_config('request.jwt.claims', '{"aal":"aal2"}', false);

select set_config('request.jwt.claim.sub', :'client_a', false);
insert into public.client_messages (org_id, body) values (:'org_a', 'Client A asks about the gallery');
select t99zu.ok((select count(*) = 0 from public.reeds_source_events) and (select count(*) = 0 from public.reeds_commitments)
             and (select count(*) = 0 from public.reeds_decisions) and (select count(*) = 0 from public.reeds_integrations),
  'client A sees nothing of the founder''s intake');
select t99zu.expect_error(format($$select public.reeds_capture(%L, 'manual', null, null, now(), null, 'x', 'information', 'personal')$$, :'org'), '42501');
select t99zu.expect_error(format($$select public.reeds_capture(%L, 'manual', null, null, now(), null, 'x', 'information', 'personal')$$, :'org_a'), '42501');

select set_config('request.jwt.claim.sub', :'client_b', false);
insert into public.client_messages (org_id, body) values (:'org_b', 'Client B asks about invoices');
select t99zu.ok((select count(*) = 1 from public.client_messages where org_id in (:'org_a', :'org_b')), 'client B sees only its own messages');
select t99zu.ok((select count(*) = 0 from public.client_messages where org_id = :'org_a'), 'and none of client A''s');
select t99zu.ok((select count(*) = 0 from public.reeds_commitments), 'client B sees nothing of the founder''s intake');
select set_config('request.jwt.claim.sub', :'client_a', false);
select t99zu.ok((select count(*) = 0 from public.client_messages where org_id = :'org_b'), 'client A sees none of client B''s');

reset role;
select t99zu.ok((select count(*) > 0 from public.audit_events where entity_type = 'reeds_commitments'), 'the intake is on the (redacted) audit trail');
