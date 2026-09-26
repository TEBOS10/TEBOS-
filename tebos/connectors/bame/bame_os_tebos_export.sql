-- Applied to the BAME Supabase project (bame-os) as migration
-- "tebos_operational_export". Kept here because TEBOS depends on it.
--
-- TEBOS monitors BAME's operations without seeing anyone's personal data:
--   * tebos_export.operational_snapshot() returns counts and ages only:
--     no names, emails, phone numbers, notes or free text;
--   * the tebos_reader login can execute that one function and nothing
--     else. It has no table privileges and bypasses no row-level security.
--     Its password is set out of band and stored only in TEBOS's Vault.

create schema if not exists tebos_export;
revoke all on schema tebos_export from public;

create or replace function tebos_export.operational_snapshot() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'schema_version', 1,
    'taken_at', now(),
    'leads', (
      select jsonb_build_object(
        'total', count(*),
        'last_30_days', count(*) filter (where created_at > now() - interval '30 days'),
        'unassigned', count(*) filter (where assigned_department is null),
        'oldest_unassigned_days', floor(extract(epoch from now() - min(created_at) filter (where assigned_department is null)) / 86400),
        'by_status', coalesce((select jsonb_object_agg(k, n) from (select coalesce(status, 'none') k, count(*) n from public.leads group by 1) x), '{}'::jsonb)
      ) from public.leads),
    'diagnostics', (
      select jsonb_build_object(
        'total', count(*),
        'last_30_days', count(*) filter (where created_at > now() - interval '30 days'),
        'unassigned', count(*) filter (where assigned_department is null),
        'oldest_unassigned_days', floor(extract(epoch from now() - min(created_at) filter (where assigned_department is null)) / 86400),
        'by_status', coalesce((select jsonb_object_agg(k, n) from (select coalesce(status, 'none') k, count(*) n from public.diagnostics group by 1) x), '{}'::jsonb),
        'by_department', coalesce((select jsonb_object_agg(k, n) from (select coalesce(assigned_department, 'unassigned') k, count(*) n from public.diagnostics group by 1) x), '{}'::jsonb)
      ) from public.diagnostics),
    'case_progress', (
      select jsonb_build_object(
        'cases', count(distinct (case_table, case_id)),
        'items', count(*),
        'done', count(*) filter (where done)
      ) from public.case_deliverable_status),
    'deliverable_catalogue', coalesce((select jsonb_object_agg(k, n) from (select department k, count(*) n from public.deliverables group by 1) x), '{}'::jsonb),
    'notifications', (
      select jsonb_build_object(
        'unread', count(*) filter (where not read),
        'oldest_unread_days', floor(extract(epoch from now() - min(created_at) filter (where not read)) / 86400),
        'unread_by_department', coalesce((select jsonb_object_agg(k, n) from (select department k, count(*) n from public.notifications where not read group by 1) x), '{}'::jsonb)
      ) from public.notifications),
    'staff', jsonb_build_object(
      'by_department', coalesce((select jsonb_object_agg(k, n) from (select coalesce(department, 'none') k, count(*) n from public.profiles group by 1) x), '{}'::jsonb),
      'admins', (select count(*) from public.profiles where is_admin),
      'invites_pending', (select count(*) from public.staff_invites where accepted_at is null),
      'oldest_pending_invite_days', (select floor(extract(epoch from now() - min(created_at)) / 86400) from public.staff_invites where accepted_at is null)
    ),
    'players', jsonb_build_object(
      'by_status', coalesce((select jsonb_object_agg(k, n) from (select status k, count(*) n from public.players group by 1) x), '{}'::jsonb),
      'public_portfolios', (select count(*) from public.players where portfolio_public)
    ),
    'capital', (
      select jsonb_build_object(
        'entries', count(*),
        'last_30_days', count(*) filter (where created_at > now() - interval '30 days'),
        'totals_by_type', coalesce((select jsonb_object_agg(k, t) from (select entry_type k, sum(amount) t from public.capital_ledger group by 1) x), '{}'::jsonb)
      ) from public.capital_ledger)
  )
$$;
revoke all on function tebos_export.operational_snapshot() from public, anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'tebos_reader') then
    create role tebos_reader with login nobypassrls connection limit 3;
  end if;
end $$;
comment on role tebos_reader is 'TEBOS operations monitor: may only execute tebos_export.operational_snapshot().';
alter role tebos_reader set statement_timeout = '15s';
alter role tebos_reader set search_path = '';
grant usage on schema tebos_export to tebos_reader;
grant execute on function tebos_export.operational_snapshot() to tebos_reader;
