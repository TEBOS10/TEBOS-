-- Tidy Property Operations, Release 1 (ADR 0023): accounts and roles, isolation, the unit limit, leases that never
-- overlap, the append-only ledger and its reversals, rent charged once (pro-rated), balances and ageing computed,
-- the month's summary, maintenance approval, suspended accounts, and tenants' details kept out of the audit trail.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99zzm;
grant usage on schema t99zzm to anon, authenticated;
create function t99zzm.expect_error(p_sql text, p_expect text) returns void
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
create function t99zzm.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t99zzm to anon, authenticated;

select '9fd10000-0000-0000-0000-00000000000a' as owner, '9fd10000-0000-0000-0000-00000000000b' as manager,
       '9fd10000-0000-0000-0000-00000000000c' as approver, '9fd10000-0000-0000-0000-00000000000d' as viewer,
       '9fd10000-0000-0000-0000-00000000000e' as outsider, '9fd10000-0000-0000-0000-00000000000f' as staff \gset
insert into auth.users (id, email, email_confirmed_at) values
  (:'owner', 'owner@u99zzm.test', now()), (:'manager', 'manager@u99zzm.test', now()), (:'approver', 'approver@u99zzm.test', now()),
  (:'viewer', 'viewer@u99zzm.test', now()), (:'outsider', 'outsider@u99zzm.test', now()), (:'staff', 'staff@u99zzm.test', now());
insert into public.platform_admins (user_id) values (:'staff');

-- dates relative to today in South Africa, so the test holds on any day
select (now() at time zone 'Africa/Johannesburg')::date as today,
       date_trunc('month', (now() at time zone 'Africa/Johannesburg'))::date as this_month,
       (date_trunc('month', (now() at time zone 'Africa/Johannesburg')) - interval '2 months')::date as two_ago,
       (date_trunc('month', (now() at time zone 'Africa/Johannesburg')) - interval '1 month')::date as last_month \gset

-- ---------------------------------------------------------------------------
-- Opening an account
-- ---------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', :'owner', false);
select public.create_ops_account('Sunnyside Rentals') as org \gset
select t99zzm.expect_error($$select public.create_ops_account('Second account')$$, 'TEBOS_VALIDATION');
select t99zzm.ok((select app = 'ops' from public.organisations where id = :'org'), 'an ops organisation');
select t99zzm.ok((select plan = 'pilot' and status = 'trial' and unit_limit = 60 from public.ops_subscriptions where org_id = :'org'), 'a free manual pilot');
-- the owner can't change their own plan
select t99zzm.expect_error(format($$update public.ops_subscriptions set unit_limit = 1000 where org_id = %L$$, :'org'), '42501');
select t99zzm.expect_error(format($$select public.ops_set_subscription(%L, 'growth', 'active', 1000, 10, null, null)$$, :'org'), '42501');
reset role;
-- the outsider has their own account, to prove isolation both ways
set role authenticated;
select set_config('request.jwt.claim.sub', :'outsider', false);
select public.create_ops_account('Elsewhere Lettings') as org2 \gset
reset role;
insert into public.memberships (org_id, user_id, role) values
  (:'org', :'manager', 'operator'), (:'org', :'approver', 'approver'), (:'org', :'viewer', 'viewer');

-- ---------------------------------------------------------------------------
-- Portfolio
-- ---------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', :'manager', false);
insert into public.ops_properties (org_id, name, street, suburb, city, province, postal_code)
  values (:'org', 'Block A', '12 Esselen St', 'Sunnyside', 'Pretoria', 'Gauteng', '0002') returning id as prop \gset
select t99zzm.expect_error(format($$insert into public.ops_properties (org_id, name, city, postal_code) values (%L, 'Bad', 'Pretoria', '12')$$, :'org'), '23514');
insert into public.ops_units (org_id, property_id, label, unit_type, market_rent_cents) values
  (:'org', :'prop', '1', 'one_bed', 650000), (:'org', :'prop', '2', 'two_bed', 850000), (:'org', :'prop', '3', 'bachelor', 450000);
select id as u1 from public.ops_units where label = '1' and property_id = :'prop' \gset
select id as u2 from public.ops_units where label = '2' and property_id = :'prop' \gset
select id as u3 from public.ops_units where label = '3' and property_id = :'prop' \gset
select t99zzm.expect_error(format($$insert into public.ops_units (org_id, property_id, label) values (%L, %L, ' 1 ')$$, :'org', :'prop'), '23505');
select t99zzm.expect_error(format($$update public.ops_units set held_back = true where id = %L$$, :'u3'), '23514');
update public.ops_units set held_back = true, held_back_reason = 'Being repainted' where id = :'u3';

-- a viewer and an approver read but don't write; an outsider sees nothing
select set_config('request.jwt.claim.sub', :'viewer', false);
select t99zzm.ok((select count(*) from public.ops_units) = 3, 'a viewer reads the units');
select t99zzm.expect_error(format($$insert into public.ops_properties (org_id, name, city) values (%L, 'Viewer''s', 'Pretoria')$$, :'org'), '42501');
select set_config('request.jwt.claim.sub', :'approver', false);
select t99zzm.expect_error(format($$insert into public.ops_tenants (org_id, full_name) values (%L, 'Approver Added')$$, :'org'), '42501');
select set_config('request.jwt.claim.sub', :'outsider', false);
select t99zzm.ok((select count(*) from public.ops_units) = 0, 'an outsider sees no units');
select t99zzm.ok((select count(*) from public.ops_properties) = 0, 'an outsider sees no properties');
select t99zzm.expect_error(format($$insert into public.ops_properties (org_id, name, city) values (%L, 'Intruder', 'Pretoria')$$, :'org'), '42501');
reset role;

-- ---------------------------------------------------------------------------
-- Tenants and leases
-- ---------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', :'manager', false);
insert into public.ops_tenants (org_id, full_name, email, phone) values (:'org', 'Thandi Nkosi', 'thandi@example.test', '082 555 0101') returning id as t1 \gset
insert into public.ops_tenants (org_id, full_name) values (:'org', 'Pieter Botha') returning id as t2 \gset
select t99zzm.expect_error(format($$insert into public.ops_tenants (org_id, full_name, notes) values (%L, 'X Y', 'ID 8001015009087')$$, :'org'), '23514');
-- lease 1 started two months ago; lease 2 starts on the 16th of last month (a part month)
insert into public.ops_leases (org_id, unit_id, tenant_id, starts_on, rent_cents, due_day, deposit_cents, deposit_held_at)
  values (:'org', :'u1', :'t1', :'two_ago', 650000, 1, 650000, 'FNB savings, Sunnyside deposits') returning id as l1, ref as l1ref \gset
insert into public.ops_leases (org_id, unit_id, tenant_id, starts_on, rent_cents, due_day)
  values (:'org', :'u2', :'t2', (:'last_month'::date + 15), 850000, 1) returning id as l2 \gset
-- overlapping a lease on the same unit is refused; account numbers stay out of the deposit note
select t99zzm.expect_error(format($$insert into public.ops_leases (org_id, unit_id, tenant_id, starts_on, rent_cents) values (%L, %L, %L, %L, 100000)$$, :'org', :'u1', :'t2', :'today'), 'TEBOS_VALIDATION');
select t99zzm.expect_error(format($$insert into public.ops_leases (org_id, unit_id, tenant_id, starts_on, rent_cents, deposit_held_at) values (%L, %L, %L, %L, 100000, 'acc 62012345678')$$, :'org', :'u3', :'t2', :'today'), '23514');
-- what was agreed stays agreed
select t99zzm.expect_error(format($$update public.ops_leases set starts_on = starts_on - 1 where id = %L$$, :'l1'), '42501');
select t99zzm.expect_error(format($$update public.ops_leases set status = 'ended' where id = %L$$, :'l1'), '23514');

-- ---------------------------------------------------------------------------
-- Rent: charged once per month, pro-rated for a part month
-- ---------------------------------------------------------------------------
select public.ops_generate_rent(:'org', :'two_ago') as n1 \gset
select public.ops_generate_rent(:'org', :'last_month') as n2 \gset
select public.ops_generate_rent(:'org', :'last_month') as n2again \gset
select t99zzm.ok(:n1 = 1 and :n2 = 2 and :n2again = 0, format('rent charged once: %s, %s, %s', :n1, :n2, :n2again));
select t99zzm.ok((select amount_cents = tebos_private.ops_pro_rata(850000, :'last_month', (:'last_month'::date + 15), null)
                    and amount_cents < 850000 and note like 'Pro-rated%'
                    from public.ops_ledger where lease_id = :'l2' and kind = 'charge'), 'a part month is pro-rated');
-- charging a month by hand that's already charged is refused
select t99zzm.expect_error(format($$insert into public.ops_ledger (org_id, lease_id, kind, account, category, amount_cents, effective_on, period) values (%L, %L, 'charge', 'rent', 'rent', 650000, %L, %L)$$, :'org', :'l1', :'last_month', :'last_month'), 'TEBOS_VALIDATION');

-- payments: recorded once arrived, never in the future
insert into public.ops_ledger (org_id, lease_id, kind, account, method, amount_cents, effective_on, reference)
  values (:'org', :'l1', 'payment', 'rent', 'eft', 650000, (:'two_ago'::date + 2), 'THANDI L-0001') returning id as p1 \gset
insert into public.ops_ledger (org_id, lease_id, kind, account, method, amount_cents, effective_on, reference)
  values (:'org', :'l1', 'payment', 'rent', 'eft', 65000, (:'last_month'::date + 2), 'typo') returning id as pwrong \gset
select t99zzm.expect_error(format($$insert into public.ops_ledger (org_id, lease_id, kind, account, method, amount_cents, effective_on) values (%L, %L, 'payment', 'rent', 'eft', 100, %L)$$, :'org', :'l1', (:'today'::date + 1)), 'TEBOS_VALIDATION');
-- the deposit, on its own account
insert into public.ops_ledger (org_id, lease_id, kind, account, method, amount_cents, effective_on)
  values (:'org', :'l1', 'payment', 'deposit', 'eft', 650000, :'two_ago');

-- append-only: no edits, no deletes; a correction is a reversal with a reason, once
select t99zzm.expect_error(format($$update public.ops_ledger set amount_cents = 650000 where id = %L$$, :'pwrong'), '42501');
select t99zzm.expect_error(format($$delete from public.ops_ledger where id = %L$$, :'pwrong'), '42501');
select t99zzm.expect_error(format($$insert into public.ops_ledger (org_id, lease_id, kind, account, amount_cents, effective_on, reverses_id) values (%L, %L, 'reversal', 'rent', 1, %L, %L)$$, :'org', :'l1', :'today', :'pwrong'), '23514');
insert into public.ops_ledger (org_id, lease_id, kind, account, amount_cents, effective_on, reverses_id, note)
  values (:'org', :'l1', 'reversal', 'rent', 1, :'today', :'pwrong', 'Wrong amount: was R6 500') returning id as rev \gset
select t99zzm.ok((select amount_cents = 65000 from public.ops_ledger where id = :'rev'), 'a reversal mirrors what it cancels');
select t99zzm.expect_error(format($$insert into public.ops_ledger (org_id, lease_id, kind, account, amount_cents, effective_on, reverses_id, note) values (%L, %L, 'reversal', 'rent', 1, %L, %L, 'Twice over')$$, :'org', :'l1', :'today', :'pwrong'), '23505');
select t99zzm.expect_error(format($$insert into public.ops_ledger (org_id, lease_id, kind, account, amount_cents, effective_on, reverses_id, note) values (%L, %L, 'reversal', 'rent', 1, %L, %L, 'Undo the undo')$$, :'org', :'l1', :'today', :'rev'), 'TEBOS_VALIDATION');
-- a viewer can't record money
select set_config('request.jwt.claim.sub', :'viewer', false);
select t99zzm.expect_error(format($$insert into public.ops_ledger (org_id, lease_id, kind, account, method, amount_cents, effective_on) values (%L, %L, 'payment', 'rent', 'cash', 100, %L)$$, :'org', :'l1', :'today'), '42501');

-- ---------------------------------------------------------------------------
-- Balances and ageing, computed (a viewer reads them too)
-- ---------------------------------------------------------------------------
-- lease 1: two months charged (two ago, last month) = R13 000; paid R6 500 → last month's R6 500 is outstanding
select t99zzm.ok((select balance_cents = 650000 and overdue_cents = 650000 and deposit_held_cents = 650000
                    from public.ops_lease_positions(:'org') where lease_id = :'l1'), 'lease 1 owes last month''s rent; deposit held apart');
select t99zzm.ok((select balance_cents > 0 and balance_cents < 850000 from public.ops_lease_positions(:'org') where lease_id = :'l2'), 'lease 2 owes its part month');
select set_config('request.jwt.claim.sub', :'outsider', false);
select t99zzm.ok((select count(*) from public.ops_lease_positions(:'org')) = 0, 'an outsider gets no positions');
select t99zzm.ok((select count(*) from public.ops_ledger) = 0, 'an outsider reads no ledger');
reset role;

-- ---------------------------------------------------------------------------
-- Maintenance: quote, approval by the owner or an approver, done with the actual cost
-- ---------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', :'manager', false);
insert into public.ops_suppliers (org_id, name, trade) values (:'org', 'Pretoria Plumbing', 'Plumber') returning id as sup \gset
insert into public.ops_maintenance (org_id, property_id, unit_id, title, priority) values (:'org', :'prop', :'u1', 'Geyser leaking', 'urgent') returning id as m1 \gset
select t99zzm.expect_error(format($$update public.ops_maintenance set status = 'quoted' where id = %L$$, :'m1'), 'TEBOS_VALIDATION');
update public.ops_maintenance set status = 'quoted', supplier_id = :'sup', quote_cents = 420000, quote_ref = 'Q-77' where id = :'m1';
-- the property manager can't approve their own quote
select t99zzm.expect_error(format($$update public.ops_maintenance set status = 'approved' where id = %L$$, :'m1'), '42501');
select set_config('request.jwt.claim.sub', :'approver', false);
select t99zzm.expect_error(format($$update public.ops_maintenance set status = 'approved', quote_cents = 1 where id = %L$$, :'m1'), 'TEBOS_VALIDATION');
update public.ops_maintenance set status = 'approved', status_note = 'Go ahead' where id = :'m1';
select t99zzm.ok((select decided_by = :'approver'::uuid and decided_at is not null from public.ops_maintenance where id = :'m1'), 'the decision is attributed');
select t99zzm.expect_error(format($$update public.ops_maintenance set status = 'in_progress' where id = %L$$, :'m1'), '42501');
select set_config('request.jwt.claim.sub', :'manager', false);
select t99zzm.expect_error(format($$update public.ops_maintenance set quote_cents = 999999 where id = %L$$, :'m1'), 'TEBOS_INPUT_FROZEN');
update public.ops_maintenance set status = 'in_progress' where id = :'m1';
select t99zzm.expect_error(format($$update public.ops_maintenance set status = 'done' where id = %L$$, :'m1'), 'TEBOS_VALIDATION');
update public.ops_maintenance set status = 'done', cost_cents = 435000, completed_on = :'today' where id = :'m1';
select t99zzm.expect_error(format($$update public.ops_maintenance set title = 'Changed later' where id = %L$$, :'m1'), 'TEBOS_INPUT_FROZEN');
select t99zzm.expect_error(format($$update public.ops_maintenance set status = 'approved' where id = %L$$, :'m1'), '42501');
-- the wrong unit for the property is refused; cancelling says why
insert into public.ops_properties (org_id, name, city) values (:'org', 'Block B', 'Pretoria') returning id as prop2 \gset
select t99zzm.expect_error(format($$insert into public.ops_maintenance (org_id, property_id, unit_id, title) values (%L, %L, %L, 'Wrong unit')$$, :'org', :'prop2', :'u1'), 'TEBOS_VALIDATION');
insert into public.ops_maintenance (org_id, property_id, title) values (:'org', :'prop', 'Gate motor') returning id as m2 \gset
select t99zzm.expect_error(format($$update public.ops_maintenance set status = 'cancelled' where id = %L$$, :'m2'), 'TEBOS_VALIDATION');
update public.ops_maintenance set status = 'cancelled', status_note = 'Fixed by the body corporate' where id = :'m2';
-- photos: a record first, then the file into exactly that path
insert into public.ops_maintenance_photos (id, org_id, request_id, path, file_name)
  values ('9fd10000-0000-0000-0000-0000000000f1', :'org', :'m1', :'org' || '/maintenance/' || :'m1' || '/9fd10000-0000-0000-0000-0000000000f1', 'geyser.jpg');
insert into storage.objects (bucket_id, name) values ('ops-files', :'org' || '/maintenance/' || :'m1' || '/9fd10000-0000-0000-0000-0000000000f1');
select t99zzm.expect_error(format($$insert into storage.objects (bucket_id, name) values ('ops-files', '%s/maintenance/%s/stray')$$, :'org', :'m1'), '42501');
select set_config('request.jwt.claim.sub', :'outsider', false);
select t99zzm.ok((select count(*) from storage.objects where bucket_id = 'ops-files') = 0, 'an outsider can''t see the photo');
reset role;

-- ---------------------------------------------------------------------------
-- The month at a glance
-- ---------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', :'viewer', false);
select public.ops_month_summary(:'org', :'last_month') as s \gset
select t99zzm.ok((:'s'::jsonb ->> 'units')::int = 3 and (:'s'::jsonb ->> 'occupied')::int = 2 and (:'s'::jsonb ->> 'held_back')::int = 1
                 and (:'s'::jsonb ->> 'vacant')::int = 0, format('occupancy derived: %s', :'s'));
select t99zzm.ok((:'s'::jsonb ->> 'expected_cents')::bigint = 650000 + tebos_private.ops_pro_rata(850000, :'last_month', (:'last_month'::date + 15), null)
                 and (:'s'::jsonb ->> 'billed_cents')::bigint = (:'s'::jsonb ->> 'expected_cents')::bigint, 'expected and billed agree');
select t99zzm.ok((:'s'::jsonb ->> 'received_cents')::bigint = 0, 'the reversed payment is not received');
select public.ops_month_summary(:'org', :'this_month') as s2 \gset
select t99zzm.ok((:'s2'::jsonb ->> 'maintenance_spend_cents')::bigint = 435000 and (:'s2'::jsonb ->> 'deposits_held_cents')::bigint = 650000,
                 format('spend and deposits: %s', :'s2'));
-- the summary for one property, and nothing for an outsider
select t99zzm.ok((public.ops_month_summary(:'org', :'last_month', :'prop2') ->> 'units')::int = 0, 'a property on its own');
select set_config('request.jwt.claim.sub', :'outsider', false);
select t99zzm.ok((public.ops_month_summary(:'org', :'last_month') ->> 'units')::int = 0, 'an outsider''s summary is empty');
reset role;

-- ---------------------------------------------------------------------------
-- Ending a lease; the unit limit; a suspended account; Tidy's staff set the plan
-- ---------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', :'manager', false);
update public.ops_leases set status = 'ended', ended_on = :'today', end_reason = 'Moved out at the end of the month' where id = :'l2';
select t99zzm.expect_error(format($$update public.ops_leases set rent_cents = 1 where id = %L$$, :'l2'), 'TEBOS_INPUT_FROZEN');
select set_config('request.jwt.claim.sub', :'staff', false);
select public.ops_set_subscription(:'org', 'pilot', 'trial', 3, 5, null, 'Pilot capped at three units');
select set_config('request.jwt.claim.sub', :'manager', false);
select t99zzm.expect_error(format($$insert into public.ops_units (org_id, property_id, label) values (%L, %L, '4')$$, :'org', :'prop'), 'TEBOS_OUT_OF_PLAN');
select set_config('request.jwt.claim.sub', :'staff', false);
select public.ops_set_subscription(:'org', 'pilot', 'suspended', 60, 5, null, 'Paused at the owner''s request');
select set_config('request.jwt.claim.sub', :'owner', false);
select t99zzm.ok((select count(*) from public.ops_units) = 3, 'a suspended account still reads');
select t99zzm.expect_error(format($$insert into public.ops_tenants (org_id, full_name) values (%L, 'New Person')$$, :'org'), '42501');
select t99zzm.expect_error(format($$select public.ops_generate_rent(%L, %L)$$, :'org', :'this_month'), '42501');
reset role;

-- tenants' details never enter the audit trail: only which fields changed
select t99zzm.ok((select count(*) from public.audit_events where entity_type = 'ops_tenants') >= 2, 'tenants audited');
select t99zzm.ok(not exists (select 1 from public.audit_events where entity_type in ('ops_tenants', 'ops_leases')
  and (coalesce(before::text, '') || coalesce(after::text, '')) ~* 'thandi|082 555|example\.test|FNB'), 'no tenant details in the audit trail');
