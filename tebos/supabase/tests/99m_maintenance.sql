-- The maintainer's queue: TEBOS raises items from the client's records; only
-- the client's maintainer (or a platform admin) sees and closes them, with a
-- note; the client's own team doesn't see TEBOS's working list.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99m;
grant usage on schema t99m to anon, authenticated;
create function t99m.expect_error(p_sql text, p_expect text) returns void
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
create function t99m.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t99m to anon, authenticated;

select '99a00000-0000-0000-0000-00000000000a' as admin, '99a00000-0000-0000-0000-00000000000b' as maint,
       '99a00000-0000-0000-0000-00000000000c' as other_maint, '99a00000-0000-0000-0000-00000000000d' as client,
       '99a00000-0000-0000-0000-0000000000c1' as org, '99a00000-0000-0000-0000-0000000000c2' as own_org \gset
insert into auth.users (id, email, email_confirmed_at) values
  (:'admin', 'a@t99m.test', now()), (:'maint', 'm@t99m.test', now()), (:'other_maint', 'm2@t99m.test', now()), (:'client', 'c@c99m.test', now());
insert into public.platform_admins (user_id) values (:'admin');
insert into public.platform_staff (user_id, role) values (:'maint', 'maintainer'), (:'other_maint', 'maintainer');
insert into public.organisations (id, name, slug) values (:'org', 'Client 99m', 'client-99m'), (:'own_org', 'Own 99m', 'own-99m');
insert into public.memberships (org_id, user_id, role) values (:'org', :'client', 'org_admin'), (:'org', :'maint', 'operator');

select set_config('tebos.actor_type', 'agent', false), set_config('tebos.actor_id', 'maintenance-worker:sql', false);
insert into public.enquiries (plan, name, business, email) values ('starter', 'C', 'Client 99m', 'c@c99m.test') returning id as enq \gset
insert into public.opportunities (enquiry_id, plan, contact_name, business, email, maintainer_id, org_id)
  values (:'enq', 'starter', 'C', 'Client 99m', 'c@c99m.test', :'maint', :'org') returning id as opp \gset

-- the server raises items, one open item per client, kind and subject
insert into public.maintainer_items (org_id, opportunity_id, kind, subject_id, severity, title, detail)
  values (:'org', :'opp', 'connection_broken', '99a00000-0000-0000-0000-0000000000f1', 'high', 'CRM is disconnected', 'Since yesterday.') returning id as item \gset
select t99m.expect_error(format($$insert into public.maintainer_items (org_id, opportunity_id, kind, subject_id, severity, title, detail)
  values (%L, %L, 'connection_broken', '99a00000-0000-0000-0000-0000000000f1', 'high', 'again', 'again')$$, :'org', :'opp'), '23505');
insert into public.maintainer_items (org_id, opportunity_id, kind, severity, title, detail)
  values (:'org', :'opp', 'findings_waiting', 'medium', '2 findings waiting', 'The oldest has waited 4 days.') returning id as item2 \gset
-- TEBOS's own organisation: no maintainer, so platform admins
insert into public.maintainer_items (org_id, kind, severity, title, detail)
  values (:'own_org', 'approvals_waiting', 'high', '1 approval waiting', 'Remind the approver.') returning id as own_item \gset

set role authenticated;
select set_config('request.jwt.claim.sub', :'maint', false);
select t99m.expect_error(format($$insert into public.maintainer_items (org_id, opportunity_id, kind, severity, title, detail)
  values (%L, %L, 'findings_waiting', 'medium', 'x', 'y')$$, :'org', :'opp'), '42501');
select t99m.ok((select count(*) = 2 from public.maintainer_items), 'the maintainer sees their client''s items, not TEBOS''s own');
select t99m.expect_error(format($$update public.maintainer_items set status = 'done' where id = %L$$, :'item'), '23514');
select t99m.expect_error(format($$update public.maintainer_items set status = 'resolved', note = 'fine now' where id = %L$$, :'item'), 'TEBOS_ILLEGAL_TRANSITION');
select t99m.expect_error(format($$update public.maintainer_items set note = 'thinking' where id = %L$$, :'item'), 'TEBOS_VALIDATION');
update public.maintainer_items set status = 'done', note = 'Client reconnected the CRM with me on a call' where id = :'item';
select t99m.ok((select closed_by = :'maint' and closed_at is not null from public.maintainer_items where id = :'item'), 'who closed it is recorded');
select t99m.expect_error(format($$update public.maintainer_items set status = 'dismissed', note = 'changed my mind' where id = %L$$, :'item'), 'TEBOS_ILLEGAL_TRANSITION');
select set_config('request.jwt.claim.sub', :'other_maint', false);
select t99m.ok((select count(*) = 0 from public.maintainer_items), 'another maintainer sees nothing');
select set_config('request.jwt.claim.sub', :'client', false);
select t99m.ok((select count(*) = 0 from public.maintainer_items), 'the client doesn''t see TEBOS''s working list');
select set_config('request.jwt.claim.sub', :'admin', false);
select t99m.ok((select count(*) = 3 from public.maintainer_items where org_id in (:'org', :'own_org')), 'a platform admin sees every item, TEBOS''s own included');
update public.maintainer_items set status = 'dismissed', note = 'Waiting on the client''s holiday' where id = :'own_item';
reset role;

-- the server resolves items whose condition cleared
update public.maintainer_items set status = 'resolved', closed_at = now() where id = :'item2';
select t99m.ok((select status = 'resolved' from public.maintainer_items where id = :'item2'), 'the server resolves what cleared');
select t99m.ok((select count(*) >= 3 from public.audit_events where entity_type = 'maintainer_items'), 'the queue is audited');
select t99m.ok((select (tebos_private.company_snapshot() -> 'maintenance' ->> 'closed_30_days')::int >= 3), 'TEBOS''s board counts closed items');
