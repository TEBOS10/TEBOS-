-- Diagnostic interviews (dossier §7/§14: what the owner knows that no public
-- source shows).
--
-- An interview asks the business's own people the questions of an industry
-- playbook, by phone (a voice agent calls at a booked time) or in writing.
-- Its answers become evidence labelled as the owner's statements: never
-- verified fact.
--
--   * a call is placed only with recorded consent, to a well-formed number, at
--     a booked time within the next 30 days;
--   * whether a call happened, its transcript, and the answers taken from it
--     are written only by TEBOS's server. A person can book, reschedule or
--     cancel a call, but can't say it took place;
--   * a transcript can't be changed once recorded;
--   * written answers are recorded through submit_interview_answers, which
--     writes the evidence and completes the interview in one step.

insert into public.state_transitions (machine, from_state, to_state) values
  ('interview', '(initial)', 'scheduled'),
  ('interview', '(initial)', 'open'),
  ('interview', 'scheduled', 'dialling'),
  ('interview', 'scheduled', 'cancelled'),
  ('interview', 'dialling', 'in_progress'),
  ('interview', 'dialling', 'no_answer'),
  ('interview', 'dialling', 'failed'),
  ('interview', 'in_progress', 'completed'),
  ('interview', 'in_progress', 'failed'),
  ('interview', 'open', 'completed'),
  ('interview', 'open', 'cancelled');

create table public.interview_sessions (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null,
  business_id        uuid not null,
  channel            text not null check (channel in ('voice', 'form')),
  playbook_key       text not null check (playbook_key ~ '^[a-z][a-z0-9_.-]*$'),
  playbook_version   integer not null check (playbook_version > 0),
  status             text not null,
  -- voice only: E.164, the time booked, and the consent given for the call
  phone_number       text check (phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  scheduled_for      timestamptz,
  consent_text       text check (consent_text is null or length(consent_text) between 20 and 2000),
  consent_given_by   uuid references auth.users (id),
  consent_given_at   timestamptz,
  requested_by       uuid references auth.users (id),
  -- written by the server
  provider           text,
  provider_reference text,
  started_at         timestamptz,
  ended_at           timestamptz,
  last_checked_at    timestamptz,     -- when the worker last asked the provider about this call
  duration_seconds   integer check (duration_seconds is null or duration_seconds >= 0),
  transcript         jsonb check (transcript is null or jsonb_typeof(transcript) = 'array'),
  extraction_status  text not null default 'pending' check (extraction_status in ('pending', 'done', 'failed', 'not_available')),
  extraction_detail  text,
  failure_detail     text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, org_id),
  unique (id, business_id),
  foreign key (business_id, org_id) references public.businesses (id, org_id) on delete cascade,
  check (channel <> 'voice' or (phone_number is not null and scheduled_for is not null and consent_text is not null
                                and consent_given_by is not null and consent_given_at is not null)),
  check (channel <> 'form' or (phone_number is null and scheduled_for is null)),
  check (status not in ('failed', 'no_answer') or failure_detail is not null)
);
create index interview_sessions_business_idx on public.interview_sessions (business_id, created_at desc);
create index interview_sessions_due_idx on public.interview_sessions (scheduled_for) where status = 'scheduled';
create unique index interview_sessions_provider_ref_idx on public.interview_sessions (provider, provider_reference)
  where provider_reference is not null;

create function tebos_private.guard_interview() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- a transcript is evidence of what was said: it is written once
  if tg_op = 'UPDATE' and old.transcript is not null and new.transcript is distinct from old.transcript then
    raise exception 'an interview transcript cannot be changed once recorded'
      using errcode = 'P0001', hint = 'TEBOS_EVIDENCE_IMMUTABLE';
  end if;

  if not tebos_private.is_client() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.requested_by := auth.uid();
    if new.provider is not null or new.provider_reference is not null or new.started_at is not null or new.ended_at is not null
       or new.last_checked_at is not null
       or new.duration_seconds is not null or new.transcript is not null or new.extraction_status <> 'pending'
       or new.failure_detail is not null then
      raise exception 'an interview starts without a call record; only TEBOS''s server records calls'
        using errcode = '42501', hint = 'TEBOS_SERVER_ONLY';
    end if;
    if new.channel = 'voice' then
      if new.consent_text is null or length(btrim(new.consent_text)) < 20 then
        raise exception 'a call can only be booked with the consent the person gave, word for word'
          using errcode = 'P0001', hint = 'TEBOS_CONSENT_REQUIRED';
      end if;
      -- consent is recorded as given by the signed-in person, now
      new.consent_given_by := auth.uid();
      new.consent_given_at := now();
      if new.scheduled_for < now() - interval '2 minutes' or new.scheduled_for > now() + interval '30 days' then
        raise exception 'a call must be booked for a time within the next 30 days'
          using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
      end if;
    end if;
    return new;
  end if;

  if (new.provider, new.provider_reference, new.started_at, new.ended_at, new.last_checked_at, new.duration_seconds, new.extraction_status,
      new.extraction_detail, new.failure_detail, new.phone_number, new.consent_text, new.consent_given_by,
      new.consent_given_at, new.requested_by, new.channel, new.playbook_key, new.playbook_version)
     is distinct from
     (old.provider, old.provider_reference, old.started_at, old.ended_at, old.last_checked_at, old.duration_seconds, old.extraction_status,
      old.extraction_detail, old.failure_detail, old.phone_number, old.consent_text, old.consent_given_by,
      old.consent_given_at, old.requested_by, old.channel, old.playbook_key, old.playbook_version)
     or new.transcript is distinct from old.transcript then
    raise exception 'only TEBOS''s server records a call and what was said in it'
      using errcode = '42501', hint = 'TEBOS_SERVER_ONLY';
  end if;
  if new.status is distinct from old.status and new.status <> 'cancelled' then
    raise exception 'an interview can be marked % only by TEBOS', new.status
      using errcode = '42501', hint = 'TEBOS_SERVER_ONLY';
  end if;
  if new.scheduled_for is distinct from old.scheduled_for then
    if old.status <> 'scheduled' then
      raise exception 'only a call that has not started can be rescheduled' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    if new.scheduled_for < now() - interval '2 minutes' or new.scheduled_for > now() + interval '30 days' then
      raise exception 'a call must be booked for a time within the next 30 days'
        using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
  end if;
  return new;
end $$;

create trigger enforce_state_machine before insert or update of status on public.interview_sessions
  for each row execute function tebos_private.guard_status('interview');
create trigger guard_interview before insert or update on public.interview_sessions
  for each row execute function tebos_private.guard_interview();
create trigger touch before update on public.interview_sessions
  for each row execute function tebos_private.touch_updated_at();
create trigger freeze_tenant_keys before update on public.interview_sessions
  for each row execute function tebos_private.freeze_tenant_keys();
create trigger audit after insert or update or delete on public.interview_sessions
  for each row execute function tebos_private.audit_row();

alter table public.interview_sessions enable row level security;
create policy member_read on public.interview_sessions for select to authenticated using (tebos_private.is_member(org_id));
create policy operator_insert on public.interview_sessions for insert to authenticated
  with check (tebos_private.has_role(org_id, array['org_admin', 'operator']));
create policy operator_update on public.interview_sessions for update to authenticated
  using (tebos_private.has_role(org_id, array['org_admin', 'operator']))
  with check (tebos_private.has_role(org_id, array['org_admin', 'operator']));
-- Supabase grants new tables to anon and authenticated by default: start from nothing
revoke all on public.interview_sessions from anon, authenticated;
grant select, insert, update on public.interview_sessions to authenticated;
grant all on public.interview_sessions to service_role;

-- Written answers: evidence and completion in one step. Answers are the
-- respondent's own statements, stored as user_supplied evidence that cites
-- the interview and the question it answers.
create function public.submit_interview_answers(p_session uuid, p_answers jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_s public.interview_sessions;
  v_source uuid;
  v_a jsonb;
  v_n integer := 0;
begin
  select * into v_s from public.interview_sessions where id = p_session for update;
  if v_s.id is null or not tebos_private.has_role(v_s.org_id, array['org_admin', 'operator']) then
    raise exception 'only an operator or admin of this organisation can submit these answers'
      using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
  end if;
  if v_s.channel <> 'form' or v_s.status <> 'open' then
    raise exception 'this interview is not open for written answers' using errcode = 'P0001', hint = 'TEBOS_ILLEGAL_TRANSITION';
  end if;
  if jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) = 0 or jsonb_array_length(p_answers) > 100 then
    raise exception 'answers must be a list of 1 to 100 items' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;

  insert into public.sources (org_id, business_id, source_type, uri, label, reliability)
  values (v_s.org_id, v_s.business_id, 'user_statement', 'interview:' || v_s.id, 'Diagnostic interview (written answers)', 0.6)
  on conflict (business_id, source_type, (coalesce(uri, ''))) do nothing;
  select id into v_source from public.sources
   where business_id = v_s.business_id and source_type = 'user_statement' and uri = 'interview:' || v_s.id;

  for v_a in select * from jsonb_array_elements(p_answers) loop
    if jsonb_typeof(v_a) <> 'object' or coalesce(v_a ->> 'question_key', '') !~ '^[a-z][a-z0-9_.-]{0,80}$'
       or length(coalesce(v_a ->> 'question', '')) not between 1 and 500
       or length(coalesce(v_a ->> 'answer', '')) > 4000 then
      raise exception 'each answer needs a question key, the question and at most 4000 characters'
        using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    continue when btrim(coalesce(v_a ->> 'answer', '')) = '';
    insert into public.evidence (org_id, business_id, source_id, state, fact, excerpt, structured_value,
                                 content_location, retrieved_at, extraction_status)
    values (v_s.org_id, v_s.business_id, v_source, 'user_supplied', btrim(v_a ->> 'answer'), btrim(v_a ->> 'answer'),
            jsonb_build_object('interview_id', v_s.id, 'question_key', v_a ->> 'question_key', 'question', v_a ->> 'question',
                               'channel', 'form', 'playbook', v_s.playbook_key || '@' || v_s.playbook_version),
            'question ' || (v_a ->> 'question_key'), now(), 'complete');
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then
    raise exception 'answer at least one question' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;

  update public.interview_sessions set status = 'completed', extraction_status = 'done', ended_at = now()
   where id = v_s.id;
  return v_n;
end $$;
revoke all on function public.submit_interview_answers(uuid, jsonb) from public, anon;
grant execute on function public.submit_interview_answers(uuid, jsonb) to authenticated;
