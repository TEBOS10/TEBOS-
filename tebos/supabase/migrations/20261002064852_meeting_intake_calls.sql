-- Intake calls: TEBOS phones a prospect the moment they ask, in a meeting.
--
-- After the film, the prospect types their number on the TEBOS staff member's
-- signed-in device and agrees to the call; TEBOS's voice agent rings them at
-- once for a short intake call (about five minutes): what takes their time,
-- and whether they want to go ahead. This is not the diagnostic, which stays
-- paid. The next day TEBOS emails an outline of what it would build and
-- confirms their place on the waiting list.
--
--   * Only TEBOS staff can start a call, through start_meeting_call, and only
--     with the prospect's consent word for word. Nobody on the public internet
--     can make TEBOS phone anyone. At most 20 calls an hour per staff member.
--   * The prospect becomes a waiting-list enquiry owned by whoever met them.
--   * A call moves forward only. It is "completed" only with the words that
--     were said; whether they want to go ahead is recorded only from the call
--     itself or by staff, never guessed.
--   * The phone number and consent can never be changed after the fact.

create table public.intake_calls (
  id                  uuid primary key default gen_random_uuid(),
  enquiry_id          uuid not null unique references public.enquiries (id),
  requested_by        uuid not null references auth.users (id),
  phone_number        text not null check (phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  consent_text        text not null check (length(btrim(consent_text)) between 20 and 2000),
  consent_given_at    timestamptz not null default now(),
  status              text not null default 'requested'
                      check (status in ('requested', 'dialling', 'in_progress', 'completed', 'no_answer', 'failed')),
  provider            text,
  provider_reference  text,
  started_at          timestamptz,
  ended_at            timestamptz,
  transcript          jsonb check (transcript is null or jsonb_typeof(transcript) = 'array'),
  duration_secs       integer check (duration_secs is null or duration_secs >= 0),
  wants_to_proceed    boolean,
  outcome_source      text check (outcome_source in ('call', 'staff')),
  outcome_note        text check (outcome_note is null or length(outcome_note) <= 1000),
  failure_detail      text check (failure_detail is null or length(failure_detail) <= 1000),
  follow_up_due_at    timestamptz,
  follow_up_queued_at timestamptz,
  checked_at          timestamptz,
  created_at          timestamptz not null default now(),
  check (status <> 'completed' or (transcript is not null and jsonb_array_length(transcript) > 0 and ended_at is not null)),
  check ((wants_to_proceed is null) = (outcome_source is null)),
  check (wants_to_proceed is null or status = 'completed'),
  check (status not in ('no_answer', 'failed') or failure_detail is not null),
  check (follow_up_queued_at is null or follow_up_due_at is not null)
);
create index intake_calls_open_idx on public.intake_calls (created_at) where status in ('requested', 'dialling', 'in_progress');
create index intake_calls_follow_up_idx on public.intake_calls (follow_up_due_at) where follow_up_queued_at is null and follow_up_due_at is not null;

create function tebos_private.guard_intake_call() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'intake calls are kept' using errcode = '42501', hint = 'TEBOS_EVIDENCE_IMMUTABLE';
  end if;

  if tg_op = 'INSERT' then
    if tebos_private.is_client() then
      raise exception 'start a call with start_meeting_call' using errcode = '42501', hint = 'TEBOS_SERVER_ONLY';
    end if;
    if new.status <> 'requested' or new.transcript is not null or new.wants_to_proceed is not null then
      raise exception 'a call starts as requested, with nothing said yet' using errcode = 'P0001', hint = 'TEBOS_ILLEGAL_TRANSITION';
    end if;
    return new;
  end if;

  -- what the prospect agreed to, and who asked, never change
  if (new.enquiry_id, new.requested_by, new.phone_number, new.consent_text, new.consent_given_at, new.created_at)
     is distinct from
     (old.enquiry_id, old.requested_by, old.phone_number, old.consent_text, old.consent_given_at, old.created_at) then
    raise exception 'the number and the consent of a call cannot change' using errcode = 'P0001', hint = 'TEBOS_EVIDENCE_IMMUTABLE';
  end if;

  if tebos_private.is_client() then
    -- staff record the prospect's answer only when the call didn't capture it
    if (new.status, new.provider, new.provider_reference, new.started_at, new.ended_at, new.transcript, new.duration_secs,
        new.failure_detail, new.follow_up_due_at, new.follow_up_queued_at, new.checked_at)
       is distinct from
       (old.status, old.provider, old.provider_reference, old.started_at, old.ended_at, old.transcript, old.duration_secs,
        old.failure_detail, old.follow_up_due_at, old.follow_up_queued_at, old.checked_at) then
      raise exception 'the call is run by TEBOS' using errcode = '42501', hint = 'TEBOS_SERVER_ONLY';
    end if;
    if new.wants_to_proceed is distinct from old.wants_to_proceed then
      if old.outcome_source = 'call' then
        raise exception 'the prospect said this on the call' using errcode = 'P0001', hint = 'TEBOS_EVIDENCE_IMMUTABLE';
      end if;
      if old.status <> 'completed' then
        raise exception 'record the answer after the call' using errcode = 'P0001', hint = 'TEBOS_ILLEGAL_TRANSITION';
      end if;
      new.outcome_source := case when new.wants_to_proceed is null then null else 'staff' end;
    else
      new.outcome_source := old.outcome_source;
    end if;
    return new;
  end if;

  -- the worker: forward only
  if new.status is distinct from old.status and not (
       (old.status = 'requested' and new.status in ('dialling', 'failed'))
    or (old.status = 'dialling' and new.status in ('in_progress', 'completed', 'no_answer', 'failed'))
    or (old.status = 'in_progress' and new.status in ('completed', 'no_answer', 'failed'))) then
    raise exception 'a call cannot go from % to %', old.status, new.status using errcode = 'P0001', hint = 'TEBOS_ILLEGAL_TRANSITION';
  end if;
  if old.transcript is not null and new.transcript is distinct from old.transcript then
    raise exception 'what was said on a call cannot change' using errcode = 'P0001', hint = 'TEBOS_EVIDENCE_IMMUTABLE';
  end if;
  if old.outcome_source is not null and (new.wants_to_proceed, new.outcome_source) is distinct from (old.wants_to_proceed, old.outcome_source) then
    raise exception 'the answer is already recorded' using errcode = 'P0001', hint = 'TEBOS_EVIDENCE_IMMUTABLE';
  end if;
  if old.follow_up_queued_at is not null and new.follow_up_queued_at is distinct from old.follow_up_queued_at then
    raise exception 'the follow-up is already queued' using errcode = 'P0001', hint = 'TEBOS_EVIDENCE_IMMUTABLE';
  end if;
  return new;
end $$;

create trigger guard before insert or update or delete on public.intake_calls
  for each row execute function tebos_private.guard_intake_call();
create trigger audit after insert or update or delete on public.intake_calls
  for each row execute function tebos_private.audit_row();

alter table public.intake_calls enable row level security;
revoke all on public.intake_calls from anon, authenticated;
create policy staff_read on public.intake_calls for select to authenticated
  using (tebos_private.is_staff(array['sales']));
create policy staff_answer on public.intake_calls for update to authenticated
  using (tebos_private.is_staff(array['sales'])) with check (tebos_private.is_staff(array['sales']));
grant select (id, enquiry_id, requested_by, phone_number, status, started_at, ended_at, transcript, duration_secs,
              wants_to_proceed, outcome_source, outcome_note, failure_detail, follow_up_due_at, follow_up_queued_at, created_at)
  on public.intake_calls to authenticated;
grant update (wants_to_proceed, outcome_note) on public.intake_calls to authenticated;
grant all on public.intake_calls to service_role;

-- The one way to start a call. Runs as its owner so it can write the enquiry
-- and the call together; who may call it is checked here.
create function public.start_meeting_call(
  p_name text, p_business text, p_email text, p_phone text,
  p_industry text, p_size text, p_consent text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_enquiry uuid;
  v_call uuid;
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[\s()-]', '', 'g');
begin
  if auth.uid() is null or not tebos_private.is_staff(array['sales']) then
    raise exception 'only TEBOS staff can start a call' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
  end if;
  -- a local South African number becomes +27
  if v_phone ~ '^0[1-9][0-9]{8}$' then
    v_phone := '+27' || substr(v_phone, 2);
  end if;
  if v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'that phone number is not complete' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  if p_consent is null or length(btrim(p_consent)) < 20 then
    raise exception 'a call needs the person''s consent, word for word' using errcode = 'P0001', hint = 'TEBOS_CONSENT_REQUIRED';
  end if;
  if p_size is null or p_size not in ('1-5', '6-20', '21-50', '51-200', '200+') then
    raise exception 'choose the size of the team' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  perform pg_advisory_xact_lock(hashtext('tebos_intake:' || auth.uid()::text));
  if (select count(*) from public.intake_calls where requested_by = auth.uid() and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'too many calls started in the last hour' using errcode = 'P0001', hint = 'TEBOS_RATE_LIMITED';
  end if;

  insert into public.enquiries (plan, name, business, email, phone, kind, industry, message)
  values (case when p_size in ('21-50', '51-200', '200+') then 'company' else 'starter' end,
          btrim(p_name), btrim(p_business), btrim(p_email), v_phone, 'waitlist', nullif(btrim(coalesce(p_industry, '')), ''),
          'Team size: ' || p_size || E'\nMet in person; asked for an intake call.')
  returning id into v_enquiry;

  insert into public.intake_calls (enquiry_id, requested_by, phone_number, consent_text)
  values (v_enquiry, auth.uid(), v_phone, btrim(p_consent))
  returning id into v_call;
  return v_call;
end $$;
revoke all on function public.start_meeting_call(text, text, text, text, text, text, text) from public, anon;
grant execute on function public.start_meeting_call(text, text, text, text, text, text, text) to authenticated;

-- The next-day email goes through the client outbox like every other email.
alter table public.outbox_emails drop constraint outbox_emails_kind_check,
  add constraint outbox_emails_kind_check check (kind in ('payment_link', 'contract', 'invitation', 'invoice',
    'invoice_reminder_1', 'invoice_reminder_2', 'intake_follow_up'));
