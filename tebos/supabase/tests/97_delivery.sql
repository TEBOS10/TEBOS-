-- Client delivery: the server sets the plan; only the client's maintainer (or
-- an admin) closes a step, once, with a note; the client's team can see
-- their plan; nobody else sees it.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t97;
grant usage on schema t97 to anon, authenticated;
create function t97.expect_error(p_sql text, p_expect text) returns void
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
create function t97.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t97 to anon, authenticated;

select '97000000-0000-0000-0000-00000000000a' as maint, '97000000-0000-0000-0000-00000000000b' as other_maint,
       '97000000-0000-0000-0000-00000000000c' as client, '97000000-0000-0000-0000-00000000000d' as stranger,
       '97000000-0000-0000-0000-0000000000c1' as org \gset
insert into auth.users (id, email, email_confirmed_at) values
  (:'maint', 'm@tebos.test', now()), (:'other_maint', 'm2@tebos.test', now()), (:'client', 'owner@client97.test', now()), (:'stranger', 's@x97.test', now());
insert into public.platform_staff (user_id, role) values (:'maint', 'maintainer'), (:'other_maint', 'maintainer');
insert into public.organisations (id, name, slug) values (:'org', 'Client 97', 'client-97');
insert into public.memberships (org_id, user_id, role) values (:'org', :'client', 'org_admin'), (:'org', :'maint', 'operator');

-- the server onboards a client and sets its plan
select set_config('tebos.actor_type', 'agent', false), set_config('tebos.actor_id', 'pipeline-worker:sql', false);
insert into public.enquiries (plan, name, business, email) values ('starter', 'O', 'Client 97', 'owner@client97.test') returning id as enq \gset
insert into public.opportunities (enquiry_id, plan, contact_name, business, email, maintainer_id, org_id)
  values (:'enq', 'starter', 'O', 'Client 97', 'owner@client97.test', :'maint', :'org') returning id as opp \gset
insert into public.delivery_tasks (opportunity_id, org_id, key, position, title, done_means, due_at) values
  (:'opp', :'org', 'kickoff', 1, 'Kick-off call', 'Met the owner and agreed the flows.', now() + interval '2 days'),
  (:'opp', :'org', 'board', 2, 'Board mapped', 'The main flows are on the board.', now() - interval '1 day');
select id as kickoff from public.delivery_tasks where key = 'kickoff' and opportunity_id = :'opp' \gset
select id as board from public.delivery_tasks where key = 'board' and opportunity_id = :'opp' \gset

set role authenticated;
-- nobody but the server sets steps
select set_config('request.jwt.claim.sub', :'maint', false);
select t97.expect_error(format($$insert into public.delivery_tasks (opportunity_id, org_id, key, position, title, done_means, due_at)
  values (%L, %L, 'extra', 3, 'x', 'y', now())$$, :'opp', :'org'), '42501');
-- a stranger sees nothing; another maintainer sees nothing and changes nothing
select set_config('request.jwt.claim.sub', :'stranger', false);
select t97.ok((select count(*) = 0 from public.delivery_tasks), 'a stranger sees no delivery steps');
select set_config('request.jwt.claim.sub', :'other_maint', false);
select t97.ok((select count(*) = 0 from public.delivery_tasks), 'another maintainer sees no one else''s client');
update public.delivery_tasks set status = 'done', note = 'not mine' where id = :'kickoff';
-- the client's team sees their plan, read-only
select set_config('request.jwt.claim.sub', :'client', false);
select t97.ok((select count(*) = 2 from public.delivery_tasks), 'the client sees their plan');
update public.delivery_tasks set status = 'done', note = 'we did it ourselves' where id = :'kickoff';
select set_config('request.jwt.claim.sub', :'maint', false);
select t97.ok((select status = 'open' from public.delivery_tasks where id = :'kickoff'), 'only the maintainer closes a step');
-- the maintainer closes a step, with a note, once
select t97.expect_error(format($$update public.delivery_tasks set status = 'done' where id = %L$$, :'kickoff'), '23514');
select t97.expect_error(format($$update public.delivery_tasks set due_at = now() + interval '30 days' where id = %L$$, :'board'), '42501');
select t97.expect_error(format($$update public.delivery_tasks set note = 'sneaky' where id = %L$$, :'kickoff'), 'TEBOS_VALIDATION');
update public.delivery_tasks set status = 'done', note = 'Kick-off held; agreed sales and delivery flows' where id = :'kickoff';
select t97.ok((select closed_by = :'maint' and closed_at is not null from public.delivery_tasks where id = :'kickoff'), 'who closed it is recorded');
select t97.expect_error(format($$update public.delivery_tasks set status = 'skipped', note = 'changed my mind' where id = %L$$, :'kickoff'), 'TEBOS_ILLEGAL_TRANSITION');
select t97.expect_error(format('delete from public.delivery_tasks where id = %L', :'board'), '42501');
reset role;

-- TEBOS's own board counts what's overdue
select t97.ok((select (tebos_private.company_snapshot() -> 'delivery' ->> 'steps_overdue')::int >= 1), 'overdue steps are counted');
select t97.ok((select count(*) >= 1 from public.audit_events where entity_type = 'delivery_tasks' and action = 'delivery_tasks.transition'), 'closing a step is audited');
