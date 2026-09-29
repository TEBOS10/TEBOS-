-- TEBOS's company numbers: only TEBOS's server reads them, and only TEBOS's
-- own organisation can hold the connector that records them.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t95;
grant usage on schema t95 to anon, authenticated;
create function t95.expect_error(p_sql text, p_expect text) returns void
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
create function t95.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t95 to anon, authenticated;

select '95000000-0000-0000-0000-0000000000a1' as admin \gset
insert into auth.users (id, email, email_confirmed_at) values (:'admin', 'admin95@client.test', now());
insert into public.organisations (id, name, slug) values ('95000000-0000-0000-0000-0000000000c1', 'A client', 'client-95');
insert into public.memberships (org_id, user_id, role) values ('95000000-0000-0000-0000-0000000000c1', :'admin', 'org_admin');
insert into public.businesses (id, org_id, name) values ('95000000-0000-0000-0000-0000000000b1', '95000000-0000-0000-0000-0000000000c1', 'A client');

-- the snapshot is the server's alone
set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
select t95.expect_error('select tebos_private.company_snapshot()', '42501');
-- a client's admin can't attach TEBOS's company numbers to their own business
select t95.expect_error($$insert into public.connection_instances (org_id, business_id, connector_key)
  values ('95000000-0000-0000-0000-0000000000c1', '95000000-0000-0000-0000-0000000000b1', 'tebos-company')$$, 'TEBOS_PERMISSION_DENIED');
reset role;
-- nor can TEBOS's server, for an organisation that isn't TEBOS's own
select t95.expect_error($$insert into public.connection_instances (org_id, business_id, connector_key)
  values ('95000000-0000-0000-0000-0000000000c1', '95000000-0000-0000-0000-0000000000b1', 'tebos-company')$$, 'TEBOS_PERMISSION_DENIED');
select t95.ok((select (tebos_private.company_snapshot() ->> 'schema_version') = '1'), 'the server reads the snapshot');
select t95.ok((select tebos_private.company_snapshot()::text !~ '@'), 'the snapshot holds no email addresses');
