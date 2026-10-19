-- The agent's office, slice 1: listings and contacts live only in a private organisation, for its owner in a
-- two-step session; nothing open is left without a next step and date; closed records say how they ended;
-- no contact details, ID numbers or secrets; references are numbered and fixed; the trail is redacted.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99zj;
grant usage on schema t99zj to anon, authenticated;
create function t99zj.expect_error(p_sql text, p_expect text) returns void
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
create function t99zj.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t99zj to anon, authenticated;

select '9f5a0000-0000-0000-0000-00000000000a' as owner, '9f5a0000-0000-0000-0000-00000000000b' as other,
       '9f5a0000-0000-0000-0000-0000000000d2' as shared_org \gset
insert into auth.users (id, email, email_confirmed_at) values
  (:'owner', 'owner@p99zj.test', now()), (:'other', 'other@p99zj.test', now());
insert into public.organisations (id, name, slug) values (:'shared_org', 'Shared 99zj', 'shared-99zj');
insert into public.memberships (org_id, user_id, role) values (:'shared_org', :'owner', 'org_admin');

set role authenticated;
select set_config('request.jwt.claim.sub', :'owner', false);
select set_config('request.jwt.claims', '{"aal":"aal2"}', false);
select public.create_private_organisation('Vault 99zj', 'vault-99zj') as vault \gset

-- ===========================================================================
-- Only in a private organisation
-- ===========================================================================
select t99zj.expect_error(format($$insert into public.agent_listings (org_id, label, next_step, next_step_on) values (%L, 'House', 'Call', current_date)$$, :'shared_org'), 'TEBOS_PERMISSION_DENIED');

-- ===========================================================================
-- Listings: numbered, with a next step while open, and an outcome when closed
-- ===========================================================================
insert into public.agent_listings (org_id, label, price, next_step, next_step_on, created_by, ref)
  values (:'vault', '3-bed house, Erf 512 Northcliff', 1850000, 'Present the valuation', current_date + 2, :'other', 'X-9')
  returning id as l1, ref as l1_ref, created_by as l1_by \gset
select t99zj.ok(:'l1_ref' = 'L-001', 'the first listing is L-001, whatever was sent');
select t99zj.ok(:'l1_by' = :'owner', 'the creator is the signed-in person');
insert into public.agent_listings (org_id, label, deal, next_step, next_step_on) values (:'vault', '2-bed flat to let, Parkhurst', 'rental', 'Photos', current_date)
  returning ref as l2_ref \gset
select t99zj.ok(:'l2_ref' = 'L-002', 'then L-002');
select t99zj.expect_error(format($$insert into public.agent_listings (org_id, label) values (%L, 'No next step')$$, :'vault'), '23514');
select t99zj.expect_error(format($$insert into public.agent_listings (org_id, label, next_step) values (%L, 'No date', 'Call')$$, :'vault'), '23514');
select t99zj.expect_error(format($$insert into public.agent_listings (org_id, label, next_step, next_step_on, price) values (%L, 'Negative', 'Call', current_date, -1)$$, :'vault'), '23514');
-- unknown is not zero: the price may be left out
select t99zj.ok((select price is null from public.agent_listings where ref = 'L-002'), 'an unknown price stays unknown');

-- closing needs an outcome; then no next step is needed
select t99zj.expect_error(format($$update public.agent_listings set stage = 'withdrawn' where id = %L$$, :'l1'), '23514');
select stage_at as l1_stage_at from public.agent_listings where id = :'l1' \gset
update public.agent_listings set stage = 'mandate', mandate = 'sole', mandate_ends_on = current_date + 90 where id = :'l1';
update public.agent_listings set stage = 'lost', outcome = 'Owner chose another agency', next_step = null, next_step_on = null where id = :'l1';
select t99zj.ok((select stage = 'lost' from public.agent_listings where id = :'l1'), 'a closed listing needs no next step');
-- reopening needs a next step again
select t99zj.expect_error(format($$update public.agent_listings set stage = 'prospect' where id = %L$$, :'l1'), '23514');
-- the reference and creation are fixed; the stage time is set by the database
select t99zj.expect_error(format($$update public.agent_listings set ref = 'L-099' where id = %L$$, :'l1'), 'TEBOS_INPUT_FROZEN');
update public.agent_listings set stage_at = '2000-01-01' where id = :'l1';
select t99zj.ok((select stage_at > '2001-01-01' from public.agent_listings where id = :'l1'), 'the stage time can''t be rewritten');
select t99zj.expect_error(format($$update public.agent_listings set org_id = %L where id = %L$$, :'shared_org', :'l1'), 'TEBOS_TENANT_KEY_FROZEN');

-- ===========================================================================
-- Contacts: references by role, linked to a listing in the same organisation
-- ===========================================================================
select id as l2 from public.agent_listings where ref = 'L-002' \gset
insert into public.agent_contacts (org_id, role, label, listing_id, source, next_step, next_step_on)
  values (:'vault', 'buyer', 'First-time buyer, budget about R1.2m, pre-approved', null, 'portal', 'Book viewings', current_date - 1)
  returning id as b1, ref as b1_ref \gset
select t99zj.ok(:'b1_ref' = 'B-001', 'the first buyer is B-001');
insert into public.agent_contacts (org_id, role, label, listing_id, next_step, next_step_on)
  values (:'vault', 'landlord', 'Owner of L-002', :'l2', 'Sign the mandate', current_date) returning ref as o1_ref \gset
select t99zj.ok(:'o1_ref' = 'O-001', 'a landlord is O-001');
insert into public.agent_contacts (org_id, role, label, next_step, next_step_on)
  values (:'vault', 'buyer', 'Investor, cash', 'Send the shortlist', current_date + 3) returning ref as b2_ref \gset
select t99zj.ok(:'b2_ref' = 'B-002', 'the second buyer is B-002');
select t99zj.expect_error(format($$insert into public.agent_contacts (org_id, role, label) values (%L, 'buyer', 'No next step')$$, :'vault'), '23514');
select t99zj.expect_error(format($$insert into public.agent_contacts (org_id, role, label, next_step, next_step_on) values (%L, 'agent', 'X', 'Call', current_date)$$, :'vault'), '23514');
select t99zj.expect_error(format($$update public.agent_contacts set role = 'seller' where id = %L$$, :'b1'), 'TEBOS_INPUT_FROZEN');
select t99zj.expect_error(format($$update public.agent_contacts set stage = 'lost' where id = %L$$, :'b1'), '23514');
update public.agent_contacts set stage = 'completed', outcome = 'Bought L-002', next_step = null, next_step_on = null where id = :'b1';

-- ===========================================================================
-- No contact details, ID numbers or secrets, in any text field
-- ===========================================================================
select t99zj.expect_error(format($$update public.agent_contacts set note = 'mail jo@example.co.za' where id = %L$$, :'b1'), 'TEBOS_VALIDATION');
select t99zj.expect_error(format($$update public.agent_contacts set label = 'Call 082 555 1234' where id = %L$$, :'b1'), 'TEBOS_VALIDATION');
select t99zj.expect_error(format($$update public.agent_contacts set next_step = 'WhatsApp +27 82 555 1234', stage = 'new', next_step_on = current_date where id = %L$$, :'b1'), 'TEBOS_VALIDATION');
select t99zj.expect_error(format($$update public.agent_contacts set note = '0825551234' where id = %L$$, :'b1'), 'TEBOS_VALIDATION');
select t99zj.expect_error(format($$update public.agent_contacts set note = 'ID 8001015009087' where id = %L$$, :'b1'), 'TEBOS_VALIDATION');
select t99zj.expect_error(format($$update public.agent_listings set outcome = 'password: hunter2' where id = %L$$, :'l1'), 'TEBOS_VALIDATION');
-- ordinary property facts still go in: prices, erf numbers, dates, sizes
update public.agent_listings set note = 'Erf 512, 1 250 m², asking R1 850 000, rates R1 420 pm, valued 2026-10-15' where id = :'l1';

-- ===========================================================================
-- The trail is redacted; another person sees nothing; a session without two-step sees nothing
-- ===========================================================================
select t99zj.ok(not exists (select 1 from public.audit_events where entity_type in ('agent_listings', 'agent_contacts')
                            and (coalesce(after::text, '') like '%Northcliff%' or coalesce(after::text, '') like '%First-time%')),
  'no labels in the trail');
select t99zj.ok((select after -> 'fields' ? 'note' from public.audit_events where entity_id = :'l1' and action = 'agent_listings.update' order by id desc limit 1),
  'the trail records which field changed');

select set_config('request.jwt.claims', '{"aal":"aal1"}', false);
select t99zj.ok((select count(*) = 0 from public.agent_listings), 'a password-only session sees no listings');
select t99zj.ok((select count(*) = 0 from public.agent_contacts), 'nor contacts');
select t99zj.expect_error(format($$insert into public.agent_listings (org_id, label, next_step, next_step_on) values (%L, 'X', 'Call', current_date)$$, :'vault'), '42501');

select set_config('request.jwt.claims', '{"aal":"aal2"}', false);
select set_config('request.jwt.claim.sub', :'other', false);
select t99zj.ok((select count(*) = 0 from public.agent_listings) and (select count(*) = 0 from public.agent_contacts), 'another person sees nothing');
update public.agent_listings set label = 'Taken' where org_id = :'vault';
select set_config('request.jwt.claim.sub', :'owner', false);
select t99zj.ok((select label = '3-bed house, Erf 512 Northcliff' from public.agent_listings where id = :'l1'), 'untouched by anyone else');

-- deleting a listing keeps its contacts, unlinked
delete from public.agent_listings where id = :'l2';
select t99zj.ok((select listing_id is null from public.agent_contacts where ref = 'O-001'), 'the contact stays, unlinked');
select t99zj.ok(exists (select 1 from public.audit_events where entity_id = :'l2' and action = 'agent_listings.delete' and after is null),
  'a deletion is recorded, without its content');

reset role;
