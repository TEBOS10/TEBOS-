-- The equity programme: an application qualifies only on the rules; only the founder approves, never the screener, and
-- at most 5 partners at once; nothing is active without a signed agreement and recorded terms (5% equity, 5.1% voting);
-- an active partner's package becomes their plan; the partner records sales that are never edited; a closed month is
-- fixed; TEBOS reads a business's sales only while it is an active partner; the audit flags what looks wrong.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99zzf;
grant usage on schema t99zzf to anon, authenticated;
create function t99zzf.expect_error(p_sql text, p_expect text) returns void
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
create function t99zzf.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t99zzf to anon, authenticated;

select '9fab0000-0000-0000-0000-00000000000a' as founder, '9fab0000-0000-0000-0000-00000000000b' as rep,
       '9fab0000-0000-0000-0000-00000000000c' as maint, '9fab0000-0000-0000-0000-00000000000d' as owner,
       '9fab0000-0000-0000-0000-00000000000e' as clerk, '9fab0000-0000-0000-0000-00000000000f' as outsider,
       '9fab0000-0000-0000-0000-0000000000c1' as org, '9fab0000-0000-0000-0000-0000000000c2' as org2 \gset
insert into auth.users (id, email, email_confirmed_at) values
  (:'founder', 'f@t99zzf.test', now()), (:'rep', 'r@t99zzf.test', now()), (:'maint', 'm@t99zzf.test', now()),
  (:'owner', 'o@c99zzf.test', now()), (:'clerk', 'c@c99zzf.test', now()), (:'outsider', 'x@d99zzf.test', now());
insert into public.platform_admins (user_id) values (:'founder');
insert into public.platform_staff (user_id, role) values (:'rep', 'sales'), (:'maint', 'maintainer');
insert into public.organisations (id, name, slug) values (:'org', 'Partner 99zzf', 'partner-99zzf'), (:'org2', 'Other 99zzf', 'other-99zzf');
insert into public.memberships (org_id, user_id, role) values (:'org', :'owner', 'org_admin'), (:'org', :'clerk', 'operator'), (:'org2', :'outsider', 'org_admin');

set role authenticated;

-- ===========================================================================
-- Applying and qualifying
-- ===========================================================================
select set_config('request.jwt.claim.sub', :'owner', false);
select t99zzf.expect_error(format($$insert into public.equity_applications (org_id, business_name, sector, revenue_band, status_note) values (%L, 'Self apply', 'retail', '10k_50k', 'Applying for ourselves.')$$, :'org'), '42501');

select set_config('request.jwt.claim.sub', :'rep', false);
insert into public.equity_applications (org_id, business_name, sector, revenue_band, status_note)
  values (:'org', 'Partner 99zzf', 'beauty_wellness', 'under_10k', 'Asked for the no-capital option on the call.') returning id as app \gset
update public.equity_applications set status = 'screening', status_note = 'Screening the application now.' where id = :'app';
select t99zzf.expect_error(format($$update public.equity_applications set status = 'qualified', status_note = 'Looks good to me.' where id = %L$$, :'app'), 'TEBOS_VALIDATION');
update public.equity_applications set registration_number = '2019/123456/07', trading_since = current_date - 400, revenue_band = '10k_50k',
  revenue_evidence_note = 'Three months of bank statements seen on a video call; not copied.', owner_full_time = true, reporting_consent = true
  where id = :'app';
select t99zzf.expect_error(format($$update public.equity_applications set registration_number = '19/1234' where id = %L$$, :'app'), '23514');
update public.equity_applications set status = 'qualified', status_note = 'Meets every rule; for the founder.' where id = :'app';
select t99zzf.ok((select screened_by = :'rep' from public.equity_applications where id = :'app'), 'the screener is recorded');
select t99zzf.expect_error(format($$update public.equity_applications set revenue_band = 'over_200k' where id = %L$$, :'app'), 'TEBOS_INPUT_FROZEN');
select t99zzf.expect_error(format($$update public.equity_applications set status = 'approved', status_note = 'Approving it myself.' where id = %L$$, :'app'), 'TEBOS_NOT_APPROVER');

-- ===========================================================================
-- The founder approves; the programme holds at most 5 partners
-- ===========================================================================
reset role;
insert into public.equity_applications (business_name, sector, revenue_band, status, status_note)
  select 'Filler ' || i, 'retail', '10k_50k', 'applied', 'Filler for the capacity test.' from generate_series(1, 5) i;
update public.equity_applications set status = 'screening', status_note = 'Filler screening step.' where business_name like 'Filler %';
update public.equity_applications set registration_number = '2020/000001/07', trading_since = current_date - 400, revenue_evidence_note = 'Statements seen for the filler test.',
  owner_full_time = true, reporting_consent = true, status = 'qualified', status_note = 'Filler qualifies.' where business_name like 'Filler %';
set role authenticated;
select set_config('request.jwt.claim.sub', :'founder', false);
update public.equity_applications set status = 'approved', status_note = 'Filler approved by the founder.' where business_name like 'Filler %';
select t99zzf.expect_error(format($$update public.equity_applications set status = 'approved', status_note = 'Approving a sixth.' where id = %L$$, :'app'), 'TEBOS_VALIDATION');
update public.equity_applications set status = 'withdrawn', status_note = 'Filler withdrawn to free a place.' where business_name = 'Filler 1';
update public.equity_applications set status = 'approved', status_note = 'Approved by the founder.' where id = :'app';
select t99zzf.ok((select approved_by = :'founder' from public.equity_applications where id = :'app'), 'the founder''s approval is recorded');

-- ===========================================================================
-- The signed agreement and the terms
-- ===========================================================================
select t99zzf.expect_error(format($$update public.equity_applications set status = 'agreement_signed', status_note = 'Signed, I think.' where id = %L$$, :'app'), 'TEBOS_CONTRACT_UNSIGNED');
select t99zzf.expect_error(format($$insert into public.equity_terms (org_id, application_id, package, agreement_ref, starts_on) values (%L, %L, 'starter', 'Not yet signed', current_date)$$, :'org', :'app'), 'TEBOS_CONTRACT_UNSIGNED');
update public.equity_applications set agreement_ref = 'EQ-99ZZF-1, signed copy in the vault', status = 'agreement_signed', status_note = 'Agreement signed by both.' where id = :'app';
select t99zzf.expect_error(format($$update public.equity_applications set status = 'active', status_note = 'Active without terms.' where id = %L$$, :'app'), 'TEBOS_VALIDATION');
select t99zzf.expect_error(format($$insert into public.equity_terms (org_id, application_id, equity_pct, package, agreement_ref, starts_on) values (%L, %L, 10, 'starter', 'x-ref-1', current_date)$$, :'org', :'app'), '23514');
select set_config('request.jwt.claim.sub', :'rep', false);
select t99zzf.expect_error(format($$insert into public.equity_terms (org_id, application_id, package, agreement_ref, starts_on) values (%L, %L, 'starter', 'x-ref-1', current_date)$$, :'org', :'app'), 'TEBOS_NOT_APPROVER');
select set_config('request.jwt.claim.sub', :'founder', false);
insert into public.equity_terms (org_id, application_id, package, agreement_ref, starts_on) values (:'org', :'app', 'company', 'ignored', current_date - 100);
select t99zzf.ok((select equity_pct = 5.00 and voting_pct = 5.10 and package = 'starter' and agreement_ref like 'EQ-99ZZF-1%' from public.equity_terms where org_id = :'org'),
  'the terms are 5% and 5.1%, with the approved package and the signed agreement');
select t99zzf.expect_error(format($$update public.equity_terms set ended_on = starts_on - 1 where org_id = %L$$, :'org'), '23514');
select t99zzf.ok(tebos_private.active_plan(:'org') is null, 'not a plan until active');
update public.equity_applications set status = 'active', status_note = 'Equity partnership active.' where id = :'app';
select t99zzf.ok(tebos_private.active_plan(:'org') = 'starter', 'an active partner''s package is their plan');

-- ===========================================================================
-- The partner records sales; TEBOS sees them because it's an active partner
-- ===========================================================================
select set_config('request.jwt.claim.sub', :'clerk', false);
insert into public.partner_sales (org_id, sold_on, kind, amount_cents, reference, channel)
  select :'org', (date_trunc('month', current_date) - interval '1 month')::date + (i % 20), 'sale', 150000, 'INV-' || i, 'walk_in' from generate_series(1, 10) i;
insert into public.partner_sales (org_id, sold_on, kind, amount_cents, reference) values (:'org', current_date, 'sale', 90000, 'INV-NOW');
select t99zzf.expect_error(format($$insert into public.partner_sales (org_id, sold_on, kind, amount_cents) values (%L, current_date + 1, 'sale', 1000)$$, :'org'), 'TEBOS_VALIDATION');
select t99zzf.expect_error(format($$insert into public.partner_sales (org_id, sold_on, kind, amount_cents) values (%L, current_date, 'sale', -1000)$$, :'org'), '23514');
select t99zzf.expect_error(format($$insert into public.partner_sales (org_id, sold_on, kind, amount_cents, note) values (%L, current_date, 'correction', -1000, 'oops')$$, :'org'), '23514');
select t99zzf.expect_error(format($$insert into public.partner_sales (org_id, sold_on, kind, amount_cents, customer_ref) values (%L, current_date, 'sale', 1000, 'thandi@example.com')$$, :'org'), '23514');
reset role;
select t99zzf.expect_error($$update public.partner_sales set amount_cents = 1 where reference = 'INV-NOW'$$, 'TEBOS_INPUT_FROZEN');
set role authenticated;
select set_config('request.jwt.claim.sub', :'clerk', false);
select t99zzf.expect_error(format($$insert into public.partner_month_closes (org_id, period) values (%L, date_trunc('month', current_date - interval '1 month')::date)$$, :'org'), '42501');

-- the owner closes last month; its totals are the database's; nothing more goes into it
select set_config('request.jwt.claim.sub', :'owner', false);
select t99zzf.expect_error(format($$insert into public.partner_month_closes (org_id, period) values (%L, date_trunc('month', current_date)::date)$$, :'org'), 'TEBOS_VALIDATION');
select t99zzf.expect_error(format($$insert into public.partner_month_closes (org_id, period, net_cents) values (%L, date_trunc('month', current_date - interval '1 month')::date, 1)$$, :'org'), '42501');
insert into public.partner_month_closes (org_id, period, note) values (:'org', date_trunc('month', current_date - interval '1 month')::date, 'All invoices for the month are in.');
select t99zzf.ok((select net_cents = 1500000 and sale_count = 10 and attested_by = :'owner' from public.partner_month_closes where org_id = :'org'), 'the close''s totals are worked out by the database');
select t99zzf.expect_error(format($$insert into public.partner_sales (org_id, sold_on, kind, amount_cents) values (%L, date_trunc('month', current_date - interval '1 month')::date, 'sale', 5000)$$, :'org'), 'TEBOS_INPUT_FROZEN');

select set_config('request.jwt.claim.sub', :'maint', false);
select t99zzf.ok((select count(*) = 11 from public.partner_sales where org_id = :'org'), 'TEBOS reads an active partner''s sales');
select t99zzf.ok((select closed and net_cents = 1500000 and flags = '{}' from public.equity_audit(:'org') where period = date_trunc('month', current_date - interval '1 month')::date), 'the audit shows the closed month, with nothing wrong');
select set_config('request.jwt.claim.sub', :'outsider', false);
select t99zzf.ok((select count(*) = 0 from public.partner_sales), 'another business sees nothing');
select t99zzf.expect_error(format($$select * from public.equity_audit(%L)$$, :'org'), '42501');

-- a business that isn't a partner keeps its register private from TEBOS
insert into public.partner_sales (org_id, sold_on, kind, amount_cents) values (:'org2', current_date, 'sale', 1000);
select set_config('request.jwt.claim.sub', :'maint', false);
select t99zzf.ok((select count(*) = 0 from public.partner_sales where org_id = :'org2'), 'TEBOS can''t read a non-partner''s sales');

select t99zzf.ok((select count(*) >= 2 from public.equity_client_orgs()), 'staff can list client organisations to link');
select set_config('request.jwt.claim.sub', :'owner', false);
select t99zzf.ok((select count(*) = 0 from public.equity_client_orgs()), 'a client can''t list other organisations');

reset role;
select t99zzf.ok((select count(*) >= 3 from public.audit_events where entity_type = 'equity_applications'), 'the programme is on the audit trail');
drop schema t99zzf cascade;
