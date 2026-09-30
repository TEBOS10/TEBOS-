-- Client delivery: after a client is onboarded, TEBOS owes them a dated plan
-- of steps (src/domain/delivery.ts). The server creates the steps when it
-- onboards the client; the assigned maintainer (or a platform admin) closes
-- each one with a note of what was done; the client's own team can see their
-- plan. Overdue steps are counted on TEBOS's own board.
--
--   * Only the server creates or removes steps; the title, what "done" means
--     and the due date are fixed.
--   * A step moves open -> done or open -> skipped, once, with a note. Who
--     closed it and when are recorded by the database.

create table public.delivery_tasks (
  id             uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities (id),
  org_id         uuid not null references public.organisations (id) on delete cascade,
  key            text not null check (key ~ '^[a-z][a-z0-9_-]{1,40}$'),
  position       integer not null check (position between 1 and 50),
  title          text not null check (length(trim(title)) between 1 and 200),
  done_means     text not null check (length(trim(done_means)) between 1 and 1000),
  due_at         timestamptz not null,
  status         text not null default 'open' check (status in ('open', 'done', 'skipped')),
  note           text check (note is null or length(note) <= 2000),
  closed_by      uuid references auth.users (id),
  closed_at      timestamptz,
  created_at     timestamptz not null default now(),
  unique (opportunity_id, key),
  check ((status = 'open') = (closed_at is null)),
  check (status = 'open' or coalesce(length(trim(note)), 0) >= 3)
);
create index delivery_tasks_open_idx on public.delivery_tasks (due_at) where status = 'open';
create index delivery_tasks_org_idx on public.delivery_tasks (org_id);

-- Is the caller this step's maintainer (or a platform admin)?
create function tebos_private.maintains(p_opportunity uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select tebos_private.is_platform_admin()
      or exists (select 1 from public.opportunities where id = p_opportunity and maintainer_id = auth.uid())
$$;

create function tebos_private.guard_delivery_task() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tebos_private.is_client() then
    if tg_op <> 'UPDATE' then
      raise exception 'delivery steps are set by TEBOS when a client is onboarded'
        using errcode = '42501', hint = 'TEBOS_SERVER_ONLY';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if (new.opportunity_id, new.org_id, new.key, new.position, new.title, new.done_means, new.due_at, new.created_at)
       is distinct from
       (old.opportunity_id, old.org_id, old.key, old.position, old.title, old.done_means, old.due_at, old.created_at) then
      raise exception 'a delivery step''s title, meaning and due date are fixed'
        using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
    end if;
    if old.status <> 'open' then
      raise exception 'a closed delivery step stays closed' using errcode = 'P0001', hint = 'TEBOS_ILLEGAL_TRANSITION';
    end if;
    if new.status is distinct from old.status then
      new.closed_at := now();
      new.closed_by := auth.uid();
    elsif (new.note, new.closed_by, new.closed_at) is distinct from (old.note, old.closed_by, old.closed_at) then
      raise exception 'a note is recorded when the step is closed' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
  end if;
  return new;
end $$;

create trigger guard_delivery_task before insert or update or delete on public.delivery_tasks
  for each row execute function tebos_private.guard_delivery_task();
create trigger audit after insert or update or delete on public.delivery_tasks
  for each row execute function tebos_private.audit_row();

alter table public.delivery_tasks enable row level security;
revoke all on public.delivery_tasks from anon, authenticated;
-- the maintainer and admins, and the client's own team (read-only)
create policy delivery_read on public.delivery_tasks for select to authenticated
  using (tebos_private.maintains(opportunity_id) or tebos_private.is_member(org_id));
create policy maintainer_close on public.delivery_tasks for update to authenticated
  using (tebos_private.maintains(opportunity_id)) with check (tebos_private.maintains(opportunity_id));
grant select (id, opportunity_id, org_id, key, position, title, done_means, due_at, status, note, closed_by, closed_at, created_at)
  on public.delivery_tasks to authenticated;
grant update (status, note) on public.delivery_tasks to authenticated;
grant all on public.delivery_tasks to service_role;

-- ---------------------------------------------------------------------------
-- TEBOS's own board counts delivery: overdue steps, and the oldest
-- ---------------------------------------------------------------------------
create or replace function tebos_private.company_snapshot() returns jsonb
language sql stable security definer set search_path = '' as $$
  with
    o as (select * from public.opportunities),
    paid as (
      select p.opportunity_id, p.amount_cents, p.paid_at from public.payments p where p.status = 'success'
    ),
    first_paid as (select opportunity_id, min(paid_at) as at from paid group by opportunity_id)
  select jsonb_build_object(
    'schema_version', 1,
    'taken_at', now(),
    'leads', jsonb_build_object(
      'total', (select count(*) from public.enquiries),
      'last_7_days', (select count(*) from public.enquiries where created_at > now() - interval '7 days'),
      'last_30_days', (select count(*) from public.enquiries where created_at > now() - interval '30 days'),
      'from_sales_30_days', (select count(*) from public.enquiries where source = 'sales' and created_at > now() - interval '30 days'),
      'from_website_30_days', (select count(*) from public.enquiries where source = 'website' and created_at > now() - interval '30 days')
    ),
    'pipeline', jsonb_build_object(
      'by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) as n from o group by status) s), '{}'::jsonb),
      'to_decide', (select count(*) from o where status = 'screened'),
      'oldest_undecided_days', coalesce((select floor(extract(epoch from now() - min(screened_at)) / 86400)::int from o where status = 'screened'), 0),
      'awaiting_payment', (select count(*) from o where status = 'awaiting_payment'),
      'awaiting_contract', (select count(*) from o where status in ('paid', 'contract_sent'))
    ),
    'sales', jsonb_build_object(
      'won_30_days', (select count(*) from first_paid where at > now() - interval '30 days'),
      'decided_30_days', (select count(*) from o where decided_at > now() - interval '30 days' and status <> 'cancelled'),
      'declined_30_days', (select count(*) from o where status = 'declined' and decided_at > now() - interval '30 days')
    ),
    'revenue', jsonb_build_object(
      'cash_collected_this_month_zar', coalesce((select sum(amount_cents) from paid where paid_at >= date_trunc('month', now())), 0) / 100,
      'cash_collected_last_30_days_zar', coalesce((select sum(amount_cents) from paid where paid_at > now() - interval '30 days'), 0) / 100,
      'cash_collected_total_zar', coalesce((select sum(amount_cents) from paid), 0) / 100,
      'payments_this_month', (select count(*) from paid where paid_at >= date_trunc('month', now()))
    ),
    'clients', jsonb_build_object(
      'active', (select count(*) from o where status = 'onboarded'),
      'contracted_monthly_fees_zar', coalesce((select sum(amount_cents) from o where status = 'onboarded'), 0) / 100,
      'without_maintainer', (select count(*) from o where status in ('contracted', 'onboarded') and maintainer_id is null)
    ),
    'team', jsonb_build_object(
      'sales', (select count(distinct user_id) from public.platform_staff where role = 'sales'),
      'maintainers', (select count(distinct user_id) from public.platform_staff where role = 'maintainer')
    ),
    'delivery', jsonb_build_object(
      'client_emails_failed', (select count(*) from public.outbox_emails where sent_at is null and attempts >= 5),
      'client_emails_waiting', (select count(*) from public.outbox_emails where sent_at is null and attempts < 5),
      'steps_open', (select count(*) from public.delivery_tasks where status = 'open'),
      'steps_overdue', (select count(*) from public.delivery_tasks where status = 'open' and due_at < now()),
      'oldest_overdue_days', coalesce((select floor(extract(epoch from now() - min(due_at)) / 86400)::int
                                         from public.delivery_tasks where status = 'open' and due_at < now()), 0),
      'steps_done_on_time_30_days', (select count(*) from public.delivery_tasks
                                      where status = 'done' and closed_at > now() - interval '30 days' and closed_at <= due_at),
      'steps_done_30_days', (select count(*) from public.delivery_tasks where status = 'done' and closed_at > now() - interval '30 days')
    )
  )
$$;
