-- Public submissions are throttled per source and in total; the source is
-- stored hashed; sales staff's leads and direct connections aren't throttled.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99t;
grant usage on schema t99t to anon, authenticated;
create function t99t.expect_error(p_sql text, p_expect text) returns void
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
create function t99t.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
create function t99t.from_ip(p_ip text) returns void
language sql as $$ select set_config('request.headers', json_build_object('x-forwarded-for', p_ip || ', 10.0.0.1')::text, false) $$;
grant execute on all functions in schema t99t to anon, authenticated;

delete from tebos_private.public_submissions;

-- Self-check: five an hour from one address, then refused; another address is fine.
set role anon;
select t99t.from_ip('203.0.113.7');
select public.submit_self_check(array[1,1,1,1,1,1,1,1,1,1]) from generate_series(1, 5);
select t99t.expect_error($$select public.submit_self_check(array[1,1,1,1,1,1,1,1,1,1])$$, 'TEBOS_RATE_LIMITED');
select t99t.from_ip('198.51.100.20');
select t99t.ok((select public.submit_self_check(array[0,0,0,0,0,0,0,0,0,0]) = 0), 'another address can still submit');
-- An invalid submission is refused before it counts.
select t99t.expect_error($$select public.submit_self_check(array[9])$$, 'TEBOS_VALIDATION');
reset role;

select t99t.ok((select count(*) = 6 from tebos_private.public_submissions where kind = 'self_check'), 'six submissions counted');
select t99t.ok((select count(distinct source) = 2 from tebos_private.public_submissions), 'counted per source');
select t99t.ok(not exists (select 1 from tebos_private.public_submissions where source like '%203.0.113%'), 'the address is never stored raw');
select t99t.ok((select bool_and(length(source) = 64) from tebos_private.public_submissions), 'only its hash');

-- Nobody reads or writes the counts through the API.
set role anon;
select t99t.expect_error('select * from tebos_private.public_submissions', '42501');
select t99t.expect_error($$select tebos_private.throttle('enquiry', 100, 100)$$, '42501');
reset role;

-- Website enquiries: three an hour from one address.
set role anon;
select t99t.from_ip('192.0.2.44');
insert into public.enquiries (plan, name, business, email) select 'starter', 'Lead ' || g, 'Biz', 'lead' || g || '@example.co' from generate_series(1, 3) g;
select t99t.expect_error($$insert into public.enquiries (plan, name, business, email) values ('starter', 'Flood', 'Biz', 'flood@example.co')$$, 'TEBOS_RATE_LIMITED');
reset role;

-- The total cap holds even when every request comes from a new address.
insert into tebos_private.public_submissions (kind, source) select 'enquiry', 'spread-' || g from generate_series(1, 60) g;
set role anon;
select t99t.from_ip('192.0.2.99');
select t99t.expect_error($$insert into public.enquiries (plan, name, business, email) values ('starter', 'Spread', 'Biz', 'spread@example.co')$$, 'TEBOS_RATE_LIMITED');
reset role;

-- Sales staff's leads aren't throttled.
select '99700000-0000-0000-0000-00000000000a' as seller \gset
insert into auth.users (id, email, email_confirmed_at) values (:'seller', 'seller@tebos.test', now());
insert into public.platform_staff (user_id, role) values (:'seller', 'sales');
set role authenticated;
select set_config('request.jwt.claim.sub', :'seller', false);
select t99t.from_ip('192.0.2.99');
insert into public.enquiries (plan, name, business, email) values ('starter', 'Called in', 'Biz', 'called@example.co');
reset role;
select t99t.ok((select source = 'sales' from public.enquiries where email = 'called@example.co'), 'a sales lead goes in regardless');

-- Direct database connections (no request headers) aren't throttled.
select set_config('request.headers', '', false);
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select t99t.ok((select public.submit_self_check(array[1,1,1,1,1,1,1,1,1,1]) = 50), 'no headers, no throttle');
reset role;

-- Old counts are cleared as new ones arrive.
insert into tebos_private.public_submissions (kind, source, created_at) values ('self_check', 'old', now() - interval '2 days');
select t99t.from_ip('198.51.100.21');
set role anon;
select public.submit_self_check(array[1,1,1,1,1,1,1,1,1,1]);
reset role;
select t99t.ok(not exists (select 1 from tebos_private.public_submissions where source = 'old'), 'counts older than a day are cleared');
select set_config('request.headers', '', false);
