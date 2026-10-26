-- The week board (TEPOS; founder's master execution brief, 26 Oct 2026, §3, §4, §8): one place to see today's scene,
-- what to do next, what "done" means, and what happened, organised by Income, Impact and Intelligence.
--
-- Two layers, kept apart so changing the plan never rewrites history:
--   tepos_plan_days / tepos_plan_items   the recurring weekly template: a scene for each weekday and its actions.
--   tepos_weeks / tepos_week_days /      one week as it was planned and lived: the template is copied in when the
--   tepos_week_tasks                     week is opened (public.tepos_open_week), and edits to the template later
--                                        touch only weeks opened after them. Opening a week twice adds nothing.
--
-- The rules (mirrored in src/domain/week.ts):
--   * Everything lives only in a private organisation, for its owner, after two-step sign-in (as the agent's office).
--   * Nothing is marked done except by the signed-in person: the server can open a week but never tick a task.
--   * Blocked, deferred and skipped say why; a deferral has a date, today or later in South African time.
--   * A day closes with its outcomes; blockers, learning and what carries forward sit beside them.
--   * No agency client details (email, phone, ID numbers) and no secrets: Pelser's records stay in Pelser's systems.
--   * The audit trail is redacted: who changed which fields, and when.

insert into public.state_transitions (machine, from_state, to_state) values
  ('week_task', '(initial)', 'not_started'),
  ('week_task', 'not_started', 'in_progress'),
  ('week_task', 'not_started', 'done'),
  ('week_task', 'not_started', 'blocked'),
  ('week_task', 'not_started', 'deferred'),
  ('week_task', 'not_started', 'skipped'),
  ('week_task', 'in_progress', 'not_started'),
  ('week_task', 'in_progress', 'done'),
  ('week_task', 'in_progress', 'blocked'),
  ('week_task', 'in_progress', 'deferred'),
  ('week_task', 'in_progress', 'skipped'),
  ('week_task', 'blocked', 'not_started'),
  ('week_task', 'blocked', 'in_progress'),
  ('week_task', 'blocked', 'deferred'),
  ('week_task', 'blocked', 'skipped'),
  ('week_task', 'deferred', 'not_started'),
  ('week_task', 'deferred', 'in_progress'),
  ('week_task', 'deferred', 'done'),
  ('week_task', 'deferred', 'skipped'),
  ('week_task', 'skipped', 'not_started'),
  ('week_task', 'done', 'in_progress');

-- South Africa's date now: every "today" on the board.
create function tebos_private.sa_today() returns date
language sql stable set search_path = '' as $$ select (now() at time zone 'Africa/Johannesburg')::date $$;

-- ---------------------------------------------------------------------------
-- The recurring template
-- ---------------------------------------------------------------------------
create table public.tepos_plan_days (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations (id) on delete cascade,
  weekday     smallint not null check (weekday between 1 and 7), -- ISO: 1 Monday … 7 Sunday
  scene       text not null check (length(btrim(scene)) between 1 and 80),
  focus       text not null check (length(btrim(focus)) between 1 and 300),
  lens        text not null check (lens in ('income', 'impact', 'intelligence')),
  deliverable text not null check (length(btrim(deliverable)) between 1 and 300),
  saved_to    text not null check (length(btrim(saved_to)) between 1 and 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, weekday)
);

create table public.tepos_plan_items (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organisations (id) on delete cascade,
  weekday            smallint not null check (weekday between 1 and 7),
  position           smallint not null check (position between 1 and 20),
  title              text not null check (length(btrim(title)) between 1 and 160),
  lens               text not null check (lens in ('income', 'impact', 'intelligence')),
  action             text not null check (length(btrim(action)) between 1 and 600),
  definition_of_done text not null check (length(btrim(definition_of_done)) between 1 and 400),
  est_minutes        smallint not null check (est_minutes between 5 and 480),
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (org_id, weekday, position)
);

-- ---------------------------------------------------------------------------
-- A week as lived
-- ---------------------------------------------------------------------------
create table public.tepos_weeks (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations (id) on delete cascade,
  week_start  date not null check (extract(isodow from week_start) = 1),
  timezone    text not null default 'Africa/Johannesburg' check (timezone = 'Africa/Johannesburg'),
  created_at  timestamptz not null default now(),
  unique (org_id, week_start),
  unique (id, org_id)
);

create table public.tepos_week_days (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  week_id         uuid not null,
  weekday         smallint not null check (weekday between 1 and 7),
  local_date      date not null,
  scene           text not null check (length(btrim(scene)) between 1 and 80),
  focus           text not null check (length(btrim(focus)) between 1 and 300),
  lens            text not null check (lens in ('income', 'impact', 'intelligence')),
  deliverable     text not null check (length(btrim(deliverable)) between 1 and 300),
  saved_to        text not null check (length(btrim(saved_to)) between 1 and 200),
  outcomes        text check (outcomes is null or length(outcomes) <= 1500),
  blockers        text check (blockers is null or length(blockers) <= 1000),
  learning        text check (learning is null or length(learning) <= 1000),
  carried_forward text check (carried_forward is null or length(carried_forward) <= 1000),
  closed_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (week_id, org_id) references public.tepos_weeks (id, org_id) on delete cascade,
  unique (week_id, weekday),
  unique (id, week_id, org_id)
);

create table public.tepos_week_tasks (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null,
  week_id            uuid not null,
  day_id             uuid not null,
  plan_item_id       uuid references public.tepos_plan_items (id) on delete set null,
  local_date         date not null,
  position           smallint not null default 1 check (position between 1 and 50),
  title              text not null check (length(btrim(title)) between 1 and 160),
  lens               text not null check (lens in ('income', 'impact', 'intelligence')),
  action             text check (action is null or length(action) <= 600),
  definition_of_done text not null check (length(btrim(definition_of_done)) between 1 and 400),
  est_minutes        smallint check (est_minutes is null or est_minutes between 5 and 480),
  status             text not null default 'not_started',
  status_reason      text check (status_reason is null or length(status_reason) <= 500),
  defer_until        date,
  owner_label        text check (owner_label is null or length(owner_label) <= 80),
  evidence_note      text check (evidence_note is null or length(evidence_note) <= 1000),
  output_link        text check (output_link is null or (length(output_link) <= 400 and output_link ~ '^(https://|/)\S*$')),
  completed_at       timestamptz,
  completed_by       uuid references auth.users (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  foreign key (day_id, week_id, org_id) references public.tepos_week_days (id, week_id, org_id) on delete cascade,
  unique (day_id, plan_item_id)
);
create index tepos_week_tasks_week_idx on public.tepos_week_tasks (week_id, local_date, position);

-- ---------------------------------------------------------------------------
-- The guards
-- ---------------------------------------------------------------------------
create function tebos_private.guard_tepos_week_record() returns trigger
language plpgsql set search_path = '' as $$
declare
  v jsonb := to_jsonb(new);
  k text;
begin
  if not tebos_private.is_private_org(new.org_id) then
    raise exception 'the week board lives only in a private organisation' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
  end if;
  foreach k in array array['scene', 'focus', 'deliverable', 'saved_to', 'title', 'action', 'definition_of_done',
                           'outcomes', 'blockers', 'learning', 'carried_forward', 'status_reason', 'owner_label',
                           'evidence_note'] loop
    if tebos_private.looks_secret(v ->> k) then
      raise exception 'this looks like a password, key or token; secrets are never stored here'
        using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    if tebos_private.looks_personal(v ->> k) then
      raise exception 'no contact details or ID numbers here: agency clients stay in the agency''s systems'
        using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
  end loop;
  if tg_op = 'UPDATE' then
    if (v ->> 'created_at') is distinct from (to_jsonb(old) ->> 'created_at') then
      raise exception 'when a record was made is fixed' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
    end if;
    if tg_table_name in ('tepos_week_days', 'tepos_week_tasks')
       and ((v ->> 'week_id', v ->> 'local_date') is distinct from (to_jsonb(old) ->> 'week_id', to_jsonb(old) ->> 'local_date')) then
      raise exception 'a planned day stays on its date; defer the task instead' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
    end if;
  end if;
  return new;
end $$;

create function tebos_private.guard_tepos_week_day() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_start date;
begin
  if tg_op = 'INSERT' then
    select week_start into v_start from public.tepos_weeks where id = new.week_id;
    new.local_date := v_start + (new.weekday - 1);
    new.outcomes := null; new.blockers := null; new.learning := null; new.carried_forward := null; new.closed_at := null;
    return new;
  end if;
  if new.weekday is distinct from old.weekday then
    raise exception 'a planned day stays on its date' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  -- a day closes with its outcomes, and only on or after that day
  if tebos_private.filled(new.outcomes) and old.closed_at is null then
    if new.local_date > tebos_private.sa_today() then
      raise exception 'a day closes on the day or after it, not before' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    new.closed_at := now();
  elsif not tebos_private.filled(new.outcomes) then
    new.closed_at := null;
  else
    new.closed_at := old.closed_at;
  end if;
  return new;
end $$;

create function tebos_private.guard_tepos_week_task() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.completed_at := null;
    new.completed_by := null;
    select local_date into new.local_date from public.tepos_week_days where id = new.day_id;
  elsif new.day_id is distinct from old.day_id then
    raise exception 'a task stays on its day; defer it instead' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status in ('blocked', 'deferred', 'skipped') and not tebos_private.filled(new.status_reason) then
      raise exception 'say why it is %', replace(new.status, '_', ' ') using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    if new.status = 'deferred' and (new.defer_until is null or new.defer_until < tebos_private.sa_today()) then
      raise exception 'a deferral needs a new date, today or later' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    if new.status = 'done' then
      if not tebos_private.is_client() or auth.uid() is null then
        raise exception 'only you mark a task done; the system never does' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
      end if;
      new.completed_at := now();
      new.completed_by := auth.uid();
    else
      new.completed_at := null;
      new.completed_by := null;
    end if;
    if new.status = 'blocked' and new.defer_until is not null and new.defer_until < tebos_private.sa_today() then
      raise exception 'a new date is today or later' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    if new.status not in ('deferred', 'blocked') then
      new.defer_until := null;
    end if;
    if new.status in ('not_started', 'in_progress', 'done') then
      new.status_reason := case when new.status = 'done' then null else new.status_reason end;
    end if;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['tepos_plan_days', 'tepos_plan_items', 'tepos_weeks', 'tepos_week_days', 'tepos_week_tasks'] loop
    execute format('create trigger guard_tepos_week_record before insert or update on public.%I for each row execute function tebos_private.guard_tepos_week_record()', t);
    if t <> 'tepos_weeks' then
      execute format('create trigger touch before update on public.%I for each row execute function tebos_private.touch_updated_at()', t);
    end if;
    execute format('create trigger freeze_tenant_keys before update on public.%I for each row execute function tebos_private.freeze_tenant_keys()', t);
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function tebos_private.audit_row_redacted()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format($p$create policy owner_all on public.%I for all to authenticated
                      using (tebos_private.has_role(org_id, array['org_admin']) and tebos_private.two_step())
                      with check (tebos_private.has_role(org_id, array['org_admin']) and tebos_private.two_step())$p$, t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

create trigger guard_tepos_week_day before insert or update on public.tepos_week_days
  for each row execute function tebos_private.guard_tepos_week_day();
create trigger guard_tepos_week_task before insert or update on public.tepos_week_tasks
  for each row execute function tebos_private.guard_tepos_week_task();
create trigger enforce_state_machine before insert or update of status on public.tepos_week_tasks
  for each row execute function tebos_private.guard_status('week_task');

-- what the owner may write: the template freely; a week's snapshot only through opening it, then its close and tasks
grant select, insert, update, delete on public.tepos_plan_days, public.tepos_plan_items to authenticated;
grant select on public.tepos_weeks to authenticated;
grant select on public.tepos_week_days to authenticated;
grant update (outcomes, blockers, learning, carried_forward) on public.tepos_week_days to authenticated;
grant select, delete on public.tepos_week_tasks to authenticated;
grant insert (org_id, week_id, day_id, position, title, lens, action, definition_of_done, est_minutes, owner_label)
  on public.tepos_week_tasks to authenticated;
grant update (position, title, lens, action, definition_of_done, est_minutes, status, status_reason, defer_until,
              owner_label, evidence_note, output_link) on public.tepos_week_tasks to authenticated;

-- ---------------------------------------------------------------------------
-- Opening a week: copies the template in once. Running it again adds nothing; a template item added since is added.
-- It writes the week's snapshot, which the owner can't write directly, so it runs with the definer's rights and
-- checks the caller itself: a signed-in caller must own the organisation and have passed two-step sign-in.
-- ---------------------------------------------------------------------------
create function public.tepos_open_week(p_org uuid, p_week_start date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_week uuid;
begin
  if p_week_start is null or extract(isodow from p_week_start) <> 1 then
    raise exception 'a week starts on a Monday' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  if not tebos_private.is_private_org(p_org) then
    raise exception 'the week board lives only in a private organisation' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
  end if;
  if auth.uid() is not null and not (tebos_private.has_role(p_org, array['org_admin']) and tebos_private.two_step()) then
    raise exception 'only the owner opens a week, after two-step sign-in' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
  end if;
  if not exists (select 1 from public.tepos_plan_days where org_id = p_org) then
    raise exception 'there is no weekly plan yet: set it up first' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;

  insert into public.tepos_weeks (org_id, week_start) values (p_org, p_week_start)
    on conflict (org_id, week_start) do nothing;
  select id into v_week from public.tepos_weeks where org_id = p_org and week_start = p_week_start;

  insert into public.tepos_week_days (org_id, week_id, weekday, local_date, scene, focus, lens, deliverable, saved_to)
    select p_org, v_week, d.weekday, p_week_start + (d.weekday - 1), d.scene, d.focus, d.lens, d.deliverable, d.saved_to
      from public.tepos_plan_days d where d.org_id = p_org
    on conflict (week_id, weekday) do nothing;

  insert into public.tepos_week_tasks (org_id, week_id, day_id, plan_item_id, local_date, position, title, lens, action,
                                       definition_of_done, est_minutes)
    select p_org, v_week, wd.id, i.id, wd.local_date, i.position, i.title, i.lens, i.action, i.definition_of_done, i.est_minutes
      from public.tepos_plan_items i
      join public.tepos_week_days wd on wd.week_id = v_week and wd.weekday = i.weekday
     where i.org_id = p_org and i.active
    on conflict (day_id, plan_item_id) do nothing;
  return v_week;
end $$;

revoke all on function public.tepos_open_week(uuid, date) from public, anon;
grant execute on function public.tepos_open_week(uuid, date) to authenticated, service_role;
