-- Property enquiries (ADR 0022): the public sends one only through public.property_enquiry, to an organisation that has
-- switched enquiries on, with consent and without personal details in the description; only the organisation's admins
-- and operators read them; only the status moves, always with a reason; the audit trail never holds the person's details.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99zzl;
grant usage on schema t99zzl to anon, authenticated;
create function t99zzl.expect_error(p_sql text, p_expect text) returns void
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
create function t99zzl.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t99zzl to anon, authenticated;

select '9fc10000-0000-0000-0000-00000000000a' as admin, '9fc10000-0000-0000-0000-00000000000b' as viewer,
       '9fc10000-0000-0000-0000-00000000000c' as operator, '9fc10000-0000-0000-0000-00000000000d' as other,
       '9fc10000-0000-0000-0000-0000000000d1' as org, '9fc10000-0000-0000-0000-0000000000d2' as org2 \gset
insert into auth.users (id, email, email_confirmed_at) values
  (:'admin', 'admin@u99zzl.test', now()), (:'viewer', 'viewer@u99zzl.test', now()),
  (:'operator', 'operator@u99zzl.test', now()), (:'other', 'other@u99zzl.test', now());
insert into public.organisations (id, name, slug) values (:'org', 'Property 99zzl', 'property-99zzl'), (:'org2', 'Other 99zzl', 'other-99zzl');
insert into public.memberships (org_id, user_id, role) values
  (:'org', :'admin', 'org_admin'), (:'org', :'viewer', 'viewer'), (:'org', :'operator', 'operator'), (:'org2', :'other', 'org_admin');

-- closed until the organisation switches it on
set role anon;
select t99zzl.ok(not public.property_enquiry_open('property-99zzl'), 'closed by default');
select t99zzl.expect_error($$select public.property_enquiry('property-99zzl', 'arrears', 'owner', 'Sunnyside, Pretoria',
  'Two flats empty since March and the levies are behind.', 'A Owner', 'a@owner.test', null, true)$$, 'TEBOS_VALIDATION');
-- the public can't write or read the tables directly
select t99zzl.expect_error($$insert into public.property_enquiries (org_id, situation, relationship, area, message, name, email, consent_at)
  values ('9fc10000-0000-0000-0000-0000000000d1', 'arrears', 'owner', 'Sunnyside', 'Two flats empty since March, levies behind.', 'X', 'x@y.test', now())$$, '42501');
select t99zzl.expect_error($$select * from public.property_enquiries$$, '42501');
reset role;

-- only an admin switches it on; a viewer or an outsider can't
set role authenticated;
select set_config('request.jwt.claim.sub', :'viewer', false);
select t99zzl.expect_error(format($$insert into public.property_enquiry_settings (org_id, accepting) values (%L, true)$$, :'org'), '42501');
select set_config('request.jwt.claim.sub', :'other', false);
select t99zzl.expect_error(format($$insert into public.property_enquiry_settings (org_id, accepting) values (%L, true)$$, :'org'), '42501');
select set_config('request.jwt.claim.sub', :'admin', false);
insert into public.property_enquiry_settings (org_id, accepting) values (:'org', true);
reset role;

set role anon;
select t99zzl.ok(public.property_enquiry_open('property-99zzl'), 'open once switched on');
select t99zzl.ok(not public.property_enquiry_open('other-99zzl'), 'another organisation stays closed');
-- consent, a real description, no personal details in it, known situation
select t99zzl.expect_error($$select public.property_enquiry('property-99zzl', 'arrears', 'owner', 'Sunnyside, Pretoria',
  'Two flats empty since March and the levies are behind.', 'A Owner', 'a@owner.test', null, false)$$, 'TEBOS_VALIDATION');
select t99zzl.expect_error($$select public.property_enquiry('property-99zzl', 'arrears', 'owner', 'Sunnyside, Pretoria',
  'Help please', 'A Owner', 'a@owner.test', null, true)$$, 'TEBOS_VALIDATION');
select t99zzl.expect_error($$select public.property_enquiry('property-99zzl', 'arrears', 'owner', 'Sunnyside, Pretoria',
  'Two flats empty since March; call me on 082 555 1234 please.', 'A Owner', 'a@owner.test', null, true)$$, 'TEBOS_VALIDATION');
select t99zzl.expect_error($$select public.property_enquiry('property-99zzl', 'flip', 'owner', 'Sunnyside, Pretoria',
  'Two flats empty since March and the levies are behind.', 'A Owner', 'a@owner.test', null, true)$$, '23514');
select t99zzl.expect_error($$select public.property_enquiry('property-99zzl', 'arrears', 'owner', 'Sunnyside, Pretoria',
  'Two flats empty since March and the levies are behind.', 'A Owner', 'not-an-email', null, true)$$, '23514');
-- a good one gets a reference
select public.property_enquiry('property-99zzl', 'arrears', 'owner', 'Sunnyside, Pretoria',
  'Two flats empty since March and the levies are behind.', 'A Owner', ' A@Owner.test ', '082 555 1234', true) as ref1 \gset
select t99zzl.ok(:'ref1' like 'EQ-%', 'a reference comes back');
select public.property_enquiry('property-99zzl', 'low_rental', 'co_owner', 'Hatfield, Pretoria',
  'The rent on the cottage has not changed in six years.', 'A Owner', 'a@owner.test', null, true) \gset
-- a third new one from the same address waits for a reply
select t99zzl.expect_error($$select public.property_enquiry('property-99zzl', 'underused', 'owner', 'Arcadia, Pretoria',
  'The ground floor shop has been empty for a year now.', 'A Owner', 'a@owner.test', null, true)$$, 'TEBOS_RATE_LIMITED');
reset role;

select t99zzl.ok((select email from public.property_enquiries where ref = :'ref1') = 'a@owner.test', 'email stored trimmed and lower case');
select t99zzl.ok((select consent_at is not null and status = 'new' from public.property_enquiries where ref = :'ref1'), 'consent time stored; starts new');

-- who reads them: admins and operators, not viewers or outsiders
set role authenticated;
select set_config('request.jwt.claim.sub', :'viewer', false);
select t99zzl.ok((select count(*) from public.property_enquiries) = 0, 'a viewer sees no enquiries');
select t99zzl.ok((select count(*) from public.property_enquiry_settings) = 1, 'a viewer sees whether enquiries are on');
select set_config('request.jwt.claim.sub', :'other', false);
select t99zzl.ok((select count(*) from public.property_enquiries) = 0, 'an outsider sees none');
select set_config('request.jwt.claim.sub', :'operator', false);
select t99zzl.ok((select count(*) from public.property_enquiries) = 2, 'an operator sees both');

-- only the status moves, with a reason, along the allowed path
select t99zzl.expect_error(format($$update public.property_enquiries set email = 'z@z.test' where ref = %L$$, :'ref1'), '42501');
select t99zzl.expect_error(format($$update public.property_enquiries set status = 'contacted' where ref = %L$$, :'ref1'), 'TEBOS_VALIDATION');
update public.property_enquiries set status = 'contacted', status_note = 'Phoned; site visit booked for Friday.' where ref = :'ref1';
select t99zzl.expect_error(format($$update public.property_enquiries set status = 'new', status_note = 'Reopening it now.' where ref = %L$$, :'ref1'), 'TEBOS_ILLEGAL_TRANSITION');
update public.property_enquiries set status = 'closed', status_note = 'Taken on as case PA-002.' where ref = :'ref1';
-- an operator can't delete; an admin can, on request
delete from public.property_enquiries where ref = :'ref1';
select set_config('request.jwt.claim.sub', :'admin', false);
select t99zzl.ok((select count(*) from public.property_enquiries where ref = :'ref1') = 1, 'an operator could not delete');
delete from public.property_enquiries where ref = :'ref1';
select t99zzl.ok((select count(*) from public.property_enquiries where ref = :'ref1') = 0, 'an admin deletes on request');
reset role;

-- the audit trail recorded each step but never the person's details or words
select t99zzl.ok((select count(*) from public.audit_events where entity_type = 'property_enquiries' and org_id = :'org') >= 5, 'audited');
select t99zzl.ok(not exists (select 1 from public.audit_events where entity_type = 'property_enquiries'
  and (coalesce(before::text, '') || coalesce(after::text, '')) ~* 'owner\.test|Owner|555|flats empty'), 'no personal details in the audit trail');
