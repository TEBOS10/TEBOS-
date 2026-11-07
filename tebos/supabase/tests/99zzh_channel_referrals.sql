-- Channel referrals (ADR 0025): private and owner-only; consent before anything moves; Real Estate Assist needs its
-- written arrangement and Tidy Enterprise needs the agency's written permission before an introduction; fees are
-- recorded as terms, never amounts; no contact details; the destination and consent are fixed once used.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99zzh;
grant usage on schema t99zzh to anon, authenticated;
create function t99zzh.expect_error(p_sql text, p_expect text) returns void
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
create function t99zzh.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t99zzh to anon, authenticated;

select '9f5b0000-0000-0000-0000-00000000000a' as owner, '9f5b0000-0000-0000-0000-00000000000b' as other,
       '9f5b0000-0000-0000-0000-0000000000d2' as shared_org \gset
insert into auth.users (id, email, email_confirmed_at) values
  (:'owner', 'owner@p99zzh.test', now()), (:'other', 'other@p99zzh.test', now());
insert into public.organisations (id, name, slug) values (:'shared_org', 'Shared 99zzh', 'shared-99zzh');
insert into public.memberships (org_id, user_id, role) values (:'shared_org', :'owner', 'org_admin');

set role authenticated;
select set_config('request.jwt.claim.sub', :'owner', false);
select set_config('request.jwt.claims', '{"aal":"aal2"}', false);
select public.create_private_organisation('Vault 99zzh', 'vault-99zzh') as vault \gset
select public.create_private_organisation('Other vault 99zzh', 'other-vault-99zzh') as vault2 \gset

insert into public.agent_contacts (org_id, role, label, next_step, next_step_on)
  values (:'vault', 'landlord', 'Landlord, 2 flats in Parkhurst', 'Call back', current_date) returning id as c1 \gset
insert into public.agent_contacts (org_id, role, label, next_step, next_step_on)
  values (:'vault2', 'landlord', 'Someone elsewhere', 'Call', current_date) returning id as c_elsewhere \gset

-- only in a private organisation, only with this office's contacts
select t99zzh.expect_error(format($$insert into public.agent_referrals (org_id, destination, problem, next_step, next_step_on) values (%L, 'tidy_enterprise', 'Needs finance', 'Ask', current_date)$$, :'shared_org'), 'TEBOS_PERMISSION_DENIED');
select t99zzh.expect_error(format($$insert into public.agent_referrals (org_id, contact_id, destination, problem, next_step, next_step_on) values (%L, %L, 'tidy_enterprise', 'Needs finance', 'Ask', current_date)$$, :'vault', :'c_elsewhere'), 'TEBOS_PERMISSION_DENIED');

-- a referral is numbered, and starts as a need with a next step
insert into public.agent_referrals (org_id, contact_id, destination, problem, next_step, next_step_on, ref, created_by)
  values (:'vault', :'c1', 'real_estate_assist', 'Tenant two months in arrears; landlord wants specialist help', 'Ask if they want an introduction', current_date, 'X-1', :'other')
  returning id as r1, ref as r1_ref, created_by as r1_by, status as r1_status \gset
select t99zzh.ok(:'r1_ref' = 'R-001' and :'r1_by' = :'owner' and :'r1_status' = 'identified', 'R-001, created by the signed-in owner, identified');
select t99zzh.expect_error(format($$insert into public.agent_referrals (org_id, destination, problem) values (%L, 'tidy_enterprise', 'No next step')$$, :'vault'), '23514');
select t99zzh.expect_error(format($$insert into public.agent_referrals (org_id, destination, problem, next_step, next_step_on, status, consent_on, consent_how, agency_permission_ref) values (%L, 'tidy_enterprise', 'Skips ahead', 'x', current_date, 'introduced', current_date, 'email', 'Principal email')$$, :'vault'), 'TEBOS_ILLEGAL_TRANSITION');

-- references, not people; no secrets
select t99zzh.expect_error(format($$update public.agent_referrals set note = 'call him on 082 555 1234' where id = %L$$, :'r1'), 'TEBOS_VALIDATION');
select t99zzh.expect_error(format($$update public.agent_referrals set problem = 'email jane@example.com about the flat' where id = %L$$, :'r1'), 'TEBOS_VALIDATION');
-- a fee is terms and where they are written, never an amount column
select t99zzh.expect_error(format($$update public.agent_referrals set fee_terms = 'agreed_in_writing' where id = %L$$, :'r1'), '23514');

-- consent before anything moves, and never in advance
select t99zzh.expect_error(format($$update public.agent_referrals set status = 'consent_given' where id = %L$$, :'r1'), 'TEBOS_CONSENT_REQUIRED');
select t99zzh.expect_error(format($$update public.agent_referrals set status = 'consent_given', consent_on = current_date + 1, consent_how = 'email' where id = %L$$, :'r1'), 'TEBOS_CONSENT_REQUIRED');
update public.agent_referrals set status = 'consent_given', consent_on = current_date, consent_how = 'in_writing' where id = :'r1';

-- Real Estate Assist: no introduction without its written arrangement
select t99zzh.expect_error(format($$update public.agent_referrals set status = 'introduced' where id = %L$$, :'r1'), '23514');
update public.agent_referrals set status = 'introduced', partner_terms_ref = 'Referral arrangement letter, 3 Nov' where id = :'r1';
-- what was agreed is fixed now: consent, destination and origin
select t99zzh.expect_error(format($$update public.agent_referrals set consent_how = 'verbal_noted' where id = %L$$, :'r1'), 'TEBOS_INPUT_FROZEN');
select t99zzh.expect_error(format($$update public.agent_referrals set destination = 'tidy_enterprise' where id = %L$$, :'r1'), 'TEBOS_INPUT_FROZEN');
update public.agent_referrals set status = 'accepted', fee_terms = 'agreed_in_writing', fee_terms_ref = 'Same letter, clause 4' where id = :'r1';
update public.agent_referrals set status = 'served' where id = :'r1';
select t99zzh.expect_error(format($$update public.agent_referrals set status = 'resolved', next_step = null, next_step_on = null where id = %L$$, :'r1'), '23514');
update public.agent_referrals set status = 'resolved', next_step = null, next_step_on = null, outcome = 'Arrears plan agreed with the tenant' where id = :'r1';
select t99zzh.expect_error(format($$update public.agent_referrals set status = 'served', next_step = 'x', next_step_on = current_date where id = %L$$, :'r1'), 'TEBOS_ILLEGAL_TRANSITION');

-- Tidy Enterprise: someone from the agency's book needs the agency's written permission first
insert into public.agent_referrals (org_id, contact_id, destination, problem, next_step, next_step_on, status, consent_on, consent_how)
  values (:'vault', :'c1', 'tidy_enterprise', 'Wants to refinance the two flats', 'Ask the principal', current_date, 'identified', null, null)
  returning id as r2 \gset
update public.agent_referrals set status = 'consent_given', consent_on = current_date, consent_how = 'email' where id = :'r2';
select t99zzh.expect_error(format($$update public.agent_referrals set status = 'introduced' where id = %L$$, :'r2'), '23514');
update public.agent_referrals set status = 'introduced', agency_permission_ref = 'Principal''s email, 6 Nov' where id = :'r2';
-- a contact from the book can't be called the founder's own lead
select t99zzh.expect_error(format($$insert into public.agent_referrals (org_id, contact_id, via_agency, destination, problem, next_step, next_step_on) values (%L, %L, false, 'tidy_enterprise', 'Own lead?', 'x', current_date)$$, :'vault', :'c1'), '23514');
-- the founder's own lead needs no agency permission
insert into public.agent_referrals (org_id, via_agency, destination, problem, next_step, next_step_on)
  values (:'vault', false, 'tidy_enterprise', 'Own contact: business wants a finance assessment', 'Book the call', current_date) returning id as r3, ref as r3_ref \gset
update public.agent_referrals set status = 'consent_given', consent_on = current_date, consent_how = 'message' where id = :'r3';
update public.agent_referrals set status = 'introduced' where id = :'r3';
select t99zzh.ok(:'r3_ref' = 'R-003', 'numbered in order');

-- another person, or a session without two-step, sees nothing
select set_config('request.jwt.claims', '{"aal":"aal1"}', false);
select t99zzh.ok((select count(*) = 0 from public.agent_referrals), 'no two-step, nothing');
select set_config('request.jwt.claims', '{"aal":"aal2"}', false);
select set_config('request.jwt.claim.sub', :'other', false);
select t99zzh.ok((select count(*) = 0 from public.agent_referrals), 'another person sees nothing');
select set_config('request.jwt.claim.sub', :'owner', false);

-- deleting the contact keeps the referral, unlinked; the trail is redacted
delete from public.agent_contacts where id = :'c1';
select t99zzh.ok((select contact_id is null from public.agent_referrals where id = :'r1'), 'the referral stays, unlinked');
select t99zzh.ok(not exists (select 1 from public.audit_events where entity_id = :'r1' and (after::text like '%arrears%' or before::text like '%arrears%')),
  'the trail does not keep what was written');
reset role;
