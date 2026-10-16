-- Strategic Resilience, slice 1: a private organisation has one member, its
-- owner; resilience records live only there; money items follow their rules
-- (unknown is not zero, reliable income is verified, trading and lump sums are
-- speculative, no secrets); the audit trail is redacted.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99zf;
grant usage on schema t99zf to anon, authenticated;
create function t99zf.expect_error(p_sql text, p_expect text) returns void
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
create function t99zf.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t99zf to anon, authenticated;

select '9f4f0000-0000-0000-0000-00000000000a' as owner, '9f4f0000-0000-0000-0000-00000000000b' as other,
       '9f4f0000-0000-0000-0000-0000000000d2' as shared_org \gset
insert into auth.users (id, email, email_confirmed_at) values
  (:'owner', 'owner@p99zf.test', now()), (:'other', 'other@p99zf.test', now());
insert into public.organisations (id, name, slug) values (:'shared_org', 'Shared 99zf', 'shared-99zf');
insert into public.memberships (org_id, user_id, role) values (:'shared_org', :'owner', 'org_admin'), (:'shared_org', :'other', 'org_admin');

set role authenticated;
select set_config('request.jwt.claim.sub', :'owner', false);
-- signed in with two-step sign-in (99zg covers sessions without it)
select set_config('request.jwt.claims', '{"aal":"aal2"}', false);

-- ===========================================================================
-- A private organisation: one member, its owner, and it stays private
-- ===========================================================================
select public.create_private_organisation('Vault 99zf', 'vault-99zf') as vault \gset
select t99zf.ok((select private from public.organisations where id = :'vault'), 'created private');
select t99zf.ok((select count(*) = 1 and bool_and(user_id = :'owner' and role = 'org_admin') from public.memberships where org_id = :'vault'),
  'the creator is the only member, as admin');
select t99zf.expect_error(format($$insert into public.memberships (org_id, user_id, role) values (%L, %L, 'viewer')$$, :'vault', :'other'), 'TEBOS_PERMISSION_DENIED');
select t99zf.expect_error(format($$insert into public.memberships (org_id, user_id, role) values (%L, %L, 'org_admin')$$, :'vault', :'other'), 'TEBOS_PERMISSION_DENIED');
select t99zf.expect_error(format($$update public.memberships set role = 'viewer' where org_id = %L$$, :'vault'), 'TEBOS_PERMISSION_DENIED');
select t99zf.expect_error(format($$select public.create_invitation(%L, 'friend@p99zf.test', 'viewer')$$, :'vault'), 'TEBOS_PERMISSION_DENIED');
select t99zf.expect_error(format($$update public.organisations set private = false where id = %L$$, :'vault'), '42501'); -- not even a grant

reset role;
-- even with full rights: the flag is frozen and a second member is refused
select t99zf.expect_error(format($$update public.organisations set private = false where id = %L$$, :'vault'), 'TEBOS_TENANT_KEY_FROZEN');
select t99zf.expect_error(format($$insert into public.memberships (org_id, user_id, role) values (%L, %L, 'org_admin')$$, :'vault', :'other'), 'TEBOS_PERMISSION_DENIED');
select t99zf.expect_error(format($$insert into public.invitations (org_id, email, role, token_hash) values (%L, 'x@p99zf.test', 'viewer', 'h99zf')$$, :'vault'), 'TEBOS_PERMISSION_DENIED');
set role authenticated;
select set_config('request.jwt.claim.sub', :'owner', false);

-- ===========================================================================
-- Money items live only in a private organisation
-- ===========================================================================
select t99zf.expect_error(format($$insert into public.res_money_items (org_id, entity, kind, label, amount, liquid) values (%L, 'personal', 'reserve', 'Savings', 1000, true)$$, :'shared_org'), 'TEBOS_PERMISSION_DENIED');

insert into public.res_money_items (org_id, entity, kind, label, amount, cadence, created_by)
  values (:'vault', 'personal', 'essential_cost', 'Rent', 8000, 'monthly', :'other') returning id as rent, created_by as rent_by \gset
select t99zf.ok(:'rent_by' = :'owner', 'the creator is the signed-in person, whatever was sent');

-- unknown is not zero: an amount may be left out
insert into public.res_money_items (org_id, entity, kind, label, cadence) values (:'vault', 'personal', 'essential_cost', 'Medical aid', 'monthly');
select t99zf.ok((select amount is null from public.res_money_items where label = 'Medical aid'), 'an unknown amount stays unknown');
select t99zf.expect_error(format($$insert into public.res_money_items (org_id, entity, kind, label, amount, cadence) values (%L, 'personal', 'essential_cost', 'X', -1, 'monthly')$$, :'vault'), '23514');

-- fields belong to their kind
select t99zf.expect_error(format($$insert into public.res_money_items (org_id, entity, kind, label, amount) values (%L, 'personal', 'essential_cost', 'No cadence', 10)$$, :'vault'), '23514');
select t99zf.expect_error(format($$insert into public.res_money_items (org_id, entity, kind, label, amount, cadence) values (%L, 'personal', 'essential_cost', 'Once', 10, 'lump_sum')$$, :'vault'), '23514');
select t99zf.expect_error(format($$insert into public.res_money_items (org_id, entity, kind, label, amount) values (%L, 'personal', 'reserve', 'No liquidity', 10)$$, :'vault'), '23514');
select t99zf.expect_error(format($$insert into public.res_money_items (org_id, entity, kind, label, amount, cadence) values (%L, 'tebos', 'income', 'No stream', 10, 'monthly')$$, :'vault'), '23514');
select t99zf.expect_error(format($$insert into public.res_money_items (org_id, entity, kind, label, amount, liquid, stream) values (%L, 'personal', 'reserve', 'Stream on a reserve', 10, true, 'other')$$, :'vault'), '23514');

-- reliable income is verified; trading and lump sums are speculative
select t99zf.expect_error(format($$insert into public.res_money_items (org_id, entity, kind, label, amount, cadence, stream, reliability) values (%L, 'tebos', 'income', 'Retainer', 5000, 'monthly', 'tebos_retainer', 'reliable')$$, :'vault'), '23514');
select t99zf.expect_error(format($$insert into public.res_money_items (org_id, entity, kind, label, amount, cadence, stream, reliability, basis) values (%L, 'tebos', 'income', 'Retainer', 5000, 'monthly', 'tebos_retainer', 'reliable', 'verified')$$, :'vault'), '23514');
insert into public.res_money_items (org_id, entity, kind, label, amount, cadence, stream, reliability, basis, evidence_ref)
  values (:'vault', 'tebos', 'income', 'Retainer', 5000, 'monthly', 'tebos_retainer', 'reliable', 'verified', 'Signed agreement, Oct 2026') returning id as retainer \gset
select t99zf.expect_error(format($$insert into public.res_money_items (org_id, entity, kind, label, amount, cadence, stream, reliability, basis, evidence_ref) values (%L, 'tidy_capital', 'income', 'Trading', 9000, 'monthly', 'forex_trading', 'reliable', 'verified', 'statement')$$, :'vault'), '23514');
select t99zf.expect_error(format($$insert into public.res_money_items (org_id, entity, kind, label, amount, cadence, stream, reliability, basis, evidence_ref) values (%L, 'tidy_enterprise', 'income', 'Commission', 40000, 'lump_sum', 'agent_commission', 'reliable', 'verified', 'OTP')$$, :'vault'), '23514');
insert into public.res_money_items (org_id, entity, kind, label, amount, cadence, stream, reliability, due_on)
  values (:'vault', 'tidy_enterprise', 'income', 'Commission', 40000, 'lump_sum', 'agent_commission', 'speculative', current_date + 40);
select t99zf.expect_error(format($$update public.res_money_items set basis = 'stated' where id = %L$$, :'retainer'), '23514');

-- no secrets, in any text field
select t99zf.expect_error(format($$insert into public.res_money_items (org_id, entity, kind, label, amount, liquid, note) values (%L, 'personal', 'reserve', 'Bank', 10, true, 'password: hunter2')$$, :'vault'), 'TEBOS_VALIDATION');
select t99zf.expect_error(format($$update public.res_money_items set note = 'PIN = 1234' where id = %L$$, :'rent'), 'TEBOS_VALIDATION');
select t99zf.expect_error(format($$update public.res_money_items set evidence_ref = 'sk_live_abcdefghijkl' where id = %L$$, :'rent'), 'TEBOS_VALIDATION');
select t99zf.expect_error(format($$update public.res_money_items set label = 'ghp_abcdefghijklmnopqrstuvwxyz' where id = %L$$, :'rent'), 'TEBOS_VALIDATION');
select t99zf.expect_error(format($$update public.res_money_items set note = '-----BEGIN RSA PRIVATE KEY-----' where id = %L$$, :'rent'), 'TEBOS_VALIDATION');
select t99zf.expect_error(format($$update public.res_money_items set note = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig' where id = %L$$, :'rent'), 'TEBOS_VALIDATION');
update public.res_money_items set note = 'Pin the renewal date on the calendar; the password manager holds the login' where id = :'rent';

-- an item stays in its organisation
select t99zf.expect_error(format($$update public.res_money_items set org_id = %L where id = %L$$, :'shared_org', :'rent'), 'TEBOS_TENANT_KEY_FROZEN');

-- ===========================================================================
-- The audit trail is redacted: who, which fields, when; never the content
-- ===========================================================================
update public.res_money_items set amount = 8500 where id = :'rent';
select t99zf.ok((select after = jsonb_build_object('redacted', true, 'fields', jsonb_build_array('amount'))
                 and before = jsonb_build_object('redacted', true) and actor_id = :'owner'
                 from public.audit_events where entity_id = :'rent' and action = 'res_money_items.update' order by id desc limit 1),
  'the update records the changed field, not its value');
select t99zf.ok(not exists (select 1 from public.audit_events where entity_type = 'res_money_items'
                            and (coalesce(after::text, '') like '%8500%' or coalesce(after::text, '') like '%Rent%' or coalesce(before::text, '') like '%8000%')),
  'no amounts or labels in the trail');
delete from public.res_money_items where id = :'rent';
select t99zf.ok(exists (select 1 from public.audit_events where entity_id = :'rent' and action = 'res_money_items.delete' and after is null),
  'a deletion is recorded, without its content');

-- ===========================================================================
-- Only the owner sees or changes anything
-- ===========================================================================
select set_config('request.jwt.claim.sub', :'other', false);
select t99zf.ok((select count(*) = 0 from public.res_money_items), 'another person sees nothing');
select t99zf.ok((select count(*) = 0 from public.organisations where id = :'vault'), 'nor the organisation');
select t99zf.ok((select count(*) = 0 from public.audit_events where org_id = :'vault'), 'nor its trail');
update public.res_money_items set amount = 1 where org_id = :'vault';
select t99zf.expect_error(format($$insert into public.res_money_items (org_id, entity, kind, label, amount, liquid) values (%L, 'personal', 'reserve', 'X', 1, true)$$, :'vault'), '42501');
select set_config('request.jwt.claim.sub', :'owner', false);
select t99zf.ok((select amount = 5000 from public.res_money_items where id = :'retainer'), 'untouched by anyone else');

-- ordinary organisations are unchanged: still invite and add members
select t99zf.ok((select private = false from public.organisations where id = :'shared_org'), 'organisations are not private by default');

reset role;
