-- Monthly billing: the server opens accounts and issues invoices; an invoice
-- is fixed once issued and paid only by a confirmed payment of its amount;
-- platform admins set Company fees, pause, void and record EFTs, each with a
-- reason; clients see their own invoices and nobody else's.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99;
grant usage on schema t99 to anon, authenticated;
create function t99.expect_error(p_sql text, p_expect text) returns void
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
create function t99.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t99 to anon, authenticated;

select '99000000-0000-0000-0000-00000000000a' as admin, '99000000-0000-0000-0000-00000000000b' as client,
       '99000000-0000-0000-0000-00000000000c' as other_client, '99000000-0000-0000-0000-00000000000d' as sales,
       '99000000-0000-0000-0000-0000000000c1' as org, '99000000-0000-0000-0000-0000000000c2' as org2 \gset
insert into auth.users (id, email, email_confirmed_at) values
  (:'admin', 'a@tebos99.test', now()), (:'client', 'owner@c99.test', now()), (:'other_client', 'o@x99.test', now()), (:'sales', 's@tebos99.test', now());
insert into public.platform_admins (user_id) values (:'admin');
insert into public.platform_staff (user_id, role) values (:'sales', 'sales');
insert into public.organisations (id, name, slug) values (:'org', 'Client 99', 'client-99'), (:'org2', 'Other 99', 'other-99');
insert into public.memberships (org_id, user_id, role) values (:'org', :'client', 'org_admin'), (:'org2', :'other_client', 'org_admin');

select set_config('tebos.actor_type', 'agent', false), set_config('tebos.actor_id', 'billing-worker:sql', false);
insert into public.enquiries (plan, name, business, email) values ('starter', 'O', 'Client 99', 'owner@c99.test') returning id as enq \gset
insert into public.opportunities (enquiry_id, plan, contact_name, business, email, org_id) values (:'enq', 'starter', 'O', 'Client 99', 'owner@c99.test', :'org') returning id as opp \gset
insert into public.enquiries (plan, name, business, email) values ('company', 'C', 'Big 99', 'c@big99.test') returning id as enq2 \gset
insert into public.opportunities (enquiry_id, plan, contact_name, business, email, org_id) values (:'enq2', 'company', 'C', 'Big 99', 'c@big99.test', :'org2') returning id as opp2 \gset

-- the server opens accounts: active with a fee, or waiting for one
insert into public.billing_accounts (opportunity_id, org_id, plan, monthly_cents, anchor_day, next_invoice_on, status)
  values (:'opp', :'org', 'starter', 250000, 15, current_date, 'active') returning id as acct \gset
insert into public.billing_accounts (opportunity_id, org_id, plan, status) values (:'opp2', :'org2', 'company', 'awaiting_fee') returning id as acct2 \gset
select t99.expect_error(format($$insert into public.billing_accounts (opportunity_id, org_id, plan, status) values (%L, %L, 'starter', 'active')$$, :'opp', :'org'), '23514');

-- the server issues an invoice, numbered by the database
insert into public.invoices (billing_account_id, opportunity_id, org_id, period_start, period_end, amount_cents, due_on)
  values (:'acct', :'opp', :'org', current_date, current_date + 30, 250000, current_date + 7) returning id as inv, number as num \gset
select t99.ok(:'num' ~ '^TEBOS-[0-9]{4}-[0-9]{4}$', 'invoice numbers are TEBOS-YYYY-NNNN');
select t99.expect_error(format($$insert into public.invoices (billing_account_id, opportunity_id, org_id, period_start, period_end, amount_cents, due_on)
  values (%L, %L, %L, current_date, current_date + 30, 250000, current_date + 7)$$, :'acct', :'opp', :'org'), '23505');
-- what was billed never changes, even for the server
select t99.expect_error(format('update public.invoices set amount_cents = 1 where id = %L', :'inv'), 'TEBOS_EVIDENCE_IMMUTABLE');
select t99.expect_error(format($$update public.invoices set status = 'paid', paid_at = now() where id = %L$$, :'inv'), 'TEBOS_PAYMENT_UNPROVEN');
update public.invoices set payment_url = 'https://pay.test/x', payment_reference = 'tebos-inv-99' where id = :'inv';
select t99.expect_error(format($$update public.invoices set payment_url = 'https://evil.test' where id = %L$$, :'inv'), 'TEBOS_SERVER_ONLY');

set role authenticated;
-- clients see their own billing only, and change none of it
select set_config('request.jwt.claim.sub', :'client', false);
select t99.ok((select count(*) = 1 from public.invoices), 'the client sees their invoice');
select t99.ok((select count(*) = 1 from public.billing_accounts), 'and their billing account');
update public.billing_accounts set monthly_cents = 1, fee_note = 'discount' where id = :'acct';
update public.invoices set status = 'void', void_reason = 'no' where id = :'inv';
select t99.expect_error(format($$insert into public.payments (opportunity_id, invoice_id, provider, reference, amount_cents, status, paid_at, note)
  values (%L, %L, 'manual', 'fake', 250000, 'success', now(), 'paid honestly')$$, :'opp', :'inv'), '42501');
select set_config('request.jwt.claim.sub', :'other_client', false);
select t99.ok((select count(*) = 0 from public.invoices where org_id = :'org'), 'another client sees none of it');
select set_config('request.jwt.claim.sub', :'sales', false);
select t99.ok((select count(*) = 0 from public.invoices), 'sales staff don''t see client billing');
reset role;
select t99.ok((select status = 'open' from public.invoices where id = :'inv'), 'still open');
select t99.ok((select monthly_cents = 250000 from public.billing_accounts where id = :'acct'), 'the client can''t change their fee');

-- a short payment doesn't settle it; the full amount does, whichever way it came
insert into public.payments (opportunity_id, invoice_id, provider, reference, amount_cents, status, paid_at)
  values (:'opp', :'inv', 'paystack', 'tebos-inv-99-short', 100000, 'failed', null);
select t99.ok((select status = 'open' from public.invoices where id = :'inv'), 'a failed or short payment settles nothing');
set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
insert into public.payments (opportunity_id, invoice_id, provider, reference, amount_cents, status, paid_at, note)
  values (:'opp', :'inv', 'manual', 'FNB 99', 250000, 'success', now(), 'Seen on the statement');
reset role;
select t99.ok((select status = 'paid' and paid_at is not null from public.invoices where id = :'inv'), 'an EFT an admin recorded settles the invoice');
select t99.expect_error(format($$update public.invoices set status = 'void', void_reason = 'oops' where id = %L$$, :'inv'), 'TEBOS_ILLEGAL_TRANSITION');

-- admins set a Company fee from the agreed proposal, with a note; pause and void need reasons
set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
select t99.expect_error(format($$update public.billing_accounts set monthly_cents = 3000000, next_invoice_on = current_date + 1, status = 'active', status_note = 'Proposal agreed' where id = %L$$, :'acct2'), 'TEBOS_VALIDATION');
select t99.expect_error(format($$update public.billing_accounts set monthly_cents = 3000000, fee_note = 'Proposal of 1 Oct', next_invoice_on = current_date - 1, status = 'active', status_note = 'Proposal agreed' where id = %L$$, :'acct2'), 'TEBOS_VALIDATION');
update public.billing_accounts set monthly_cents = 3000000, fee_note = 'Proposal accepted by C on 1 Oct', next_invoice_on = current_date + 1,
  status = 'active', status_note = 'Proposal agreed' where id = :'acct2';
select t99.ok((select status = 'active' and anchor_day = extract(day from current_date + 1) from public.billing_accounts where id = :'acct2'), 'the Company account is active, anchored to its first date');
select t99.expect_error(format($$update public.billing_accounts set status = 'paused' where id = %L$$, :'acct'), 'TEBOS_VALIDATION');
update public.billing_accounts set status = 'paused', status_note = 'Two invoices over 14 days late' where id = :'acct';
reset role;
select t99.ok((select count(*) >= 3 from public.audit_events where entity_type in ('billing_accounts', 'invoices')), 'billing is audited');
select t99.expect_error(format('delete from public.invoices where id = %L', :'inv'), 'TEBOS_EVIDENCE_IMMUTABLE');

-- invoice emails: one of each kind per invoice
insert into public.outbox_emails (opportunity_id, invoice_id, kind, to_email, subject, body) values (:'opp', :'inv', 'invoice', 'o@c99.test', 's', 'b');
select t99.expect_error(format($$insert into public.outbox_emails (opportunity_id, invoice_id, kind, to_email, subject, body) values (%L, %L, 'invoice', 'o@c99.test', 's', 'b')$$, :'opp', :'inv'), '23505');

-- TEBOS's board counts recurring revenue
select t99.ok((select (tebos_private.company_snapshot() -> 'billing' ->> 'monthly_recurring_zar')::int >= 30000), 'recurring revenue is counted');
select t99.ok((select tebos_private.company_snapshot() ? 'attention'), 'the attention section stays');
