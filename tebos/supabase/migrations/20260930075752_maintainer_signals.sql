-- The maintainer's queue, fed from each client's live records
-- (src/domain/maintenance.ts): objectives slipping or unmeasured,
-- connections broken, findings and approvals left waiting.
--
--   * TEBOS's server raises each signal once per client, kind and subject,
--     keeps it while the condition holds, and resolves it when it clears.
--   * The client's maintainer (or a platform admin) closes an item as done or
--     dismissed, with a note. The database records who and when.
--   * Items are TEBOS's working list, not the client's: only the client's
--     maintainer and platform admins see them. For TEBOS's own organisation
--     (no maintainer), platform admins do.

create table public.maintainer_items (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organisations (id) on delete cascade,
  opportunity_id uuid references public.opportunities (id),
  kind           text not null check (kind in ('objective_past_due', 'objective_at_risk', 'objective_unmeasured',
                                               'connection_broken', 'findings_waiting', 'approvals_waiting')),
  subject_id     uuid,
  severity       text not null check (severity in ('high', 'medium')),
  title          text not null check (length(trim(title)) between 1 and 300),
  detail         text not null check (length(detail) <= 2000),
  status         text not null default 'open' check (status in ('open', 'done', 'dismissed', 'resolved')),
  note           text check (note is null or length(note) <= 2000),
  raised_at      timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  closed_by      uuid references auth.users (id),
  closed_at      timestamptz,
  check ((status = 'open') = (closed_at is null)),
  check (status not in ('done', 'dismissed') or coalesce(length(trim(note)), 0) >= 3)
);
create unique index maintainer_items_one_open_idx on public.maintainer_items (org_id, kind, coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'open';
create index maintainer_items_open_idx on public.maintainer_items (org_id) where status = 'open';

create function tebos_private.guard_maintainer_item() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tebos_private.is_client() then
    if tg_op <> 'UPDATE' then
      raise exception 'queue items are raised by TEBOS from the client''s records' using errcode = '42501', hint = 'TEBOS_SERVER_ONLY';
    end if;
    if (new.org_id, new.opportunity_id, new.kind, new.subject_id, new.severity, new.title, new.detail, new.raised_at, new.last_seen_at)
       is distinct from
       (old.org_id, old.opportunity_id, old.kind, old.subject_id, old.severity, old.title, old.detail, old.raised_at, old.last_seen_at) then
      raise exception 'what TEBOS raised is fixed; close the item with a note' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
    end if;
    if new.status is distinct from old.status then
      if old.status <> 'open' or new.status not in ('done', 'dismissed') then
        raise exception 'an open item is closed as done or dismissed, once' using errcode = 'P0001', hint = 'TEBOS_ILLEGAL_TRANSITION';
      end if;
      new.closed_at := now();
      new.closed_by := auth.uid();
    elsif (new.note, new.closed_by, new.closed_at) is distinct from (old.note, old.closed_by, old.closed_at) then
      raise exception 'a note is recorded when the item is closed' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
  end if;
  return new;
end $$;

create trigger guard_maintainer_item before insert or update or delete on public.maintainer_items
  for each row execute function tebos_private.guard_maintainer_item();
create trigger audit after insert or update or delete on public.maintainer_items
  for each row execute function tebos_private.audit_row();

-- When each organisation was last scanned for signals (the server's bookkeeping).
create table tebos_private.maintenance_scans (
  org_id     uuid primary key references public.organisations (id) on delete cascade,
  scanned_at timestamptz not null
);
-- the worker (service role) keeps the scan dates and reads which organisation is TEBOS's own
grant select, insert, update on tebos_private.maintenance_scans to service_role;
grant select on tebos_private.company_orgs to service_role;

alter table public.maintainer_items enable row level security;
revoke all on public.maintainer_items from anon, authenticated;
create policy maintainer_read on public.maintainer_items for select to authenticated
  using (tebos_private.maintains(opportunity_id) or (opportunity_id is null and tebos_private.is_platform_admin()));
create policy maintainer_close on public.maintainer_items for update to authenticated
  using (tebos_private.maintains(opportunity_id) or (opportunity_id is null and tebos_private.is_platform_admin()))
  with check (tebos_private.maintains(opportunity_id) or (opportunity_id is null and tebos_private.is_platform_admin()));
grant select on public.maintainer_items to authenticated;
grant update (status, note) on public.maintainer_items to authenticated;
grant all on public.maintainer_items to service_role;

-- TEBOS's own board: how much the maintainers have open
create or replace function tebos_private.company_snapshot() returns jsonb
language sql stable security definer set search_path = '' as $$
  select tebos_private.company_snapshot_base()
    || jsonb_build_object('attention', jsonb_build_object(
      'self_checks_7_days', (select count(*) from public.self_check_results where created_at > now() - interval '7 days'),
      'self_checks_30_days', (select count(*) from public.self_check_results where created_at > now() - interval '30 days'),
      'average_score_30_days', coalesce((select round(avg(score))::int from public.self_check_results where created_at > now() - interval '30 days'), 0)
    ))
    || jsonb_build_object('billing', jsonb_build_object(
      'monthly_recurring_zar', coalesce((select sum(monthly_cents) from public.billing_accounts where status = 'active'), 0) / 100,
      'accounts_active', (select count(*) from public.billing_accounts where status = 'active'),
      'accounts_awaiting_fee', (select count(*) from public.billing_accounts where status = 'awaiting_fee'),
      'accounts_paused', (select count(*) from public.billing_accounts where status = 'paused'),
      'invoices_open', (select count(*) from public.invoices where status = 'open'),
      'invoices_overdue', (select count(*) from public.invoices where status = 'open' and due_on < current_date),
      'overdue_zar', coalesce((select sum(amount_cents) from public.invoices where status = 'open' and due_on < current_date), 0) / 100,
      'oldest_overdue_days', coalesce((select current_date - min(due_on) from public.invoices where status = 'open' and due_on < current_date), 0)
    ))
    || jsonb_build_object('maintenance', jsonb_build_object(
      'items_open', (select count(*) from public.maintainer_items where status = 'open'),
      'items_high', (select count(*) from public.maintainer_items where status = 'open' and severity = 'high'),
      'oldest_open_days', coalesce((select floor(extract(epoch from now() - min(raised_at)) / 86400)::int from public.maintainer_items where status = 'open'), 0),
      'closed_30_days', (select count(*) from public.maintainer_items where status in ('done', 'dismissed', 'resolved') and closed_at > now() - interval '30 days')
    ))
$$;
