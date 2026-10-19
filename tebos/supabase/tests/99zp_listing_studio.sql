-- The Listing studio: a listing's advert facts. Optional, stated by the founder; counts 0-99, areas zero or more,
-- at most six short highlights; no contact details, ID numbers or secrets.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99zp;
grant usage on schema t99zp to anon, authenticated;
create function t99zp.expect_error(p_sql text, p_expect text) returns void
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
create function t99zp.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t99zp to anon, authenticated;

select '9f9d0000-0000-0000-0000-00000000000a' as owner, '9f9d0000-0000-0000-0000-00000000000b' as other,
       '9f9d0000-0000-0000-0000-0000000000d2' as shared_org \gset
insert into auth.users (id, email, email_confirmed_at) values (:'owner', 'owner@p99zp.test', now()), (:'other', 'other@p99zp.test', now());
insert into public.organisations (id, name, slug) values (:'shared_org', 'Shared 99zp', 'shared-99zp');
insert into public.memberships (org_id, user_id, role) values (:'shared_org', :'owner', 'org_admin');

set role authenticated;
select set_config('request.jwt.claim.sub', :'owner', false);
select set_config('request.jwt.claims', '{"aal":"aal2"}', false);
select public.create_private_organisation('Vault 99zp', 'vault-99zp') as vault \gset
insert into public.agent_listings (org_id, label, next_step, next_step_on) values (:'vault', '3-bed house, Erf 512', 'Mandate', current_date) returning id as deal \gset

-- ===========================================================================
-- Facts for the advert
-- ===========================================================================
update public.agent_listings set property_kind = 'commercial', suburb = 'Westdene', city = 'Bloemfontein', bathrooms = 1, kitchens = 1,
  offices = 4, parking = 6, floor_m2 = 320, highlights = array['Secure parking', 'Walking distance to the CBD'] where id = :'deal';
select t99zp.ok((select offices = 4 and cardinality(highlights) = 2 from public.agent_listings where id = :'deal'), 'facts are kept');
select t99zp.expect_error(format($$update public.agent_listings set property_kind = 'castle' where id = %L$$, :'deal'), '23514');
select t99zp.expect_error(format($$update public.agent_listings set offices = 100 where id = %L$$, :'deal'), '23514');
select t99zp.expect_error(format($$update public.agent_listings set bedrooms = -1 where id = %L$$, :'deal'), '23514');
select t99zp.expect_error(format($$update public.agent_listings set floor_m2 = -5 where id = %L$$, :'deal'), '23514');
select t99zp.expect_error(format($$update public.agent_listings set highlights = array['a','b','c','d','e','f','g'] where id = %L$$, :'deal'), '23514');
select t99zp.expect_error(format($$update public.agent_listings set highlights = array[%L] where id = %L$$, repeat('x', 61), :'deal'), 'TEBOS_VALIDATION');
select t99zp.expect_error(format($$update public.agent_listings set highlights = array['Call 082 555 1234'] where id = %L$$, :'deal'), 'TEBOS_VALIDATION');
select t99zp.expect_error(format($$update public.agent_listings set suburb = 'jo@example.co.za' where id = %L$$, :'deal'), 'TEBOS_VALIDATION');
select t99zp.expect_error(format($$update public.agent_listings set city = 'password: hunter2' where id = %L$$, :'deal'), 'TEBOS_VALIDATION');
-- a password-only session sees nothing of it
select set_config('request.jwt.claims', '{"aal":"aal1"}', false);
select t99zp.ok((select count(*) = 0 from public.agent_listings), 'a password-only session sees nothing');

reset role;
