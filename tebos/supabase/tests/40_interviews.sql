-- Diagnostic interview rules: consent before any call, only the server says a
-- call happened, transcripts are written once, and written answers become
-- labelled evidence.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t4;
grant usage on schema t4 to authenticated;
create function t4.expect_error(p_sql text, p_expect text) returns void
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
create function t4.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t4 to authenticated;

select '50000000-0000-0000-0000-00000000000a' as admin, '50000000-0000-0000-0000-00000000000b' as viewer,
       '50000000-0000-0000-0000-00000000000c' as outsider \gset
insert into auth.users (id, email, email_confirmed_at) values
  (:'admin', 'owner@agency.test', now()), (:'viewer', 'viewer@agency.test', now()), (:'outsider', 'x@else.test', now());

set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
select public.create_organisation('Interview test', 'interview-test') as org \gset
insert into public.memberships (org_id, user_id, role) values (:'org', :'viewer', 'viewer');
insert into public.businesses (org_id, name) values (:'org', 'Bright Agency') returning id as biz \gset

\set consent '''I agree to a call from TEBOS''''s AI interviewer and to it being recorded and transcribed.'''

-- ===========================================================================
-- Booking a call
-- ===========================================================================
select t4.expect_error(format('insert into public.interview_sessions (org_id, business_id, channel, playbook_key, playbook_version, status, phone_number, scheduled_for)
  values (%L, %L, %L, %L, 1, %L, %L, now() + interval %L)', :'org', :'biz', 'voice', 'marketing-agency', 'scheduled', '+27821234567', '1 day'),
  'TEBOS_CONSENT_REQUIRED');  -- no consent text at all
select t4.expect_error(format('insert into public.interview_sessions (org_id, business_id, channel, playbook_key, playbook_version, status, phone_number, scheduled_for, consent_text, consent_given_by, consent_given_at)
  values (%L, %L, %L, %L, 1, %L, %L, now() + interval %L, %L, %L, now())', :'org', :'biz', 'voice', 'marketing-agency', 'scheduled', '+27821234567', '1 day', 'ok', :'admin'),
  'TEBOS_CONSENT_REQUIRED');
select t4.expect_error(format('insert into public.interview_sessions (org_id, business_id, channel, playbook_key, playbook_version, status, phone_number, scheduled_for, consent_text, consent_given_by, consent_given_at)
  values (%L, %L, %L, %L, 1, %L, %L, now() + interval %L, %L, %L, now())', :'org', :'biz', 'voice', 'marketing-agency', 'scheduled', '082 123 4567', '1 day', :consent, :'admin'),
  '23514');  -- not E.164
select t4.expect_error(format('insert into public.interview_sessions (org_id, business_id, channel, playbook_key, playbook_version, status, phone_number, scheduled_for, consent_text, consent_given_by, consent_given_at)
  values (%L, %L, %L, %L, 1, %L, %L, now() + interval %L, %L, %L, now())', :'org', :'biz', 'voice', 'marketing-agency', 'scheduled', '+27821234567', '60 days', :consent, :'admin'),
  'TEBOS_VALIDATION');
select t4.expect_error(format('insert into public.interview_sessions (org_id, business_id, channel, playbook_key, playbook_version, status, phone_number, scheduled_for, consent_text, consent_given_by, consent_given_at)
  values (%L, %L, %L, %L, 1, %L, %L, now() + interval %L, %L, %L, now())', :'org', :'biz', 'voice', 'marketing-agency', 'completed', '+27821234567', '1 day', :consent, :'admin'),
  'TEBOS_ILLEGAL_TRANSITION');

insert into public.interview_sessions (org_id, business_id, channel, playbook_key, playbook_version, status, phone_number, scheduled_for,
                                       consent_text, consent_given_by, consent_given_at)
values (:'org', :'biz', 'voice', 'marketing-agency', 1, 'scheduled', '+27821234567', now() + interval '1 hour',
        :consent, :'outsider', now() - interval '1 year')
returning id as call \gset
select t4.ok((select consent_given_by = :'admin' and consent_given_at > now() - interval '1 minute' and requested_by = :'admin'
              from public.interview_sessions where id = :'call'), 'consent is recorded as the signed-in person''s, now');

-- a person can reschedule or cancel, but cannot say the call happened
update public.interview_sessions set scheduled_for = now() + interval '2 hours' where id = :'call';
select t4.expect_error(format('update public.interview_sessions set status = %L where id = %L', 'dialling', :'call'), 'TEBOS_SERVER_ONLY');
select t4.expect_error(format('update public.interview_sessions set transcript = %L where id = %L', '[{"role":"user","message":"all good"}]', :'call'), 'TEBOS_SERVER_ONLY');
select t4.expect_error(format('update public.interview_sessions set phone_number = %L where id = %L', '+27829999999', :'call'), 'TEBOS_SERVER_ONLY');

-- viewers read, but cannot book
select set_config('request.jwt.claim.sub', :'viewer', false);
select t4.ok((select count(*) from public.interview_sessions) = 1, 'viewer sees the booking');
select t4.expect_error(format('insert into public.interview_sessions (org_id, business_id, channel, playbook_key, playbook_version, status) values (%L, %L, %L, %L, 1, %L)',
  :'org', :'biz', 'form', 'marketing-agency', 'open'), '42501');
select set_config('request.jwt.claim.sub', :'outsider', false);
select t4.ok((select count(*) from public.interview_sessions) = 0, 'other organisations see nothing');

-- ===========================================================================
-- The server's path for a call, and a transcript written once
-- ===========================================================================
reset role;
select set_config('request.jwt.claim.sub', '', false), set_config('tebos.actor_type', 'agent', false), set_config('tebos.actor_id', 'interview-worker:test', false);
update public.interview_sessions set status = 'dialling', provider = 'elevenlabs', provider_reference = 'conv_1', started_at = now() where id = :'call';
update public.interview_sessions set status = 'in_progress' where id = :'call';
update public.interview_sessions set status = 'completed', ended_at = now(), duration_seconds = 900,
  transcript = '[{"role":"agent","message":"Hi, I''m TEBOS''s AI interviewer.","time_in_call_secs":0},{"role":"user","message":"We have six retainer clients.","time_in_call_secs":12}]'
  where id = :'call';
select t4.expect_error(format('update public.interview_sessions set transcript = %L where id = %L', '[]', :'call'), 'TEBOS_EVIDENCE_IMMUTABLE');
select t4.ok((select count(*) from public.audit_events where entity_id = :'call' and actor_type = 'agent') >= 3, 'the call''s progress is audited as the worker');
select set_config('tebos.actor_type', '', false), set_config('tebos.actor_id', '', false);

-- a missed call must say why
insert into public.interview_sessions (org_id, business_id, channel, playbook_key, playbook_version, status, phone_number, scheduled_for,
                                       consent_text, consent_given_by, consent_given_at)
values (:'org', :'biz', 'voice', 'marketing-agency', 1, 'scheduled', '+27821234567', now(), :consent, :'admin', now())
returning id as missed \gset
update public.interview_sessions set status = 'dialling' where id = :'missed';
select t4.expect_error(format('update public.interview_sessions set status = %L where id = %L', 'no_answer', :'missed'), '23514');
update public.interview_sessions set status = 'no_answer', failure_detail = 'Nobody answered' where id = :'missed';

-- ===========================================================================
-- Written answers
-- ===========================================================================
set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
insert into public.interview_sessions (org_id, business_id, channel, playbook_key, playbook_version, status)
  values (:'org', :'biz', 'form', 'marketing-agency', 1, 'open') returning id as form \gset
select t4.expect_error(format('select public.submit_interview_answers(%L, %L)', :'form', '[]'), 'TEBOS_VALIDATION');
select t4.expect_error(format('select public.submit_interview_answers(%L, %L)', :'form', '[{"question_key":"Bad Key","question":"q","answer":"a"}]'), 'TEBOS_VALIDATION');
select t4.expect_error(format('select public.submit_interview_answers(%L, %L)', :'form', '[{"question_key":"clients.count","question":"How many clients?","answer":"  "}]'), 'TEBOS_VALIDATION');

select set_config('request.jwt.claim.sub', :'viewer', false);
select t4.expect_error(format('select public.submit_interview_answers(%L, %L)', :'form', '[{"question_key":"clients.count","question":"How many clients?","answer":"six"}]'), 'TEBOS_PERMISSION_DENIED');

select set_config('request.jwt.claim.sub', :'admin', false);
select public.submit_interview_answers(:'form', '[{"question_key":"clients.count","question":"How many active clients do you have?","answer":"Six on retainer, two projects"},
                                                  {"question_key":"pipeline.source","question":"Where do new clients come from?","answer":"Referrals mostly"},
                                                  {"question_key":"capacity.utilisation","question":"How busy is the team?","answer":""}]') as n \gset
select t4.ok(:n = 2, 'empty answers are skipped, not stored');
select t4.ok((select status = 'completed' and extraction_status = 'done' from public.interview_sessions where id = :'form'), 'the form is completed');
select t4.ok((select count(*) from public.evidence e join public.sources s on s.id = e.source_id
              where s.source_type = 'user_statement' and s.uri = 'interview:' || :'form' and e.state = 'user_supplied'
                and e.structured_value ->> 'channel' = 'form' and e.created_by_actor = 'user') = 2,
  'answers are the owner''s statements, labelled as such, citing the interview');
select t4.expect_error(format('select public.submit_interview_answers(%L, %L)', :'form', '[{"question_key":"clients.count","question":"q","answer":"again"}]'), 'TEBOS_ILLEGAL_TRANSITION');
