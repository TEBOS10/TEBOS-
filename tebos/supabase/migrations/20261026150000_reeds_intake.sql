-- REEDS executive intake (founder's executive-team build specification, 26 Oct 2026, §4–§6; first implementation
-- order, phase 1): the one loop that has to work before any more agents are added.
--
--   incoming information → source-linked record → commitment or decision → follow-up → evidence-backed completion
--   → founder briefing
--
-- Five records, all in the founder's private organisation, for the owner after two-step sign-in (as the rest of
-- TEPOS). The existing work ledger (work_requests / work_tasks) stays what it is: work REEDS plans and runs itself.
--   reeds_source_events   one record per thing that came in (a manual note, an email, a WhatsApp export, a calendar
--                         invitation, a document): where from, its own ID and link, when, a short summary (never the
--                         whole conversation), and a de-duplication key. The same source twice is one record.
--   reeds_commitments     an action someone must take, linked to its source: owner, date (or explicitly none), how
--                         the date is known, priority with its reason, next action, approval state. "Done" needs
--                         evidence; a draft is not a sent message and a proposal is not a booking.
--   reeds_decisions       a question only the founder answers: options, recommendation, evidence, latest date.
--   reeds_conflicts       when a later source disagrees with what is recorded, both are kept and the conflict is
--                         shown; nothing is silently overwritten.
--   reeds_integrations    each source's real connection state: not connected, connected, failing; last success,
--                         last failure and the error. Written only by the server; it never claims a sync that didn't
--                         happen.
--
-- Mirrored by src/domain/reeds-intake.ts.

insert into public.state_transitions (machine, from_state, to_state) values
  ('reeds_commitment', '(initial)', 'captured'),
  ('reeds_commitment', '(initial)', 'ready'),
  ('reeds_commitment', 'captured', 'ready'),
  ('reeds_commitment', 'captured', 'cancelled'),
  ('reeds_commitment', 'ready', 'in_progress'),
  ('reeds_commitment', 'ready', 'blocked'),
  ('reeds_commitment', 'ready', 'awaiting_approval'),
  ('reeds_commitment', 'ready', 'done'),
  ('reeds_commitment', 'ready', 'cancelled'),
  ('reeds_commitment', 'in_progress', 'blocked'),
  ('reeds_commitment', 'in_progress', 'awaiting_approval'),
  ('reeds_commitment', 'in_progress', 'review'),
  ('reeds_commitment', 'in_progress', 'done'),
  ('reeds_commitment', 'in_progress', 'cancelled'),
  ('reeds_commitment', 'blocked', 'ready'),
  ('reeds_commitment', 'blocked', 'in_progress'),
  ('reeds_commitment', 'blocked', 'cancelled'),
  ('reeds_commitment', 'awaiting_approval', 'ready'),
  ('reeds_commitment', 'awaiting_approval', 'in_progress'),
  ('reeds_commitment', 'awaiting_approval', 'cancelled'),
  ('reeds_commitment', 'review', 'in_progress'),
  ('reeds_commitment', 'review', 'done'),
  ('reeds_commitment', 'done', 'in_progress'),
  ('reeds_decision', '(initial)', 'open'),
  ('reeds_decision', 'open', 'decided'),
  ('reeds_decision', 'open', 'deferred'),
  ('reeds_decision', 'open', 'withdrawn'),
  ('reeds_decision', 'deferred', 'open'),
  ('reeds_decision', 'deferred', 'decided'),
  ('reeds_decision', 'deferred', 'withdrawn');

-- ---------------------------------------------------------------------------
-- Source events
-- ---------------------------------------------------------------------------
create table public.reeds_source_events (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organisations (id) on delete cascade,
  source_type  text not null check (source_type in ('manual', 'email', 'whatsapp_export', 'calendar', 'document')),
  source_ref   text check (source_ref is null or length(source_ref) between 1 and 300),
  source_link  text check (source_link is null or (length(source_link) <= 500 and source_link ~ '^(https://|/)\S*$')),
  received_at  timestamptz not null,
  sender_label text check (sender_label is null or length(sender_label) <= 120),
  summary      text not null check (length(btrim(summary)) between 1 and 1000),
  dedupe_key   text not null check (length(dedupe_key) between 8 and 400),
  triage       text not null default 'untriaged' check (triage in ('untriaged', 'information', 'commitment', 'meeting', 'decision',
                 'opportunity', 'property_case', 'client_delivery', 'restricted')),
  workspace    text not null default 'personal' check (workspace in ('personal', 'agency', 'pra', 'tebos', 'client', 'finance', 'technology')),
  status       text not null default 'received' check (status in ('received', 'triaged', 'actioned', 'ignored', 'failed')),
  error        text check (error is null or length(error) <= 1000),
  attempts     smallint not null default 0 check (attempts between 0 and 10),
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (org_id, dedupe_key),
  unique (id, org_id),
  check (status <> 'failed' or error is not null)
);
create index reeds_source_events_org_idx on public.reeds_source_events (org_id, received_at desc);

-- ---------------------------------------------------------------------------
-- Commitments (tasks)
-- ---------------------------------------------------------------------------
create table public.reeds_commitments (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null,
  source_event_id     uuid not null,
  title               text not null check (length(btrim(title)) between 1 and 200),
  expected_outcome    text check (expected_outcome is null or length(expected_outcome) <= 500),
  owner               text not null default 'founder' check (owner in ('founder', 'reeds', 'intake', 'analyst', 'revenue', 'pra', 'delivery', 'other')),
  owner_label         text check (owner_label is null or length(owner_label) <= 80),
  due_on              date,
  due_basis           text not null check (due_basis in ('verified', 'reported', 'inferred', 'unknown', 'none')),
  priority            text not null default 'normal' check (priority in ('high', 'normal', 'low')),
  priority_reason     text check (priority_reason is null or length(priority_reason) <= 300),
  workspace           text not null default 'personal' check (workspace in ('personal', 'agency', 'pra', 'tebos', 'client', 'finance', 'technology')),
  next_action         text check (next_action is null or length(next_action) <= 300),
  approval            text not null default 'not_needed' check (approval in ('not_needed', 'required', 'approved', 'rejected')),
  status              text not null default 'captured',
  blocked_reason      text check (blocked_reason is null or length(blocked_reason) <= 500),
  completion_evidence text check (completion_evidence is null or length(completion_evidence) <= 1000),
  completed_at        timestamptz,
  completed_by        uuid references auth.users (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  foreign key (source_event_id, org_id) references public.reeds_source_events (id, org_id) on delete cascade,
  unique (id, org_id),
  -- a date is either there with how it is known, or explicitly absent
  check ((due_on is null) = (due_basis in ('unknown', 'none'))),
  check (status <> 'done' or length(btrim(coalesce(completion_evidence, ''))) > 0),
  check (status <> 'blocked' or length(btrim(coalesce(blocked_reason, ''))) > 0)
);
create unique index reeds_commitments_once on public.reeds_commitments (source_event_id, lower(btrim(title)));
create index reeds_commitments_open_idx on public.reeds_commitments (org_id, due_on) where status not in ('done', 'cancelled');

-- ---------------------------------------------------------------------------
-- Decisions
-- ---------------------------------------------------------------------------
create table public.reeds_decisions (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  source_event_id uuid,
  question        text not null check (length(btrim(question)) between 1 and 300),
  options         text check (options is null or length(options) <= 1000),
  recommendation  text check (recommendation is null or length(recommendation) <= 1000),
  evidence        text check (evidence is null or length(evidence) <= 1000),
  decide_by       date,
  status          text not null default 'open',
  decision        text check (decision is null or length(decision) <= 1000),
  rationale       text check (rationale is null or length(rationale) <= 1000),
  decided_at      timestamptz,
  decided_by      uuid references auth.users (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (source_event_id, org_id) references public.reeds_source_events (id, org_id) on delete set null (source_event_id),
  check (status <> 'decided' or length(btrim(coalesce(decision, ''))) > 0)
);
create unique index reeds_decisions_once on public.reeds_decisions (source_event_id, lower(btrim(question))) where source_event_id is not null;

-- ---------------------------------------------------------------------------
-- Conflicts: a later source disagreeing with what is recorded
-- ---------------------------------------------------------------------------
create table public.reeds_conflicts (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null,
  commitment_id    uuid not null,
  field            text not null check (field in ('due_on', 'owner')),
  recorded_value   text,
  reported_value   text,
  source_event_id  uuid not null,
  resolution       text check (resolution is null or resolution in ('kept_recorded', 'took_reported')),
  resolved_at      timestamptz,
  created_at       timestamptz not null default now(),
  foreign key (commitment_id, org_id) references public.reeds_commitments (id, org_id) on delete cascade,
  foreign key (source_event_id, org_id) references public.reeds_source_events (id, org_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Integration health: the truth about each source
-- ---------------------------------------------------------------------------
create table public.reeds_integrations (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organisations (id) on delete cascade,
  source_type      text not null check (source_type in ('manual', 'email', 'whatsapp_export', 'calendar', 'document')),
  state            text not null default 'not_connected' check (state in ('not_connected', 'connected', 'failing')),
  detail           text check (detail is null or length(detail) <= 500),
  last_success_at  timestamptz,
  last_failure_at  timestamptz,
  last_error       text check (last_error is null or length(last_error) <= 1000),
  imported         integer not null default 0 check (imported >= 0),
  duplicates       integer not null default 0 check (duplicates >= 0),
  updated_at       timestamptz not null default now(),
  unique (org_id, source_type),
  -- "connected" means a sync really succeeded
  check (state <> 'connected' or last_success_at is not null),
  check (state <> 'failing' or (last_failure_at is not null and last_error is not null))
);

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------
create function tebos_private.guard_reeds_record() returns trigger
language plpgsql set search_path = '' as $$
declare
  v jsonb := to_jsonb(new);
  k text;
begin
  if not tebos_private.is_private_org(new.org_id) then
    raise exception 'REEDS intake lives only in the founder''s private organisation' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
  end if;
  foreach k in array array['summary', 'sender_label', 'title', 'expected_outcome', 'owner_label', 'priority_reason', 'next_action',
                           'blocked_reason', 'completion_evidence', 'question', 'options', 'recommendation', 'evidence',
                           'decision', 'rationale', 'detail', 'last_error', 'error'] loop
    if tebos_private.looks_secret(v ->> k) then
      raise exception 'this looks like a password, key or token; secrets are never stored here'
        using errcode = 'P0001', hint = 'TEBOS_SECRET_REFUSED';
    end if;
  end loop;
  if tg_op = 'UPDATE' and (v ->> 'created_at') is distinct from (to_jsonb(old) ->> 'created_at') then
    raise exception 'when a record was made is fixed' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  return new;
end $$;

create function tebos_private.guard_reeds_source_event() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := case when tebos_private.is_client() then auth.uid() else new.created_by end;
    if new.received_at > now() + interval '5 minutes' then
      raise exception 'a source can''t arrive in the future' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    return new;
  end if;
  -- where it came from is fixed: a correction is a new source event
  if (new.source_type, new.source_ref, new.source_link, new.received_at, new.sender_label, new.summary, new.dedupe_key, new.created_by)
     is distinct from (old.source_type, old.source_ref, old.source_link, old.received_at, old.sender_label, old.summary, old.dedupe_key, old.created_by) then
    raise exception 'a source record is kept as it arrived' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  return new;
end $$;

create function tebos_private.guard_reeds_commitment() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.completion_evidence := null;
    new.completed_at := null;
    new.completed_by := null;
    if new.approval in ('approved', 'rejected') then
      new.approval := 'required';
    end if;
    return new;
  end if;
  if new.source_event_id is distinct from old.source_event_id then
    raise exception 'a commitment stays linked to its source' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  -- a recorded date is changed by the founder, not by a later source: that is a conflict (public.reeds_capture)
  if new.approval is distinct from old.approval and new.approval in ('approved', 'rejected')
     and not (tebos_private.is_client() and auth.uid() is not null) then
    raise exception 'only the founder approves or rejects' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
  end if;
  if new.status is distinct from old.status then
    if new.status = 'done' then
      if not tebos_private.filled(new.completion_evidence) then
        raise exception 'done needs its evidence: what was sent, saved, booked or tested' using errcode = 'P0001', hint = 'TEBOS_EVIDENCE_REQUIRED';
      end if;
      if new.approval = 'required' then
        raise exception 'this needs your approval before it can be done' using errcode = 'P0001', hint = 'TEBOS_APPROVAL_REQUIRED';
      end if;
      new.completed_at := now();
      new.completed_by := case when tebos_private.is_client() then auth.uid() else null end;
    else
      new.completed_at := null;
      new.completed_by := null;
    end if;
    if new.status = 'blocked' and not tebos_private.filled(new.blocked_reason) then
      raise exception 'say what is blocking it, and who can unblock it' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
  end if;
  return new;
end $$;

create function tebos_private.guard_reeds_decision() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.decision := null; new.rationale := null; new.decided_at := null; new.decided_by := null;
    return new;
  end if;
  if new.status is distinct from old.status and new.status = 'decided' then
    if not (tebos_private.is_client() and auth.uid() is not null) then
      raise exception 'only the founder decides' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
    end if;
    if not tebos_private.filled(new.decision) then
      raise exception 'write down what was decided' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    new.decided_at := now();
    new.decided_by := auth.uid();
  end if;
  return new;
end $$;

create function tebos_private.guard_reeds_integration() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- connection health is reported by the server that ran the sync, never typed in
  if tebos_private.is_client() and tg_op = 'UPDATE' then
    raise exception 'connection status comes from the sync itself' using errcode = '42501', hint = 'TEBOS_SERVER_ONLY';
  end if;
  if tebos_private.is_client() and tg_op = 'INSERT' and (new.state <> 'not_connected' or new.last_success_at is not null or new.imported > 0) then
    raise exception 'a source starts as not connected' using errcode = '42501', hint = 'TEBOS_SERVER_ONLY';
  end if;
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['reeds_source_events', 'reeds_commitments', 'reeds_decisions', 'reeds_conflicts', 'reeds_integrations'] loop
    execute format('create trigger guard_reeds_record before insert or update on public.%I for each row execute function tebos_private.guard_reeds_record()', t);
    execute format('create trigger freeze_tenant_keys before update on public.%I for each row execute function tebos_private.freeze_tenant_keys()', t);
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function tebos_private.audit_row_redacted()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format($p$create policy owner_all on public.%I for all to authenticated
                      using (tebos_private.has_role(org_id, array['org_admin']) and tebos_private.two_step())
                      with check (tebos_private.has_role(org_id, array['org_admin']) and tebos_private.two_step())$p$, t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
  foreach t in array array['reeds_source_events', 'reeds_commitments', 'reeds_decisions'] loop
    execute format('create trigger touch before update on public.%I for each row execute function tebos_private.touch_updated_at()', t);
  end loop;
end $$;

create trigger guard_reeds_source_event before insert or update on public.reeds_source_events
  for each row execute function tebos_private.guard_reeds_source_event();
create trigger guard_reeds_commitment before insert or update on public.reeds_commitments
  for each row execute function tebos_private.guard_reeds_commitment();
create trigger enforce_state_machine before insert or update of status on public.reeds_commitments
  for each row execute function tebos_private.guard_status('reeds_commitment');
create trigger guard_reeds_decision before insert or update on public.reeds_decisions
  for each row execute function tebos_private.guard_reeds_decision();
create trigger enforce_state_machine before insert or update of status on public.reeds_decisions
  for each row execute function tebos_private.guard_status('reeds_decision');
create trigger guard_reeds_integration before insert or update on public.reeds_integrations
  for each row execute function tebos_private.guard_reeds_integration();

-- settling a conflict records when
create function tebos_private.stamp_conflict_resolution() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.resolution is distinct from old.resolution then
    new.resolved_at := case when new.resolution is null then null else now() end;
  end if;
  return new;
end $$;
create trigger stamp_resolution before update on public.reeds_conflicts
  for each row execute function tebos_private.stamp_conflict_resolution();

-- what the owner may write directly
grant select, delete on public.reeds_source_events to authenticated;
grant update (triage, workspace, status) on public.reeds_source_events to authenticated;
grant select on public.reeds_commitments to authenticated;
grant update (title, expected_outcome, owner, owner_label, due_on, due_basis, priority, priority_reason, workspace, next_action,
              approval, status, blocked_reason, completion_evidence) on public.reeds_commitments to authenticated;
grant select on public.reeds_decisions to authenticated;
grant insert (org_id, question, options, recommendation, evidence, decide_by) on public.reeds_decisions to authenticated;
grant update (options, recommendation, evidence, decide_by, status, decision, rationale) on public.reeds_decisions to authenticated;
grant select on public.reeds_conflicts to authenticated;
grant update (resolution) on public.reeds_conflicts to authenticated;
grant select, insert (org_id, source_type) on public.reeds_integrations to authenticated;

-- ---------------------------------------------------------------------------
-- Capture: one call takes a source and what it asks for. The same source again (same type and reference, or the
-- same manual text) is recognised and adds nothing; a commitment already recorded from an earlier source with a
-- different date or owner becomes a conflict, not an overwrite.
-- ---------------------------------------------------------------------------
create function public.reeds_capture(
  p_org uuid, p_source_type text, p_source_ref text, p_source_link text, p_received_at timestamptz,
  p_sender text, p_summary text, p_triage text, p_workspace text, p_items jsonb default '[]'::jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_key text;
  v_event uuid;
  v_item jsonb;
  v_kind text;
  v_existing record;
  v_due date;
  v_basis text;
  v_created integer := 0;
  v_conflicts integer := 0;
  v_skipped integer := 0;
begin
  if auth.uid() is not null and not (tebos_private.has_role(p_org, array['org_admin']) and tebos_private.two_step()) then
    raise exception 'only the owner captures into REEDS, after two-step sign-in' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
  end if;
  if not tebos_private.is_private_org(p_org) then
    raise exception 'REEDS intake lives only in the founder''s private organisation' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 20 then
    raise exception 'up to 20 items per source' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;

  -- the de-duplication key: the source's own ID where it has one, else the text itself
  v_key := p_source_type || ':' || coalesce(nullif(btrim(p_source_ref), ''),
             'sha256:' || encode(sha256(convert_to(lower(regexp_replace(btrim(p_summary), '\s+', ' ', 'g')), 'UTF8')), 'hex'));
  select id into v_event from public.reeds_source_events where org_id = p_org and dedupe_key = v_key;
  if v_event is not null then
    update public.reeds_integrations set duplicates = duplicates + 1 where org_id = p_org and source_type = p_source_type;
    return jsonb_build_object('source_event_id', v_event, 'duplicate', true, 'created', 0, 'conflicts', 0, 'skipped', 0);
  end if;

  insert into public.reeds_source_events (org_id, source_type, source_ref, source_link, received_at, sender_label, summary, dedupe_key,
                                          triage, workspace, status, created_by)
    values (p_org, p_source_type, nullif(btrim(p_source_ref), ''), nullif(btrim(p_source_link), ''), coalesce(p_received_at, now()),
            nullif(btrim(p_sender), ''), p_summary, v_key, coalesce(p_triage, 'untriaged'), coalesce(p_workspace, 'personal'),
            case when jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 0 then 'actioned'
                 when coalesce(p_triage, 'untriaged') = 'untriaged' then 'received' else 'triaged' end,
            auth.uid())
    returning id into v_event;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_kind := coalesce(v_item ->> 'kind', 'commitment');
    if v_kind = 'decision' then
      insert into public.reeds_decisions (org_id, source_event_id, question, options, recommendation, evidence, decide_by)
        values (p_org, v_event, v_item ->> 'title', v_item ->> 'options', v_item ->> 'recommendation', v_item ->> 'evidence',
                nullif(v_item ->> 'due_on', '')::date);
      v_created := v_created + 1;
      continue;
    end if;
    -- only a real action becomes a commitment; a date is kept with how it is known, or marked unknown
    v_due := nullif(v_item ->> 'due_on', '')::date;
    v_basis := case when v_due is null then coalesce(nullif(v_item ->> 'due_basis', ''), 'unknown')
                    else coalesce(nullif(v_item ->> 'due_basis', ''), 'reported') end;
    if v_due is null and v_basis not in ('unknown', 'none') then v_basis := 'unknown'; end if;
    if v_due is not null and v_basis in ('unknown', 'none') then v_basis := 'reported'; end if;

    -- the same commitment already recorded from an earlier source: compare, don't overwrite
    select c.id, c.due_on, c.owner into v_existing from public.reeds_commitments c
      where c.org_id = p_org and lower(btrim(c.title)) = lower(btrim(v_item ->> 'title')) and c.status not in ('done', 'cancelled')
      order by c.created_at limit 1;
    if v_existing.id is not null then
      if v_due is not null and v_existing.due_on is distinct from v_due then
        insert into public.reeds_conflicts (org_id, commitment_id, field, recorded_value, reported_value, source_event_id)
          values (p_org, v_existing.id, 'due_on', v_existing.due_on::text, v_due::text, v_event);
        v_conflicts := v_conflicts + 1;
      elsif nullif(v_item ->> 'owner', '') is not null and v_existing.owner is distinct from (v_item ->> 'owner') then
        insert into public.reeds_conflicts (org_id, commitment_id, field, recorded_value, reported_value, source_event_id)
          values (p_org, v_existing.id, 'owner', v_existing.owner, v_item ->> 'owner', v_event);
        v_conflicts := v_conflicts + 1;
      else
        v_skipped := v_skipped + 1;
      end if;
      continue;
    end if;

    insert into public.reeds_commitments (org_id, source_event_id, title, expected_outcome, owner, owner_label, due_on, due_basis, priority,
                                          priority_reason, workspace, next_action, approval, status)
      values (p_org, v_event, v_item ->> 'title', v_item ->> 'expected_outcome', coalesce(nullif(v_item ->> 'owner', ''), 'founder'),
              v_item ->> 'owner_label', v_due, v_basis, coalesce(nullif(v_item ->> 'priority', ''), 'normal'), v_item ->> 'priority_reason',
              coalesce(nullif(v_item ->> 'workspace', ''), coalesce(p_workspace, 'personal')), v_item ->> 'next_action',
              case when (v_item ->> 'approval') = 'required' then 'required' else 'not_needed' end,
              case when nullif(v_item ->> 'next_action', '') is not null then 'ready' else 'captured' end);
    v_created := v_created + 1;
  end loop;

  update public.reeds_integrations set imported = imported + 1 where org_id = p_org and source_type = p_source_type;
  return jsonb_build_object('source_event_id', v_event, 'duplicate', false, 'created', v_created, 'conflicts', v_conflicts, 'skipped', v_skipped);
end $$;

revoke all on function public.reeds_capture(uuid, text, text, text, timestamptz, text, text, text, text, jsonb) from public, anon;
grant execute on function public.reeds_capture(uuid, text, text, text, timestamptz, text, text, text, text, jsonb) to authenticated, service_role;

-- A sync that ran reports here, success or failure; the server only.
create function public.reeds_report_sync(p_org uuid, p_source_type text, p_ok boolean, p_error text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    raise exception 'only the sync itself reports its result' using errcode = '42501', hint = 'TEBOS_SERVER_ONLY';
  end if;
  insert into public.reeds_integrations (org_id, source_type) values (p_org, p_source_type) on conflict (org_id, source_type) do nothing;
  if p_ok then
    update public.reeds_integrations set state = 'connected', last_success_at = now(), last_error = null
      where org_id = p_org and source_type = p_source_type;
  else
    update public.reeds_integrations set state = 'failing', last_failure_at = now(), last_error = coalesce(nullif(btrim(p_error), ''), 'unknown error')
      where org_id = p_org and source_type = p_source_type;
  end if;
end $$;

revoke all on function public.reeds_report_sync(uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.reeds_report_sync(uuid, text, boolean, text) to service_role;
