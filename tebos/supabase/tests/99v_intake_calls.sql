-- Intake calls in meetings: only staff start them, only with consent; the
-- prospect becomes a waiting-list enquiry owned by whoever met them; a call
-- moves forward only and is never "completed" without words; the answer comes
-- from the call or from staff, never invented, and never overwritten.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99v;
grant usage on schema t99v to anon, authenticated;
create function t99v.expect_error(p_sql text, p_expect text) returns void
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
create function t99v.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t99v to anon, authenticated;

select '9a000000-0000-0000-0000-00000000000a' as closer, '9a000000-0000-0000-0000-00000000000b' as outsider,
       '9a000000-0000-0000-0000-00000000000c' as busy \gset
insert into auth.users (id, email, email_confirmed_at) values
  (:'closer', 'closer@tebos.test', now()), (:'outsider', 'outsider@elsewhere.test', now()), (:'busy', 'busy@tebos.test', now());
insert into public.platform_staff (user_id, role) values (:'closer', 'sales'), (:'busy', 'sales');

\set consent '''Yes, TEBOS may call me now on this number for a short intake call.'''

-- ---------------------------------------------------------------------------
-- Who can start a call
-- ---------------------------------------------------------------------------
set role anon;
select t99v.expect_error(format('select public.start_meeting_call(%L,%L,%L,%L,%L,%L,%L)',
  'Lerato', 'Pulse Gym', 'lerato@pulse.test', '082 555 0101', null, '6-20', :consent), '42501');

set role authenticated;
select set_config('request.jwt.claim.sub', :'outsider', false);
select t99v.expect_error(format('select public.start_meeting_call(%L,%L,%L,%L,%L,%L,%L)',
  'Lerato', 'Pulse Gym', 'lerato@pulse.test', '082 555 0101', null, '6-20', :consent), 'TEBOS_PERMISSION_DENIED');

select set_config('request.jwt.claim.sub', :'closer', false);
select t99v.expect_error(format('select public.start_meeting_call(%L,%L,%L,%L,%L,%L,%L)',
  'Lerato', 'Pulse Gym', 'lerato@pulse.test', '555', null, '6-20', :consent), 'TEBOS_VALIDATION');
select t99v.expect_error(format('select public.start_meeting_call(%L,%L,%L,%L,%L,%L,%L)',
  'Lerato', 'Pulse Gym', 'lerato@pulse.test', '082 555 0101', null, '6-20', 'ok'), 'TEBOS_CONSENT_REQUIRED');
select t99v.expect_error(format('select public.start_meeting_call(%L,%L,%L,%L,%L,%L,%L)',
  'Lerato', 'Pulse Gym', 'lerato@pulse.test', '082 555 0101', null, 'lots', :consent), 'TEBOS_VALIDATION');

select public.start_meeting_call('Lerato', 'Pulse Gym', 'lerato@pulse.test', '082 555 0101', 'marketing-agency', '6-20', :consent) as call \gset
-- staff can't write calls directly, or run them
select t99v.expect_error(format('insert into public.intake_calls (enquiry_id, requested_by, phone_number, consent_text) select enquiry_id, %L, %L, %L from public.intake_calls limit 1',
  :'closer', '+27825550102', :consent), '42501');
select t99v.expect_error(format('update public.intake_calls set status = %L where id = %L', 'completed', :'call'), '42501');
select t99v.expect_error(format('update public.intake_calls set wants_to_proceed = true where id = %L', :'call'), 'TEBOS_ILLEGAL_TRANSITION');
select t99v.ok((select count(*) = 1 from public.intake_calls where id = :'call'), 'sales staff see the calls');
select set_config('request.jwt.claim.sub', :'outsider', false);
select t99v.ok((select count(*) = 0 from public.intake_calls), 'nobody else sees them');
reset role;

select t99v.ok((select c.status = 'requested' and c.phone_number = '+27825550101' and c.requested_by = :'closer'
                  and e.kind = 'waitlist' and e.source = 'sales' and e.added_by = :'closer' and e.plan = 'starter'
                  and e.industry = 'marketing-agency' and e.message like 'Team size: 6-20%'
                from public.intake_calls c join public.enquiries e on e.id = c.enquiry_id where c.id = :'call'),
  'the prospect is a waiting-list lead owned by whoever met them, with a full international number');

-- ---------------------------------------------------------------------------
-- The worker runs the call: forward only, never completed without words
-- ---------------------------------------------------------------------------
select t99v.expect_error(format('update public.intake_calls set status = %L, transcript = %L, ended_at = now() where id = %L',
  'completed', '[{"role":"user","message":"yes"}]', :'call'), 'TEBOS_ILLEGAL_TRANSITION');
update public.intake_calls set status = 'dialling', provider = 'voice', provider_reference = 'conv_1', started_at = now() where id = :'call';
select t99v.expect_error(format('update public.intake_calls set status = %L, ended_at = now() where id = %L', 'completed', :'call'), '23514');
select t99v.expect_error(format('update public.intake_calls set status = %L, transcript = %L, ended_at = now() where id = %L',
  'completed', '[]', :'call'), '23514');
select t99v.expect_error(format('update public.intake_calls set wants_to_proceed = true, outcome_source = %L where id = %L', 'call', :'call'), '23514');
select t99v.expect_error(format('update public.intake_calls set phone_number = %L where id = %L', '+27825550999', :'call'), 'TEBOS_EVIDENCE_IMMUTABLE');
update public.intake_calls set status = 'completed', ended_at = now(), duration_secs = 240,
  transcript = '[{"role":"agent","message":"Would you like to go ahead?"},{"role":"user","message":"Yes, let us do it."}]',
  wants_to_proceed = true, outcome_source = 'call', follow_up_due_at = now() + interval '1 day'
where id = :'call';
select t99v.expect_error(format('update public.intake_calls set transcript = %L where id = %L', '[{"role":"user","message":"No."}]', :'call'), 'TEBOS_EVIDENCE_IMMUTABLE');
select t99v.expect_error(format('update public.intake_calls set status = %L, failure_detail = %L where id = %L', 'failed', 'x', :'call'), 'TEBOS_ILLEGAL_TRANSITION');
select t99v.expect_error(format('update public.intake_calls set wants_to_proceed = false where id = %L', :'call'), 'TEBOS_EVIDENCE_IMMUTABLE');

set role authenticated;
select set_config('request.jwt.claim.sub', :'closer', false);
select t99v.expect_error(format('update public.intake_calls set wants_to_proceed = false where id = %L', :'call'), 'TEBOS_EVIDENCE_IMMUTABLE');
reset role;

-- When the call didn't capture an answer, staff record it, in their name
set role authenticated;
select set_config('request.jwt.claim.sub', :'closer', false);
select public.start_meeting_call('Sipho', 'Iron Works', 'sipho@iron.test', '+27 82 555 0103', null, '51-200', :consent) as call2 \gset
reset role;
select t99v.ok((select e.plan = 'company' and e.industry is null from public.intake_calls c join public.enquiries e on e.id = c.enquiry_id where c.id = :'call2'),
  'a larger company is a company-plan lead');
update public.intake_calls set status = 'dialling', provider_reference = 'conv_2', started_at = now() where id = :'call2';
update public.intake_calls set status = 'completed', ended_at = now(), transcript = '[{"role":"user","message":"Call me back."}]' where id = :'call2';
set role authenticated;
select set_config('request.jwt.claim.sub', :'closer', false);
update public.intake_calls set wants_to_proceed = true, outcome_note = 'Said yes in the meeting.' where id = :'call2';
reset role;
select t99v.ok((select wants_to_proceed and outcome_source = 'staff' from public.intake_calls where id = :'call2'), 'staff record the answer as theirs');

select t99v.expect_error(format('delete from public.intake_calls where id = %L', :'call'), 'TEBOS_EVIDENCE_IMMUTABLE');

-- the next-day email is a client email
insert into public.outbox_emails (opportunity_id, kind, to_email, subject, body)
select o.id, 'intake_follow_up', 'lerato@pulse.test', 'What TEBOS would build for Pulse Gym', 'Outline'
from public.opportunities o limit 1;

-- ---------------------------------------------------------------------------
-- At most 20 calls an hour per staff member
-- ---------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', :'busy', false);
select count(public.start_meeting_call('P' || g, 'Biz ' || g, 'p' || g || '@biz.test', '+2782555' || lpad(g::text, 4, '0'), null, '1-5', :consent))
from generate_series(1, 20) g;
select t99v.expect_error(format('select public.start_meeting_call(%L,%L,%L,%L,%L,%L,%L)',
  'One', 'Too many', 'one@many.test', '+27825559999', null, '1-5', :consent), 'TEBOS_RATE_LIMITED');
reset role;
select t99v.ok((select count(*) >= 1 from public.audit_events where entity_type = 'intake_calls'), 'calls are audited');
