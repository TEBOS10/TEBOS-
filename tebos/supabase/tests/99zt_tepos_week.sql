-- The TEPOS week board: private, owner-only after two-step sign-in; opening a week twice adds nothing; changing the
-- plan never rewrites a week already opened; only the person marks done; reasons and dates for the rest.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99zt;
grant usage on schema t99zt to anon, authenticated;
create function t99zt.expect_error(p_sql text, p_expect text) returns void
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
create function t99zt.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t99zt to anon, authenticated;

select '9fa10000-0000-0000-0000-00000000000a' as owner, '9fa10000-0000-0000-0000-00000000000b' as other,
       '9fa10000-0000-0000-0000-0000000000c1' as shared_org,
       tebos_private.sa_today() - (extract(isodow from tebos_private.sa_today())::int - 1) as this_monday \gset
insert into auth.users (id, email, email_confirmed_at) values (:'owner', 'owner@p99zt.test', now()), (:'other', 'other@p99zt.test', now());
insert into public.organisations (id, name, slug) values (:'shared_org', 'Shared 99zt', 'shared-99zt');
insert into public.memberships (org_id, user_id, role) values (:'shared_org', :'owner', 'org_admin');

set role authenticated;
select set_config('request.jwt.claim.sub', :'owner', false);
select set_config('request.jwt.claims', '{"aal":"aal2"}', false);
select public.create_private_organisation('Week 99zt', 'week-99zt') as org \gset

-- ===========================================================================
-- The plan: seeding twice adds nothing (the unique keys do the work)
-- ===========================================================================
select t99zt.expect_error(format($$select public.tepos_open_week(%L, %L::date)$$, :'org', :'this_monday'), 'TEBOS_VALIDATION');
insert into public.tepos_plan_days (org_id, weekday, scene, focus, lens, deliverable, saved_to)
  select :'org', d, 'Scene ' || d, 'Focus', 'income', 'Deliverable', 'This board' from generate_series(1, 7) d
  on conflict (org_id, weekday) do nothing;
insert into public.tepos_plan_items (org_id, weekday, position, title, lens, action, definition_of_done, est_minutes)
  select :'org', d, p, 'Task ' || d || '.' || p, 'income', 'Do it', 'It is done', 15 from generate_series(1, 7) d, generate_series(1, 2) p
  on conflict (org_id, weekday, position) do nothing;
insert into public.tepos_plan_days (org_id, weekday, scene, focus, lens, deliverable, saved_to)
  select :'org', d, 'Again ' || d, 'Focus', 'income', 'Deliverable', 'This board' from generate_series(1, 7) d
  on conflict (org_id, weekday) do nothing;
select t99zt.ok((select count(*) = 7 and bool_and(scene like 'Scene %') from public.tepos_plan_days where org_id = :'org'), 'seeding twice keeps one plan');
select t99zt.ok((select count(*) = 14 from public.tepos_plan_items where org_id = :'org'), 'and its fourteen items');

-- only in a private organisation, never with client details or secrets
select t99zt.expect_error(format($$insert into public.tepos_plan_days (org_id, weekday, scene, focus, lens, deliverable, saved_to) values (%L, 1, 'x', 'x', 'income', 'x', 'x')$$, :'shared_org'), 'TEBOS_PERMISSION_DENIED');
select t99zt.expect_error(format($$update public.tepos_plan_items set action = 'Call 082 555 1234 about the flat' where org_id = %L and weekday = 1 and position = 1$$, :'org'), 'TEBOS_VALIDATION');
select t99zt.expect_error(format($$update public.tepos_plan_items set action = 'our password: hunter22' where org_id = %L and weekday = 1 and position = 1$$, :'org'), 'TEBOS_VALIDATION');

-- ===========================================================================
-- Opening the week: twice adds nothing; only Mondays
-- ===========================================================================
select t99zt.expect_error(format($$select public.tepos_open_week(%L, %L::date)$$, :'org', (:'this_monday'::date + 1)), 'TEBOS_VALIDATION');
select public.tepos_open_week(:'org', :'this_monday') as week \gset
select t99zt.ok(public.tepos_open_week(:'org', :'this_monday') = :'week', 'opening again returns the same week');
select t99zt.ok((select count(*) = 1 from public.tepos_weeks where org_id = :'org'), 'one week');
select t99zt.ok((select count(*) = 7 from public.tepos_week_days where week_id = :'week'), 'seven days');
select t99zt.ok((select count(*) = 14 from public.tepos_week_tasks where week_id = :'week'), 'fourteen tasks, not twenty-eight');
select t99zt.ok((select bool_and(status = 'not_started' and completed_at is null) from public.tepos_week_tasks where week_id = :'week'),
  'every task starts not started: nothing is done because its time has passed');
select t99zt.ok((select min(local_date) = :'this_monday'::date and max(local_date) = :'this_monday'::date + 6 from public.tepos_week_tasks where week_id = :'week'),
  'the tasks run Monday to Sunday, in South African dates');
-- the snapshot is the server's: the owner can't write a week or its days directly
select t99zt.expect_error(format($$insert into public.tepos_weeks (org_id, week_start) values (%L, %L::date + 7)$$, :'org', :'this_monday'), '42501');

-- ===========================================================================
-- Working a task
-- ===========================================================================
select id as t1 from public.tepos_week_tasks where week_id = :'week' and title = 'Task 1.1' \gset
select id as t2 from public.tepos_week_tasks where week_id = :'week' and title = 'Task 1.2' \gset
update public.tepos_week_tasks set status = 'in_progress' where id = :'t1';
update public.tepos_week_tasks set status = 'done', evidence_note = 'Pipeline updated' where id = :'t1';
select t99zt.ok((select completed_by = :'owner' and completed_at is not null from public.tepos_week_tasks where id = :'t1'), 'done records who and when');
select t99zt.expect_error(format($$update public.tepos_week_tasks set status = 'skipped' where id = %L$$, :'t1'), 'TEBOS_ILLEGAL_TRANSITION');
select t99zt.expect_error(format($$update public.tepos_week_tasks set status = 'blocked' where id = %L$$, :'t2'), 'TEBOS_VALIDATION');
select t99zt.expect_error(format($$update public.tepos_week_tasks set status = 'deferred', status_reason = 'Agency overran' where id = %L$$, :'t2'), 'TEBOS_VALIDATION');
select t99zt.expect_error(format($$update public.tepos_week_tasks set status = 'deferred', status_reason = 'Agency overran', defer_until = %L::date - 1 where id = %L$$, tebos_private.sa_today(), :'t2'), 'TEBOS_VALIDATION');
update public.tepos_week_tasks set status = 'deferred', status_reason = 'Agency overran', defer_until = tebos_private.sa_today() + 1, owner_label = 'Me' where id = :'t2';
select t99zt.ok((select status = 'deferred' and defer_until = tebos_private.sa_today() + 1 from public.tepos_week_tasks where id = :'t2'), 'a deferral keeps its reason and date');
select t99zt.expect_error(format($$update public.tepos_week_tasks set output_link = 'javascript:alert(1)' where id = %L$$, :'t2'), '23514');
select t99zt.expect_error(format($$update public.tepos_week_tasks set completed_at = now() where id = %L$$, :'t2'), '42501');

-- the server can open a week but never tick a task
reset role;
select set_config('request.jwt.claim.sub', '', false);
select t99zt.expect_error(format($$update public.tepos_week_tasks set status = 'done' where id = %L$$, :'t2'), 'TEBOS_PERMISSION_DENIED');
set role authenticated;
select set_config('request.jwt.claim.sub', :'owner', false);

-- closing the day
select id as mon from public.tepos_week_days where week_id = :'week' and weekday = 1 \gset
select id as sun from public.tepos_week_days where week_id = :'week' and weekday = 7 \gset
update public.tepos_week_days set outcomes = 'Two leads moved', learning = 'Book viewings before noon' where id = :'mon'
  and local_date <= tebos_private.sa_today();
select t99zt.ok((select (closed_at is not null) = (local_date <= tebos_private.sa_today()) from public.tepos_week_days where id = :'mon'), 'a day closes with its outcomes');
-- a future day can't be closed in advance (checked whenever Sunday is still ahead)
select t99zt.expect_error(format($$update public.tepos_week_days set outcomes = 'Pretend' where id = %L$$, :'sun'), 'TEBOS_VALIDATION')
  where (select local_date > tebos_private.sa_today() from public.tepos_week_days where id = :'sun');
select t99zt.expect_error(format($$update public.tepos_week_days set scene = 'Rewritten' where id = %L$$, :'mon'), '42501');

-- ===========================================================================
-- The plan changes; this week's record doesn't, and next week gets the new plan
-- ===========================================================================
update public.tepos_plan_items set title = 'Renamed' where org_id = :'org' and weekday = 1 and position = 1;
insert into public.tepos_plan_items (org_id, weekday, position, title, lens, action, definition_of_done, est_minutes)
  values (:'org', 3, 3, 'New Wednesday task', 'impact', 'Do it', 'Done', 30);
select t99zt.ok((select title = 'Task 1.1' and status = 'done' from public.tepos_week_tasks where id = :'t1'), 'the week keeps what it was');
select public.tepos_open_week(:'org', :'this_monday'::date + 7) as week2 \gset
select t99zt.ok((select count(*) = 15 from public.tepos_week_tasks where week_id = :'week2'), 'next week has the new plan');
select t99zt.ok((select count(*) = 1 from public.tepos_week_tasks where week_id = :'week2' and title = 'Renamed'), 'with the renamed task');
select t99zt.ok((select count(*) = 14 from public.tepos_week_tasks where week_id = :'week'), 'this week is untouched until it is opened again');
select public.tepos_open_week(:'org', :'this_monday') \gset
select t99zt.ok((select count(*) = 15 from public.tepos_week_tasks where week_id = :'week'), 'opening again adds the one new item, nothing else');
-- deleting a template item leaves the week's tasks in place
delete from public.tepos_plan_items where org_id = :'org' and weekday = 3 and position = 3;
select t99zt.ok((select count(*) = 15 and count(plan_item_id) = 14 from public.tepos_week_tasks where week_id = :'week'), 'history survives the template');

-- ===========================================================================
-- Nobody else, and not without two-step sign-in
-- ===========================================================================
select set_config('request.jwt.claims', '{"aal":"aal1"}', false);
select t99zt.ok((select count(*) = 0 from public.tepos_week_tasks), 'without two-step sign-in, nothing is visible');
select t99zt.expect_error(format($$select public.tepos_open_week(%L, %L::date + 14)$$, :'org', :'this_monday'), 'TEBOS_PERMISSION_DENIED');
select set_config('request.jwt.claims', '{"aal":"aal2"}', false);
select set_config('request.jwt.claim.sub', :'other', false);
select t99zt.ok((select count(*) = 0 from public.tepos_week_tasks), 'another person sees nothing');
select t99zt.expect_error(format($$select public.tepos_open_week(%L, %L::date + 14)$$, :'org', :'this_monday'), 'TEBOS_PERMISSION_DENIED');

reset role;
select t99zt.ok((select count(*) > 0 from public.audit_events where entity_type = 'tepos_week_tasks'), 'the board is on the (redacted) audit trail');
