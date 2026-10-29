-- The Property Revenue Architect Platform is its own app: a landlord opens one account, which belongs to 'pra' only;
-- the slug is the database's; names carry no personal identifiers; property records stay isolated per account.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99zy;
grant usage on schema t99zy to anon, authenticated;
create function t99zy.expect_error(p_sql text, p_expect text) returns void
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
create function t99zy.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t99zy to anon, authenticated;

select '9fa60000-0000-0000-0000-00000000000a' as landlord, '9fa60000-0000-0000-0000-00000000000b' as other \gset
insert into auth.users (id, email, email_confirmed_at) values (:'landlord', 'l@p99zy.test', now()), (:'other', 'o@p99zy.test', now());

-- signed out: nothing
set role anon;
select t99zy.expect_error($$select public.create_pra_account('Anonymous')$$, '42501');

set role authenticated;
select set_config('request.jwt.claim.sub', :'landlord', false);
select t99zy.expect_error($$select public.create_pra_account('x')$$, 'TEBOS_VALIDATION');
select t99zy.expect_error($$select public.create_pra_account('Call 082 555 1234')$$, 'TEBOS_VALIDATION');
select public.create_pra_account('Mokoena Properties 99zy') as acct \gset
select t99zy.ok((select app = 'pra' and slug ~ '^pra-[0-9a-f]{12}$' from public.organisations where id = :'acct'), 'the account is the platform''s, with the database''s slug');
select t99zy.ok((select role = 'org_admin' from public.memberships where org_id = :'acct' and user_id = :'landlord'), 'the landlord owns it');
-- one account per person
select t99zy.expect_error($$select public.create_pra_account('A second account')$$, 'TEBOS_VALIDATION');

-- the landlord works their own property; another landlord sees nothing of it
insert into public.property_cases (org_id, label, problem, objective, disposition_reason)
  values (:'acct', 'House in Mamelodi', 'underperforming_income', 'improve_cash_flow', 'The owner is tracking this property to improve it.') returning id as prop \gset
select set_config('request.jwt.claim.sub', :'other', false);
select public.create_pra_account('Other landlord 99zy') as acct2 \gset
select t99zy.ok((select count(*) = 0 from public.property_cases where id = :'prop'), 'another landlord sees nothing');
select t99zy.expect_error(format($$insert into public.property_cases (org_id, label, problem, objective, disposition_reason) values (%L, 'Intrusion', 'underutilised', 'long_term_value', 'Writing into another landlord''s account.')$$, :'acct'), '42501');

-- an organisation can't move between apps from the browser
select t99zy.expect_error(format($$update public.organisations set app = 'tebos' where id = %L$$, :'acct2'), '42501');
reset role;
select t99zy.ok((select app = 'pra' from public.organisations where id = :'acct2'), 'the app an account belongs to doesn''t change from the browser');
select t99zy.expect_error($$insert into public.organisations (name, slug, app) values ('Bad app', 'bad-app-99zy', 'other')$$, '23514');
drop schema t99zy cascade;
