-- TEPOS opens only after two-step sign-in: a member of a TEPOS organisation counts as a member only in a
-- session that passed it (aal2), for the organisation, its memberships, its records and its audit trail.
-- TEBOS organisations are unchanged.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99zk;
grant usage on schema t99zk to anon, authenticated;
create function t99zk.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t99zk to anon, authenticated;

select '9f8a0000-0000-0000-0000-00000000000a' as owner, '9f8a0000-0000-0000-0000-0000000000e1' as enterprise,
       '9f8a0000-0000-0000-0000-0000000000e2' as client \gset
insert into auth.users (id, email, email_confirmed_at) values (:'owner', 'owner@p99zk.test', now());
-- a non-private TEPOS organisation (like Tidy Enterprise) and a TEBOS client organisation
insert into public.organisations (id, name, slug, app) values (:'enterprise', 'Enterprise 99zk', 'enterprise-99zk', 'tepos'), (:'client', 'Client 99zk', 'client-99zk', 'tebos');
insert into public.memberships (org_id, user_id, role) values (:'enterprise', :'owner', 'org_admin'), (:'client', :'owner', 'org_admin');
insert into public.property_cases (org_id, label, problem, objective, disposition_reason)
  values (:'enterprise', 'Block of flats, 99zk', 'underperforming_income', 'improve_cash_flow', 'Waiting for the rent roll before deciding');

set role authenticated;
select set_config('request.jwt.claim.sub', :'owner', false);

-- a password-only session: TEPOS shows nothing; TEBOS is unchanged
select set_config('request.jwt.claims', '{"aal":"aal1"}', false);
select t99zk.ok((select count(*) = 0 from public.organisations where id = :'enterprise'), 'the TEPOS organisation is hidden');
select t99zk.ok((select count(*) = 0 from public.memberships where org_id = :'enterprise'), 'so is the membership');
select t99zk.ok((select count(*) = 0 from public.property_cases), 'and its property cases');
select t99zk.ok((select count(*) = 0 from public.audit_events where org_id = :'enterprise'), 'and its audit trail');
update public.property_cases set label = 'Taken' where org_id = :'enterprise';
select t99zk.ok((select count(*) = 1 from public.organisations where id = :'client'), 'a TEBOS organisation still opens with a password');

-- after the second step, everything is there
select set_config('request.jwt.claims', '{"aal":"aal2"}', false);
select t99zk.ok((select count(*) = 1 from public.organisations where id = :'enterprise'), 'the TEPOS organisation opens after two-step');
select t99zk.ok((select label = 'Block of flats, 99zk' from public.property_cases where org_id = :'enterprise'), 'its cases open, untouched by the password-only session');
select t99zk.ok((select count(*) = 1 from public.organisations where id = :'client'), 'and TEBOS still opens');

reset role;
