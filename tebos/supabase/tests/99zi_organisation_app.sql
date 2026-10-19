-- Each organisation belongs to TEBOS or TEPOS; private ones always to TEPOS; the apps can't move them.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99zi;
create function t99zi.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
create function t99zi.refused(p_sql text) returns boolean
language plpgsql as $$
begin
  begin execute p_sql; exception when check_violation or insufficient_privilege then return true; end;
  return false;
end $$;
grant usage on schema t99zi to authenticated;
grant execute on all functions in schema t99zi to authenticated;

insert into auth.users (id, email) values ('9f7f0000-0000-0000-0000-00000000000a', 'owner@p99zi.test');
insert into public.organisations (id, name, slug) values ('9f7f0000-0000-0000-0000-0000000000d1', 'Client 99zi', 'client-99zi');
select t99zi.ok((select app = 'tebos' from public.organisations where slug = 'client-99zi'), 'TEBOS by default');
select t99zi.ok(t99zi.refused($$insert into public.organisations (name, slug, private, app) values ('X', 'x-99zi', true, 'tebos')$$), 'a private organisation is never TEBOS''s');

set role authenticated;
select set_config('request.jwt.claim.sub', '9f7f0000-0000-0000-0000-00000000000a', false);
-- TEPOS organisations open only after two-step sign-in (99zk)
select set_config('request.jwt.claims', '{"aal":"aal2"}', false);
select public.create_private_organisation('Vault 99zi', 'vault-99zi') as vault \gset
select t99zi.ok((select app = 'tepos' and private from public.organisations where id = :'vault'), 'a private organisation is created in TEPOS');
select t99zi.ok(t99zi.refused(format($$update public.organisations set app = 'tebos' where id = %L$$, :'vault')), 'the apps can''t move it');
reset role;

-- a client's web app address is https only
insert into public.businesses (org_id, name, app_url) values ('9f7f0000-0000-0000-0000-0000000000d1', 'Client 99zi', 'https://client.example/staff');
select t99zi.ok(t99zi.refused($$update public.businesses set app_url = 'http://client.example' where name = 'Client 99zi'$$), 'not plain http');
select t99zi.ok(t99zi.refused($$update public.businesses set app_url = 'javascript:alert(1)' where name = 'Client 99zi'$$), 'not a script');
