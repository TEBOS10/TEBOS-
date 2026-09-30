-- The self-check: anyone submits; nobody reads answers back; the score is the
-- database's, never the browser's.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t98;
grant usage on schema t98 to anon, authenticated;
create function t98.expect_error(p_sql text, p_expect text) returns void
language plpgsql as $$
declare v_hint text; v_state text; v_msg text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint, v_state = returned_sqlstate, v_msg = message_text;
    if (p_expect like 'TEBOS_%' and v_hint is distinct from p_expect) or (p_expect not like 'TEBOS_%' and v_state <> p_expect) then
      raise exception 'expected % but got % / % (%)', p_expect, v_state, v_hint, v_msg;
    end if;
    return;
  end;
  raise exception 'expected % but statement succeeded: %', p_expect, p_sql;
end $$;
create function t98.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t98 to anon, authenticated;

set role anon;
select t98.ok((select public.submit_self_check(array[2,2,1,0,1,2,0,1,1,2], '21-50', 'ZA') = 60), 'the database computes the score');
select t98.ok((select public.submit_self_check(array[0,0,0,0,0,0,0,0,0,0]) = 0), 'size and region are optional');
select t98.expect_error($$select public.submit_self_check(array[2,2])$$, 'TEBOS_VALIDATION');
select t98.expect_error($$select public.submit_self_check(array[3,0,0,0,0,0,0,0,0,0])$$, 'TEBOS_VALIDATION');
select t98.expect_error($$select public.submit_self_check(array[0,0,0,0,0,0,0,0,0,0], 'huge', null)$$, '23514');
select t98.expect_error('select * from public.self_check_results', '42501');
select t98.expect_error($$insert into public.self_check_results (answers, score) values (array[0,0,0,0,0,0,0,0,0,0], 100)$$, '42501');
select t98.expect_error('select * from public.self_check_totals()', '42501');
reset role;

select t98.ok((select count(*) >= 2 from public.self_check_results), 'results are stored');
select t98.ok((select score = 60 from public.self_check_results where size_band = '21-50' limit 1), 'with the database''s score');
-- totals hide small groups
select t98.ok((select count(*) = 0 from public.self_check_totals() where size_band = '21-50'), 'groups under 10 are not shown');
-- TEBOS's board counts the attention
select t98.ok((select (tebos_private.company_snapshot() -> 'attention' ->> 'self_checks_7_days')::int >= 2), 'the board counts self-checks');
select t98.ok((select tebos_private.company_snapshot() ? 'revenue'), 'and still has every other section');
