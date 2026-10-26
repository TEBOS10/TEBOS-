-- The worker's heartbeat: only the server beats, with the database's clock; "never" is not "running"; a credential
-- in an error is withheld; only the owner (after two-step) or a platform admin reads the status; clients can't.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99zv;
grant usage on schema t99zv to anon, authenticated, service_role;
create function t99zv.expect_error(p_sql text, p_expect text) returns void
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
create function t99zv.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t99zv to anon, authenticated, service_role;

select '9fa30000-0000-0000-0000-00000000000a' as owner, '9fa30000-0000-0000-0000-00000000000b' as client,
       '9fa30000-0000-0000-0000-0000000000b1' as client_org \gset
insert into auth.users (id, email, email_confirmed_at) values (:'owner', 'owner@p99zv.test', now()), (:'client', 'c@c99zv.test', now());
insert into public.organisations (id, name, slug) values (:'client_org', 'Client 99zv', 'client-99zv');
insert into public.memberships (org_id, user_id, role) values (:'client_org', :'client', 'org_admin');

set role authenticated;
select set_config('request.jwt.claim.sub', :'owner', false);
select set_config('request.jwt.claims', '{"aal":"aal2"}', false);
select public.create_private_organisation('Heartbeat 99zv', 'heartbeat-99zv') as org \gset

-- earlier tests may have beaten; start from none
reset role;
delete from public.worker_heartbeats;

-- no beat yet: "never", not "running"
set role authenticated;
select t99zv.ok((select state = 'never' and last_beat_at is null from public.worker_status()), 'no beat reads as never');

-- a browser can't beat, or write or read the table
select t99zv.expect_error($$select public.worker_beat('fake', 'batch', now(), 0, null, '{}')$$, '42501');
select t99zv.expect_error($$insert into public.worker_heartbeats (worker_id, mode, started_at, last_beat_at) values ('fake', 'batch', now(), now())$$, '42501');
select t99zv.expect_error($$select * from public.worker_heartbeats$$, '42501');

-- the owner without two-step, and a client owner, can't read the status
select set_config('request.jwt.claims', '{"aal":"aal1"}', false);
select t99zv.expect_error($$select * from public.worker_status()$$, 'TEBOS_PERMISSION_DENIED');
select set_config('request.jwt.claim.sub', :'client', false);
select set_config('request.jwt.claims', '{"aal":"aal2"}', false);
select t99zv.expect_error($$select * from public.worker_status()$$, 'TEBOS_PERMISSION_DENIED');
set role anon;
select t99zv.expect_error($$select * from public.worker_status()$$, '42501');

-- the server beats: the time is the database's, a future start is refused, errors are counted
set role service_role;
select t99zv.expect_error($$select public.worker_beat('w1', 'batch', now() + interval '1 day', 0, null, '{}')$$, 'TEBOS_VALIDATION');
select t99zv.expect_error($$select public.worker_beat('w1', 'batch', now(), -1, null, '{}')$$, 'TEBOS_VALIDATION');
select public.worker_beat('w1', 'batch', now() - interval '2 minutes', 0, null, '{"sources":false}');
select public.worker_beat('w1', 'batch', now() - interval '2 minutes', 2, 'sources: Outlook sign-in failed (400)', '{"sources":true}');
reset role;
select t99zv.ok((select passes = 2 and errors = 2 and last_pass_errors = 2 and last_error like 'sources:%' and last_beat_at > now() - interval '1 minute'
                   and stages ->> 'sources' = 'true' from public.worker_heartbeats where worker_id = 'w1'), 'beats accumulate, stamped by the database');

-- a credential in an error is withheld
set role service_role;
select public.worker_beat('w1', 'batch', now(), 1, 'billing: auth failed with password: hunter22', '{}');
reset role;
select t99zv.ok((select last_error like '(error withheld%' and last_error not like '%hunter22%' from public.worker_heartbeats where worker_id = 'w1'), 'credential-like errors are withheld');

-- the owner reads: running now
set role authenticated;
select set_config('request.jwt.claim.sub', :'owner', false);
select set_config('request.jwt.claims', '{"aal":"aal2"}', false);
select t99zv.ok((select state = 'running' and minutes_since = 0 and mode = 'batch' and last_pass_errors = 1 from public.worker_status()), 'a fresh beat reads as running');

-- late and stopped, from the beat's age
reset role;
update public.worker_heartbeats set started_at = now() - interval '3 hours', last_beat_at = now() - interval '45 minutes';
set role authenticated;
select t99zv.ok((select state = 'late' and minutes_since = 45 from public.worker_status()), 'a 45-minute-old beat is late');
reset role;
update public.worker_heartbeats set last_beat_at = now() - interval '6 days', started_at = now() - interval '7 days';
set role authenticated;
select t99zv.ok((select state = 'stopped' from public.worker_status()), 'a six-day-old beat is stopped');

-- the newest worker decides, and workers silent for 30 days are pruned on the next beat
reset role;
insert into public.worker_heartbeats (worker_id, mode, started_at, last_beat_at) values ('ancient', 'continuous', now() - interval '40 days', now() - interval '40 days');
set role service_role;
select public.worker_beat('w2', 'continuous', now(), 0, null, '{}');
reset role;
select t99zv.ok((select count(*) = 0 from public.worker_heartbeats where worker_id = 'ancient'), 'old workers are pruned');
set role authenticated;
select t99zv.ok((select state = 'running' and mode = 'continuous' and last_pass_errors = 0 from public.worker_status()), 'the newest beat decides');

reset role;
delete from public.worker_heartbeats;
drop schema t99zv cascade;
