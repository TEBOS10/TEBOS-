-- The database refuses to destroy data on its own say-so.
--
-- TEBOS is built and shipped largely without a person at the keyboard. Its
-- safety can't rest on whoever (or whatever) runs a migration being careful,
-- so the database itself refuses a statement that would lose recorded data:
--
--   * dropping a table, a column, a materialized view or a sequence in
--     public or tebos_private;
--   * dropping either schema, or tebos_guard (where this guard lives), or the
--     guard's functions (a cascade would take the guard with it);
--
-- unless the statement runs in a transaction that has declared, in so many
-- words, that the founder approved it:
--
--     set local tebos.allow_destructive = 'founder approved: <why>';
--
-- Rebuildable objects (constraints, policies, functions, triggers, indexes,
-- views, types) stay free to drop and re-create, which is how most changes
-- are made. The migration checks in CI refuse a migration that sets
-- tebos.allow_destructive unless the founder has labelled its pull request.
--
-- This is a seatbelt, not a lock. Postgres runs no event trigger on commands
-- about event triggers, so the database owner can still drop or disable it on
-- purpose (the migration checks in CI refuse a migration that tries). What it
-- stops is data being lost by mistake, by a cascade, or by an unreviewed change.

create schema tebos_guard;
revoke all on schema tebos_guard from public;

create function tebos_guard.approved() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(current_setting('tebos.allow_destructive', true), '') like 'founder approved:%'
$$;

-- After a drop: refuse it if recorded data went with it.
create function tebos_guard.refuse_data_loss() returns event_trigger
language plpgsql set search_path = '' as $$
declare
  r record;
begin
  if tebos_guard.approved() then return; end if;
  for r in select * from pg_event_trigger_dropped_objects() loop
    if (r.schema_name in ('public', 'tebos_private')
          and r.object_type in ('table', 'table column', 'materialized view', 'sequence')
          and not r.is_temporary)
       or (r.object_type = 'schema' and r.object_name in ('public', 'tebos_private', 'tebos_guard')) then
      raise exception 'TEBOS refuses to drop % %: recorded data would be lost', r.object_type, r.object_identity
        using errcode = '42501', hint = 'TEBOS_DESTRUCTIVE_BLOCKED',
              detail = 'A founder-approved migration must first run: set local tebos.allow_destructive = ''founder approved: <why>''';
    end if;
  end loop;
end $$;

-- Before a command: refuse to drop the guard's schema or functions, or a guarded
-- schema (a cascade would take the guard with it before it could object).
create function tebos_guard.refuse_unguarding() returns event_trigger
language plpgsql set search_path = '' as $$
declare
  q text := lower(current_query());
begin
  if tebos_guard.approved() then return; end if;
  if (tg_tag = 'DROP SCHEMA' and q ~ '(tebos_guard|tebos_private|\mpublic\M)')
     or (tg_tag in ('DROP FUNCTION', 'ALTER FUNCTION', 'ALTER SCHEMA') and q ~ 'tebos_guard') then
    raise exception 'TEBOS refuses to % without the founder''s approval: it would remove the guard against data loss', lower(tg_tag)
      using errcode = '42501', hint = 'TEBOS_DESTRUCTIVE_BLOCKED',
            detail = 'A founder-approved migration must first run: set local tebos.allow_destructive = ''founder approved: <why>''';
  end if;
end $$;

create event trigger tebos_refuse_data_loss on sql_drop
  execute function tebos_guard.refuse_data_loss();
create event trigger tebos_refuse_unguarding on ddl_command_start
  when tag in ('DROP SCHEMA', 'DROP FUNCTION', 'ALTER SCHEMA', 'ALTER FUNCTION')
  execute function tebos_guard.refuse_unguarding();
