-- Enquiries: anyone can submit one; nobody can read, change or forge one
-- through the API.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t6;
grant usage on schema t6 to anon, authenticated;
create function t6.expect_error(p_sql text, p_expect text) returns void
language plpgsql as $$
declare v_state text; v_msg text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    if v_state <> p_expect then
      raise exception 'expected % but got % (%)', p_expect, v_state, v_msg;
    end if;
    return;
  end;
  raise exception 'expected % but statement succeeded: %', p_expect, p_sql;
end $$;
create function t6.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t6 to anon, authenticated;

set role anon;
insert into public.enquiries (plan, name, business, email, message)
  values ('equity', 'Lerato', 'Brightline Creative', 'lerato@brightline.example', 'We cannot pay fees yet');
-- invalid values are refused
select t6.expect_error($$insert into public.enquiries (plan, name, business, email) values ('platinum', 'A', 'B', 'a@b.co')$$, '23514');
select t6.expect_error($$insert into public.enquiries (plan, name, business, email) values ('starter', 'A', 'B', 'not-an-email')$$, '23514');
select t6.expect_error($$insert into public.enquiries (plan, name, business, email) values ('starter', ' ', 'B', 'a@b.co')$$, '23514');
-- a submission cannot set its own status or id
select t6.expect_error($$insert into public.enquiries (plan, name, business, email, status) values ('starter', 'A', 'B', 'a@b.co', 'closed')$$, '42501');
-- and nobody can read or change enquiries through the API
select t6.expect_error($$select * from public.enquiries$$, '42501');
select t6.expect_error($$update public.enquiries set status = 'closed'$$, '42501');
reset role;

set role authenticated;
select t6.expect_error($$select * from public.enquiries$$, '42501');
reset role;

select t6.ok((select count(*) = 1 and bool_and(status = 'new') from public.enquiries), 'one enquiry stored, status new');
