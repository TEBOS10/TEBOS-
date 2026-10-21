-- The plan's edition is a ceiling: a business's board holds at most the plan's active flows and pieces.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99zr;
grant usage on schema t99zr to anon, authenticated;
create function t99zr.expect_error(p_sql text, p_expect text) returns void
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
create function t99zr.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
-- add n flows (or pieces) named prefix-1..n to a business
create function t99zr.flows(p_org uuid, p_biz uuid, p_prefix text, p_n int) returns void
language plpgsql as $$ begin
  for i in 1..p_n loop
    insert into public.board_flows (org_id, business_id, name, starts_when, done_when) values (p_org, p_biz, p_prefix || '-' || i, 'a trigger', 'an outcome');
  end loop;
end $$;
create function t99zr.pieces(p_org uuid, p_biz uuid, p_prefix text, p_n int) returns void
language plpgsql as $$ begin
  for i in 1..p_n loop
    insert into public.board_components (org_id, business_id, name, kind) values (p_org, p_biz, p_prefix || '-' || i, 'software');
  end loop;
end $$;
grant execute on all functions in schema t99zr to anon, authenticated;

select '9f9f0000-0000-0000-0000-00000000000a' as owner, '9f9f0000-0000-0000-0000-00000000000b' as admin,
       '9f9f0000-0000-0000-0000-0000000000c1' as org \gset
insert into auth.users (id, email, email_confirmed_at) values (:'owner', 'owner@c99zr.test', now()), (:'admin', 'a@tebos99zr.test', now());
insert into public.platform_admins (user_id) values (:'admin');
insert into public.organisations (id, name, slug) values (:'org', 'Academy 99zr', 'academy-99zr');
insert into public.memberships (org_id, user_id, role) values (:'org', :'owner', 'org_admin');

set role authenticated;
select set_config('request.jwt.claim.sub', :'owner', false);
insert into public.businesses (org_id, name) values (:'org', 'Music academy 99zr') returning id as biz \gset
insert into public.businesses (org_id, name) values (:'org', 'Second branch 99zr') returning id as biz2 \gset

-- ===========================================================================
-- No active plan: the Small ceiling (4 flows, 10 pieces)
-- ===========================================================================
select t99zr.flows(:'org', :'biz', 'core', 4);
select t99zr.expect_error(format($$select t99zr.flows(%L, %L, 'extra', 1)$$, :'org', :'biz'), 'TEBOS_OUT_OF_PLAN');
select t99zr.pieces(:'org', :'biz', 'piece', 10);
select t99zr.expect_error(format($$select t99zr.pieces(%L, %L, 'extra', 1)$$, :'org', :'biz'), 'TEBOS_OUT_OF_PLAN');
-- the ceiling is per business
select t99zr.flows(:'org', :'biz2', 'branch', 4);
-- a blueprint is held to the same ceiling: nothing beyond it is laid down
select t99zr.expect_error(format($$select public.apply_blueprint(%L, '{"key":"education-centre","version":1,"pieces":[],"flows":[{"name":"Weekly numbers to decisions","starts_when":"Monday","done_when":"Owned","owner_role":"Ops","steps":[]}]}'::jsonb)$$, :'biz'), 'TEBOS_OUT_OF_PLAN');

-- retiring one makes room; bringing it back needs room again
update public.board_flows set retired_at = now() where business_id = :'biz' and name = 'core-4';
select t99zr.flows(:'org', :'biz', 'swap', 1);
select t99zr.expect_error(format($$update public.board_flows set retired_at = null where business_id = %L and name = 'core-4'$$, :'biz'), 'TEBOS_OUT_OF_PLAN');
-- other edits to an existing flow are untouched by the ceiling
update public.board_flows set owner_role = 'Head teacher' where business_id = :'biz' and name = 'core-1';
select t99zr.ok((select owner_role = 'Head teacher' from public.board_flows where business_id = :'biz' and name = 'core-1'), 'editing a flow is fine');

-- ===========================================================================
-- On Medium: 10 flows, 30 pieces
-- ===========================================================================
reset role;
select set_config('tebos.actor_type', 'agent', false), set_config('tebos.actor_id', 'tier:sql', false);
insert into public.enquiries (plan, name, business, email) values ('growth', 'O', 'Academy 99zr', 'owner@c99zr.test') returning id as enq \gset
insert into public.opportunities (enquiry_id, plan, contact_name, business, email, org_id)
  values (:'enq', 'growth', 'O', 'Academy 99zr', 'owner@c99zr.test', :'org') returning id as opp \gset
insert into public.billing_accounts (opportunity_id, org_id, plan, monthly_cents, anchor_day, next_invoice_on, status)
  values (:'opp', :'org', 'growth', 250000, 1, current_date, 'active');
-- the server (observing pieces from evidence) is never capped
select t99zr.pieces(:'org', :'biz2', 'observed', 35);

set role authenticated;
select set_config('request.jwt.claim.sub', :'owner', false);
select t99zr.flows(:'org', :'biz', 'team', 6);
select t99zr.ok((select count(*) = 10 from public.board_flows where business_id = :'biz' and retired_at is null), 'Medium holds 10 flows');
select t99zr.expect_error(format($$select t99zr.flows(%L, %L, 'company', 1)$$, :'org', :'biz'), 'TEBOS_OUT_OF_PLAN');
select t99zr.pieces(:'org', :'biz', 'more', 20);
select t99zr.expect_error(format($$select t99zr.pieces(%L, %L, 'company', 1)$$, :'org', :'biz'), 'TEBOS_OUT_OF_PLAN');
select t99zr.expect_error(format($$select t99zr.pieces(%L, %L, 'over', 1)$$, :'org', :'biz2'), 'TEBOS_OUT_OF_PLAN');

-- TEBOS's platform admins (building concept systems) aren't capped
select set_config('request.jwt.claim.sub', :'admin', false);
reset role;
insert into public.memberships (org_id, user_id, role) values (:'org', :'admin', 'org_admin');
set role authenticated;
select t99zr.flows(:'org', :'biz', 'concept', 2);
select t99zr.ok((select count(*) = 12 from public.board_flows where business_id = :'biz' and retired_at is null), 'an admin can build past the ceiling');

reset role;
