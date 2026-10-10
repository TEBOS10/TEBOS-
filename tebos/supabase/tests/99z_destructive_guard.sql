\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99z;
create function t99z.expect_error(p_sql text, p_expect text) returns void
language plpgsql as $$
declare v_hint text; v_msg text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint, v_msg = message_text;
    if v_hint is distinct from p_expect then raise exception 'expected % but got % (%)', p_expect, v_hint, v_msg; end if;
    return;
  end;
  raise exception 'expected % but statement succeeded: %', p_expect, p_sql;
end $$;
create function t99z.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;

-- A scratch table to try destroying, in public, holding a row of "data".
create table public.t99z_scratch (id int primary key, note text, extra text);
insert into public.t99z_scratch values (1, 'recorded', 'x');

-- Data-losing drops are refused, even for the database owner.
select t99z.expect_error('drop table public.t99z_scratch', 'TEBOS_DESTRUCTIVE_BLOCKED');
select t99z.expect_error('alter table public.t99z_scratch drop column extra', 'TEBOS_DESTRUCTIVE_BLOCKED');
select t99z.expect_error('drop schema tebos_private cascade', 'TEBOS_DESTRUCTIVE_BLOCKED');
select t99z.expect_error('drop schema public cascade', 'TEBOS_DESTRUCTIVE_BLOCKED');
-- nor can the guard's schema or functions be dropped
select t99z.expect_error('drop schema tebos_guard cascade', 'TEBOS_DESTRUCTIVE_BLOCKED');
select t99z.expect_error('drop function tebos_guard.refuse_data_loss() cascade', 'TEBOS_DESTRUCTIVE_BLOCKED');
select t99z.ok(to_regnamespace('tebos_private') is not null and to_regnamespace('tebos_guard') is not null, 'the schemas are still there');
select t99z.ok((select count(*) = 1 from public.t99z_scratch), 'the data is still there');

-- A setting that merely exists is not approval; it has to say so.
begin;
set local tebos.allow_destructive = 'yes';
select t99z.expect_error('alter table public.t99z_scratch drop column extra', 'TEBOS_DESTRUCTIVE_BLOCKED');
rollback;

-- Rebuildable objects stay free to drop and re-create.
alter table public.t99z_scratch add constraint t99z_note check (note <> '');
alter table public.t99z_scratch drop constraint t99z_note;
create index t99z_idx on public.t99z_scratch (note);
drop index public.t99z_idx;
create policy t99z_p on public.t99z_scratch for select using (true);
drop policy t99z_p on public.t99z_scratch;

-- Other schemas (test scaffolding, extensions) are not guarded.
create table t99z.temp_table (id int);
drop table t99z.temp_table;

-- A founder-approved migration may drop, inside its own transaction only.
begin;
set local tebos.allow_destructive = 'founder approved: test of the escape hatch';
alter table public.t99z_scratch drop column extra;
drop table public.t99z_scratch;
commit;
select t99z.ok(to_regclass('public.t99z_scratch') is null, 'the approved drop happened');
select t99z.ok(coalesce(current_setting('tebos.allow_destructive', true), '') = '', 'and the approval did not outlive its transaction');

drop schema t99z cascade;
