-- The agent's office, slice 2: documents and compliance per deal, and the FFC path. Only in the private
-- organisation, for its owner, after two-step sign-in; nothing identifies a person; a document is tracked, never
-- stored; received/checked/not-applicable and done each carry what they need; a step names its source.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99zn;
grant usage on schema t99zn to anon, authenticated;
create function t99zn.expect_error(p_sql text, p_expect text) returns void
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
create function t99zn.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t99zn to anon, authenticated;

select '9f9b0000-0000-0000-0000-00000000000a' as owner, '9f9b0000-0000-0000-0000-00000000000b' as other,
       '9f9b0000-0000-0000-0000-0000000000d2' as shared_org \gset
insert into auth.users (id, email, email_confirmed_at) values (:'owner', 'owner@p99zn.test', now()), (:'other', 'other@p99zn.test', now());
insert into public.organisations (id, name, slug) values (:'shared_org', 'Shared 99zn', 'shared-99zn');
insert into public.memberships (org_id, user_id, role) values (:'shared_org', :'owner', 'org_admin');

set role authenticated;
select set_config('request.jwt.claim.sub', :'owner', false);
select set_config('request.jwt.claims', '{"aal":"aal2"}', false);
select public.create_private_organisation('Vault 99zn', 'vault-99zn') as vault \gset
insert into public.agent_listings (org_id, label, next_step, next_step_on) values (:'vault', '3-bed house, Erf 512', 'Mandate', current_date) returning id as deal \gset

-- ===========================================================================
-- Deal documents
-- ===========================================================================
insert into public.agent_deal_items (org_id, listing_id, item, status) values (:'vault', :'deal', 'buyer_identity', 'requested') returning id as idoc \gset
select t99zn.expect_error(format($$insert into public.agent_deal_items (org_id, listing_id, item) values (%L, %L, 'buyer_identity')$$, :'vault', :'deal'), '23505');
select t99zn.expect_error(format($$insert into public.agent_deal_items (org_id, listing_id, item) values (%L, %L, 'made_up')$$, :'vault', :'deal'), '23514');
-- received needs its date; checked says where it is kept; not applicable says why
select t99zn.expect_error(format($$update public.agent_deal_items set status = 'received' where id = %L$$, :'idoc'), '23514');
update public.agent_deal_items set status = 'received', received_on = current_date where id = :'idoc';
select t99zn.expect_error(format($$update public.agent_deal_items set status = 'checked' where id = %L$$, :'idoc'), '23514');
update public.agent_deal_items set status = 'checked', kept_in = 'PropCtrl' where id = :'idoc';
select t99zn.expect_error(format($$insert into public.agent_deal_items (org_id, listing_id, item, status) values (%L, %L, 'gas_certificate', 'not_applicable')$$, :'vault', :'deal'), '23514');
insert into public.agent_deal_items (org_id, listing_id, item, status, reason) values (:'vault', :'deal', 'gas_certificate', 'not_applicable', 'No gas installation');
-- no contact details, ID numbers or secrets
select t99zn.expect_error(format($$update public.agent_deal_items set note = 'ID 8001015009087' where id = %L$$, :'idoc'), 'TEBOS_VALIDATION');
select t99zn.expect_error(format($$update public.agent_deal_items set kept_in = 'mail jo@example.co.za' where id = %L$$, :'idoc'), 'TEBOS_VALIDATION');
select t99zn.expect_error(format($$update public.agent_deal_items set note = 'password: hunter2' where id = %L$$, :'idoc'), 'TEBOS_VALIDATION');
-- an entry stays with its deal and document
select t99zn.expect_error(format($$update public.agent_deal_items set item = 'buyer_vat' where id = %L$$, :'idoc'), 'TEBOS_INPUT_FROZEN');
-- only in a private organisation
select t99zn.expect_error(format($$insert into public.agent_ffc_steps (org_id, title, source) values (%L, 'X', 'The PPRA')$$, :'shared_org'), 'TEBOS_PERMISSION_DENIED');

-- ===========================================================================
-- The FFC path
-- ===========================================================================
select t99zn.expect_error(format($$insert into public.agent_ffc_steps (org_id, title, source) values (%L, 'Pass the exam', '')$$, :'vault'), '23514');
insert into public.agent_ffc_steps (org_id, title, source) values (:'vault', 'Register on the PPRA portal', 'PPRA application form, section 13.1') returning id as step \gset
select t99zn.expect_error(format($$update public.agent_ffc_steps set status = 'done' where id = %L$$, :'step'), '23514');
select t99zn.expect_error(format($$update public.agent_ffc_steps set status = 'done', done_on = current_date where id = %L$$, :'step'), '23514');
update public.agent_ffc_steps set status = 'done', done_on = current_date, evidence = 'Portal confirmation in the agency file' where id = :'step';

-- ===========================================================================
-- Password-only sessions and other people see nothing; deleting the deal removes its checklist
-- ===========================================================================
select set_config('request.jwt.claims', '{"aal":"aal1"}', false);
select t99zn.ok((select count(*) = 0 from public.agent_deal_items) and (select count(*) = 0 from public.agent_ffc_steps), 'a password-only session sees nothing');
select set_config('request.jwt.claims', '{"aal":"aal2"}', false);
select set_config('request.jwt.claim.sub', :'other', false);
select t99zn.ok((select count(*) = 0 from public.agent_deal_items) and (select count(*) = 0 from public.agent_ffc_steps), 'another person sees nothing');
select set_config('request.jwt.claim.sub', :'owner', false);
select t99zn.ok(not exists (select 1 from public.audit_events where entity_type = 'agent_deal_items' and coalesce(after::text, '') like '%PropCtrl%'), 'the trail is redacted');
delete from public.agent_listings where id = :'deal';
select t99zn.ok((select count(*) = 0 from public.agent_deal_items), 'the checklist goes with its deal');

reset role;
