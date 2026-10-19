-- Two-step sign-in: resilience records open only in a session that passed the
-- second step (aal2). The owner's password alone (aal1) reads and writes nothing.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99zg;
grant usage on schema t99zg to anon, authenticated;
create function t99zg.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
create function t99zg.refused(p_sql text) returns boolean
language plpgsql as $$
begin
  begin execute p_sql; exception when insufficient_privilege then return true; end;
  return false;
end $$;
grant execute on all functions in schema t99zg to anon, authenticated;

select '9f5f0000-0000-0000-0000-00000000000a' as owner \gset
insert into auth.users (id, email, email_confirmed_at) values (:'owner', 'owner@p99zg.test', now());

set role authenticated;
select set_config('request.jwt.claim.sub', :'owner', false);
select set_config('request.jwt.claims', '{"aal":"aal2"}', false);
select public.create_private_organisation('Vault 99zg', 'vault-99zg') as vault \gset
insert into public.res_money_items (org_id, entity, kind, label, amount, liquid) values (:'vault', 'personal', 'reserve', 'Savings', 1000, true);
select t99zg.ok((select count(*) = 1 from public.res_money_items), 'with two-step sign-in the owner reads');

-- the same person, password only
select set_config('request.jwt.claims', '{"aal":"aal1"}', false);
select t99zg.ok((select count(*) = 0 from public.res_money_items), 'without it, nothing is readable');
select t99zg.ok(t99zg.refused(format($$insert into public.res_money_items (org_id, entity, kind, label, amount, liquid) values (%L, 'personal', 'reserve', 'X', 1, true)$$, :'vault')),
  'without it, nothing can be added');
update public.res_money_items set amount = 1;
delete from public.res_money_items;

-- no claim at all is the same as password only
select set_config('request.jwt.claims', '', false);
select t99zg.ok((select count(*) = 0 from public.res_money_items), 'a session without an assurance level reads nothing');

select set_config('request.jwt.claims', '{"aal":"aal2"}', false);
select t99zg.ok((select count(*) = 1 and min(amount) = 1000 from public.res_money_items), 'untouched by the password-only session');

-- since tepos_two_step, the organisation itself is hidden too: TEPOS asks for the second step before anything
select set_config('request.jwt.claims', '{"aal":"aal1"}', false);
select t99zg.ok((select count(*) = 0 from public.organisations where id = :'vault'), 'without it, even the organisation is hidden');
reset role;
