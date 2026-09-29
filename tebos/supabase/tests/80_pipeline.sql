-- The client pipeline: staff decide, the server records the rest on proof,
-- and nothing (a payment, a contract, an organisation) can be skipped or faked.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t8;
grant usage on schema t8 to anon, authenticated;
create function t8.expect_error(p_sql text, p_expect text) returns void
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
create function t8.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t8 to anon, authenticated;

select '80000000-0000-0000-0000-00000000000a' as admin, '80000000-0000-0000-0000-00000000000b' as sales,
       '80000000-0000-0000-0000-00000000000c' as maint, '80000000-0000-0000-0000-00000000000d' as stranger \gset
insert into auth.users (id, email, email_confirmed_at) values
  (:'admin', 'admin@tebos.test', now()), (:'sales', 'sales@tebos.test', now()),
  (:'maint', 'maint@tebos.test', now()), (:'stranger', 'stranger@elsewhere.test', now());
insert into public.platform_admins (user_id) values (:'admin');
insert into public.platform_staff (user_id, role) values (:'sales', 'sales'), (:'maint', 'maintainer');

-- the public submits enquiries
set role anon;
insert into public.enquiries (plan, name, business, email, website, message)
  values ('starter', 'Thandi', 'Northwind Consulting', 'thandi@gmail.com', null, 'We do process automation for clients');
insert into public.enquiries (plan, name, business, email) values ('equity', 'Sam', 'Sam''s Bakery', 'sam@bakery.test');
reset role;
select id as enq from public.enquiries where email = 'thandi@gmail.com' \gset
select id as enq_equity from public.enquiries where email = 'sam@bakery.test' \gset

-- only the server opens opportunities
set role authenticated;
select set_config('request.jwt.claim.sub', :'sales', false);
select t8.expect_error(format('insert into public.opportunities (enquiry_id, plan, contact_name, business, email) values (%L, %L, %L, %L, %L)',
  :'enq', 'starter', 'x', 'x', 'x@x.test'), '42501');
reset role;

select set_config('request.jwt.claim.sub', '', false);
select set_config('tebos.actor_type', 'agent', false), set_config('tebos.actor_id', 'pipeline-worker:sql', false);
insert into public.opportunities (enquiry_id, plan, contact_name, business, email, message)
  select id, plan, name, business, email, message from public.enquiries where id = :'enq' returning id as opp \gset
insert into public.opportunities (enquiry_id, plan, contact_name, business, email)
  select id, plan, name, business, email from public.enquiries where id = :'enq_equity' returning id as opp_equity \gset
update public.opportunities set status = 'screened', screened_at = now(),
  screening = '{"flags": [{"code": "free_email"}, {"code": "competitor_terms"}]}' where id = :'opp';
update public.opportunities set status = 'screened', screened_at = now(), screening = '{"flags": []}' where id = :'opp_equity';

-- strangers and clients see nothing
set role authenticated;
select set_config('request.jwt.claim.sub', :'stranger', false);
select t8.ok((select count(*) = 0 from public.opportunities), 'a stranger sees no opportunities');
update public.opportunities set status = 'approved' where id = :'opp';
select t8.ok((select status = 'screened' from public.opportunities where id = :'opp') is null, 'and cannot change one (not even see it)');
reset role;
select t8.ok((select status = 'screened' from public.opportunities where id = :'opp'), 'still screened');
set role anon;
select t8.expect_error('select * from public.opportunities', '42501');
select t8.expect_error('select * from public.payments', '42501');
select t8.expect_error('select * from public.contracts', '42501');
reset role;

-- sales decides, but a flagged enquiry needs a reason
set role authenticated;
select set_config('request.jwt.claim.sub', :'sales', false);
select t8.ok((select count(*) = 2 from public.opportunities), 'sales sees the pipeline');
select t8.expect_error(format('update public.opportunities set status = %L where id = %L', 'approved', :'opp'), 'TEBOS_VALIDATION');
select t8.expect_error(format('update public.opportunities set status = %L where id = %L', 'awaiting_payment', :'opp'), 'TEBOS_SERVER_ONLY');
select t8.expect_error(format('update public.opportunities set payment_url = %L where id = %L', 'https://pay.example/x', :'opp'), '42501');
select t8.expect_error(format('update public.opportunities set status = %L where id = %L', 'declined', :'opp_equity'), '23514');
update public.opportunities set status = 'approved', decision_note = 'Spoke to Thandi: an ops consultancy, but buying for their own firm, not reselling'
  where id = :'opp';
select t8.ok((select decided_by = :'sales'::uuid and decided_at is not null from public.opportunities where id = :'opp'), 'who approved is recorded');
update public.opportunities set status = 'approved' where id = :'opp_equity';
-- a maintainer must be TEBOS staff with that role
select t8.expect_error(format('update public.opportunities set maintainer_id = %L where id = %L', :'stranger', :'opp'), 'TEBOS_VALIDATION');
update public.opportunities set maintainer_id = :'maint' where id = :'opp';
reset role;

-- equity applications stop at approved
select t8.expect_error(format('update public.opportunities set amount_cents = 1, payment_url = %L, payment_reference = %L, status = %L where id = %L',
  'https://pay.example/e', 'ref-e', 'awaiting_payment', :'opp_equity'), '23514');

-- the server records the payment link, then the payment
select t8.expect_error(format('update public.opportunities set status = %L where id = %L', 'awaiting_payment', :'opp'), 'TEBOS_PAYMENT_UNPROVEN');
update public.opportunities set amount_cents = 250000, payment_url = 'https://checkout.paystack.test/abc', payment_reference = 'tebos-opp-1',
  status = 'awaiting_payment' where id = :'opp';
select t8.expect_error(format('update public.opportunities set status = %L where id = %L', 'paid', :'opp'), 'TEBOS_PAYMENT_UNPROVEN');
insert into public.payments (opportunity_id, provider, reference, amount_cents, status, paid_at)
  values (:'opp', 'paystack', 'partial-1', 100000, 'success', now());
select t8.expect_error(format('update public.opportunities set status = %L where id = %L', 'paid', :'opp'), 'TEBOS_PAYMENT_UNPROVEN');

-- people can't record provider payments; admins record EFTs, with a reference and a note
set role authenticated;
select set_config('request.jwt.claim.sub', :'sales', false);
select t8.expect_error(format('insert into public.payments (opportunity_id, provider, reference, amount_cents, status, paid_at) values (%L, %L, %L, 250000, %L, now())',
  :'opp', 'manual', 'eft-1', 'success'), '42501');
select set_config('request.jwt.claim.sub', :'admin', false);
select t8.expect_error(format('insert into public.payments (opportunity_id, provider, reference, amount_cents, status, paid_at) values (%L, %L, %L, 250000, %L, now())',
  :'opp', 'paystack', 'fake-1', 'success'), 'TEBOS_SERVER_ONLY');
select t8.expect_error(format('insert into public.payments (opportunity_id, provider, reference, amount_cents, status, paid_at) values (%L, %L, %L, 250000, %L, now())',
  :'opp', 'manual', 'eft-1', 'success'), '23514');
insert into public.payments (opportunity_id, provider, reference, amount_cents, status, paid_at, note)
  values (:'opp', 'manual', 'EFT 2026-09-29 FNB ref TEBOS-1', 250000, 'success', now(), 'Seen on the bank statement');
select t8.ok((select recorded_by = :'admin'::uuid from public.payments where reference = 'EFT 2026-09-29 FNB ref TEBOS-1'), 'the EFT is recorded in the admin''s name');
reset role;
select t8.expect_error(format('update public.payments set amount_cents = 1 where opportunity_id = %L', :'opp'), 'TEBOS_EVIDENCE_IMMUTABLE');
select t8.expect_error(format('delete from public.payments where opportunity_id = %L', :'opp'), 'TEBOS_EVIDENCE_IMMUTABLE');
update public.opportunities set status = 'paid' where id = :'opp';

-- contracts come only from lawyer-approved templates
select t8.expect_error(format('update public.opportunities set status = %L where id = %L', 'contract_sent', :'opp'), 'TEBOS_CONTRACT_UNSIGNED');
set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
select t8.expect_error($$insert into public.contract_templates (key, version, plan, title, body, status) values ('diag', 1, 'starter', 'x', 'x', 'approved')$$, 'TEBOS_VALIDATION');
insert into public.contract_templates (key, version, plan, title, body) values ('diagnostic', 1, 'starter', 'TEBOS Diagnostic agreement', 'Between TEBOS and {{business}}.');
reset role;
select t8.expect_error($$insert into public.contracts (opportunity_id, template_key, template_version, title, body, body_hash, token_hash)
  values ('$$ || :'opp' || $$', 'diagnostic', 1, 'x', 'Between TEBOS and Northwind Consulting.', encode(sha256(convert_to('Between TEBOS and Northwind Consulting.', 'UTF8')), 'hex'), 'h1')$$,
  'TEBOS_CONTRACT_UNAPPROVED');
set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
select t8.expect_error($$update public.contract_templates set status = 'approved' where key = 'diagnostic'$$, '23514');
update public.contract_templates set status = 'approved', approval_note = 'Reviewed and approved by our attorney, 29 Sep 2026' where key = 'diagnostic';
select t8.ok((select approved_by = :'admin'::uuid from public.contract_templates where key = 'diagnostic'), 'who approved the template is recorded');
select t8.expect_error($$update public.contract_templates set body = 'changed' where key = 'diagnostic'$$, 'TEBOS_INPUT_FROZEN');
set role anon;
select t8.expect_error('select * from public.contract_templates', '42501');
reset role;

-- the server sends the contract
select t8.expect_error($$insert into public.contracts (opportunity_id, template_key, template_version, title, body, body_hash, token_hash)
  values ('$$ || :'opp' || $$', 'diagnostic', 1, 'x', 'Between TEBOS and Northwind Consulting.', 'wrong-hash', 'h1')$$, '23514');
insert into public.contracts (opportunity_id, template_key, template_version, title, body, body_hash, token_hash)
  values (:'opp', 'diagnostic', 1, 'TEBOS Diagnostic agreement', 'Between TEBOS and Northwind Consulting.',
          encode(sha256(convert_to('Between TEBOS and Northwind Consulting.', 'UTF8')), 'hex'), tebos_private.hash_token('link-token-1'));
update public.opportunities set status = 'contract_sent' where id = :'opp';

-- the client reads and accepts it with the link; no account needed
set role anon;
select t8.ok((select count(*) = 0 from public.contract_for_token('wrong-token')), 'a wrong link shows nothing');
select t8.ok((select business = 'Northwind Consulting' and status = 'sent' from public.contract_for_token('link-token-1')), 'the right link shows the contract');
select t8.expect_error($$select public.accept_contract('link-token-1', 'Thandi Mokoena', 'not-the-hash')$$, 'TEBOS_VALIDATION');
select t8.expect_error($$select public.accept_contract('link-token-1', 'T', encode(sha256(convert_to('Between TEBOS and Northwind Consulting.', 'UTF8')), 'hex'))$$, 'TEBOS_VALIDATION');
select t8.expect_error($$select public.accept_contract('wrong-token', 'Thandi Mokoena', 'x')$$, 'TEBOS_CONTRACT_UNSIGNED');
select set_config('request.headers', '{"x-forwarded-for": "196.25.1.1", "user-agent": "Test browser"}', false);
select public.accept_contract('link-token-1', 'Thandi Mokoena', encode(sha256(convert_to('Between TEBOS and Northwind Consulting.', 'UTF8')), 'hex'));
reset role;
select t8.ok((select status = 'accepted' and accepted_name = 'Thandi Mokoena' and accepted_ip = '196.25.1.1' and accepted_agent = 'Test browser'
              from public.contracts where opportunity_id = :'opp'), 'acceptance is recorded with who, when and from where');
select t8.ok((select status = 'contracted' from public.opportunities where id = :'opp'), 'accepting moves the opportunity on');
select t8.expect_error(format('update public.contracts set accepted_name = %L where opportunity_id = %L', 'Someone else', :'opp'), 'TEBOS_EVIDENCE_IMMUTABLE');
select t8.expect_error(format('update public.contracts set body = %L where opportunity_id = %L', 'changed', :'opp'), 'TEBOS_EVIDENCE_IMMUTABLE');

-- onboarding needs the client's organisation
select t8.expect_error(format('update public.opportunities set status = %L where id = %L', 'onboarded', :'opp'), 'TEBOS_VALIDATION');
insert into public.organisations (name, slug) values ('Northwind Consulting', 'northwind') returning id as client_org \gset
update public.opportunities set org_id = :'client_org', status = 'onboarded' where id = :'opp';

-- maintainers see the clients they look after, and nothing else in the pipeline
set role authenticated;
select set_config('request.jwt.claim.sub', :'maint', false);
select t8.ok((select count(*) = 1 from public.opportunities) and (select id = :'opp'::uuid from public.opportunities), 'a maintainer sees their client');
select t8.ok((select count(*) = 0 from public.payments), 'but not the payments');
reset role;

select t8.ok((select count(*) >= 6 from public.audit_events where entity_type = 'opportunities' and action = 'opportunities.transition'),
  'every step of the pipeline is audited');
