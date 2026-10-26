-- The worker's heartbeat: whether anything runs on its own, told truthfully.
--
-- Between 20 and 26 October the worker stopped (the Railway trial ended) and nothing showed it: syncs, briefs and
-- reminders simply didn't happen. From now on the worker reports each pass, and the founder's first view says
-- whether it is running, late or stopped, and since when.
--
-- The rules (mirrored in src/domain/worker-health.ts):
--   * Only the server writes a beat (public.worker_beat), and the time is the database's own clock: a beat can't be
--     back-dated or invented from a browser.
--   * Running: a beat in the last 30 minutes (the batch schedule is every 15). Late: within 2 hours. Stopped: older.
--     Never: no worker has reported at all. "Never" is not "running".
--   * The last error is kept short, and anything that looks like a credential is withheld, not stored.
--   * Only a platform admin, or a private organisation's owner after two-step sign-in, can read the status, and
--     then only the summary (public.worker_status), not the worker's identifiers.

create table public.worker_heartbeats (
  worker_id     text primary key check (length(btrim(worker_id)) between 1 and 120),
  mode          text not null check (mode in ('continuous', 'batch')),
  started_at    timestamptz not null,
  last_beat_at  timestamptz not null,
  passes        integer not null default 0 check (passes >= 0),
  errors        integer not null default 0 check (errors >= 0),          -- failed steps, all passes
  last_pass_errors integer not null default 0 check (last_pass_errors >= 0),
  last_error    text check (last_error is null or length(last_error) <= 300),
  last_error_at timestamptz,
  stages        jsonb not null default '{}'::jsonb check (jsonb_typeof(stages) = 'object'),
  check ((last_error is null) = (last_error_at is null)),
  check (last_beat_at >= started_at)
);
alter table public.worker_heartbeats enable row level security;
-- no policies: clients never read or write it directly
revoke all on public.worker_heartbeats from anon, authenticated;

-- One pass of the worker. p_errors is how many steps failed in this pass; p_error the latest message, if any.
create function public.worker_beat(p_worker text, p_mode text, p_started timestamptz, p_errors integer, p_error text, p_stages jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_error text := nullif(left(btrim(coalesce(p_error, '')), 300), '');
begin
  if p_errors is null or p_errors < 0 then
    raise exception 'errors must be zero or more' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  if p_started is null or p_started > now() + interval '1 minute' then
    raise exception 'a worker can''t start in the future' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  if tebos_private.looks_secret(v_error) then
    v_error := '(error withheld: it looked like a credential)';
  end if;
  insert into public.worker_heartbeats as h (worker_id, mode, started_at, last_beat_at, passes, errors, last_pass_errors, last_error, last_error_at, stages)
  values (p_worker, p_mode, least(p_started, now()), now(), 1, p_errors, p_errors, v_error, case when v_error is null then null else now() end,
          coalesce(p_stages, '{}'::jsonb))
  on conflict (worker_id) do update set
    mode          = excluded.mode,
    started_at    = least(excluded.started_at, now()),
    last_beat_at  = now(),
    passes        = h.passes + 1,
    errors        = h.errors + excluded.errors,
    last_pass_errors = excluded.last_pass_errors,
    last_error    = coalesce(excluded.last_error, h.last_error),
    last_error_at = case when excluded.last_error is not null then now() else h.last_error_at end,
    stages        = excluded.stages;
  -- a restart gets a new worker ID: old ones go after 30 days so the table stays small
  delete from public.worker_heartbeats where last_beat_at < now() - interval '30 days';
end $$;
revoke all on function public.worker_beat(text, text, timestamptz, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.worker_beat(text, text, timestamptz, integer, text, jsonb) to service_role;

-- The status the founder sees.
create function public.worker_status()
returns table (state text, last_beat_at timestamptz, minutes_since integer, mode text, last_pass_errors integer, last_error text, last_error_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_last public.worker_heartbeats;
  v_min integer;
begin
  if not (tebos_private.is_platform_admin()
          or (tebos_private.two_step() and exists (
                select 1 from public.memberships m
                 where m.user_id = auth.uid() and m.role = 'org_admin' and tebos_private.is_private_org(m.org_id)))) then
    raise exception 'only the owner sees the worker''s status' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
  end if;
  select * into v_last from public.worker_heartbeats order by last_beat_at desc limit 1;
  if v_last.worker_id is null then
    return query select 'never'::text, null::timestamptz, null::integer, null::text, 0, null::text, null::timestamptz;
    return;
  end if;
  v_min := floor(extract(epoch from now() - v_last.last_beat_at) / 60)::integer;
  return query select
    case when v_min <= 30 then 'running' when v_min <= 120 then 'late' else 'stopped' end,
    v_last.last_beat_at, v_min, v_last.mode,
    v_last.last_pass_errors,
    v_last.last_error, v_last.last_error_at;
end $$;
revoke all on function public.worker_status() from public, anon;
grant execute on function public.worker_status() to authenticated;
