-- Audit-chain verification: an untouched trail reads as intact; an edited event,
-- a removed event, a forged event and a chain with missing history are each found
-- at the right event; checking never writes. Every tampering below happens inside
-- a transaction that is rolled back, so no audit record is ever left changed.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99zl;
grant usage on schema t99zl to anon, authenticated;
create function t99zl.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
create function t99zl.refused(p_sql text) returns boolean
language plpgsql as $$
begin
  begin execute p_sql; exception when insufficient_privilege then return true; end;
  return false;
end $$;
-- one organisation's chain
create function t99zl.status(p_org uuid) returns text
language sql as $$ select status from tebos_private.audit_verify(array[p_org], false) $$;
create function t99zl.first_bad(p_org uuid) returns bigint
language sql as $$ select first_bad_id from tebos_private.audit_verify(array[p_org], false) $$;
grant execute on all functions in schema t99zl to anon, authenticated;

select '9f5f0000-0000-0000-0000-00000000001a' as member \gset
select '9f5f0000-0000-0000-0000-00000000001b' as outsider \gset
select '9f5f0000-0000-0000-0000-00000000001c' as padmin \gset
insert into auth.users (id, email, email_confirmed_at) values
  (:'member', 'member@p99zj.test', now()), (:'outsider', 'outsider@p99zj.test', now()), (:'padmin', 'padmin@p99zj.test', now());

insert into public.organisations (name, slug) values ('Chain A 99zj', 'chain-a-99zj') returning id as org_a \gset
insert into public.organisations (name, slug) values ('Chain B 99zj', 'chain-b-99zj') returning id as org_b \gset
select tebos_private.write_audit(:'org_a', 'test.event', 'test', null, null, jsonb_build_object('n', n)) from generate_series(1, 4) n;
select tebos_private.write_audit(:'org_b', 'test.event', 'test', null, '{"before": true}', null);

-- ---------------------------------------------------------------------------
-- Untouched history
-- ---------------------------------------------------------------------------
select t99zl.ok(t99zl.status(:'org_a') = 'intact', 'an untouched chain is intact');
select t99zl.ok((select events = 5 and first_bad_id is null and reason is null and last_hash is not null
                   from tebos_private.audit_verify(array[:'org_a'::uuid], false)), 'it counts every event and names no problem');
select t99zl.ok(t99zl.status(:'org_b') = 'intact', 'another organisation''s chain is checked on its own');
select t99zl.ok((select count(*) = 1 and bool_and(org_id is null) and bool_and(status = 'intact')
                   from tebos_private.audit_verify(array[]::uuid[], true)), 'the platform chain is checked on its own, and intact');

-- everything written so far by the real triggers in this database, every earlier
-- test file included (redacted money records among them), verifies
select t99zl.ok((select count(*) = 0 from tebos_private.audit_verify() where status <> 'intact'),
  'every chain written by the triggers verifies');
select t99zl.ok(exists (select 1 from public.audit_events where action = 'res_money_items.insert'),
  'the redacted money-record events are among them');

-- checking writes nothing
select count(*) as before_count from public.audit_events \gset
select count(*) from tebos_private.audit_verify();
select count(*) from public.audit_events \gset after_
select t99zl.ok(:after_count = :before_count, 'verifying adds no audit event');

-- the middle of chain A, and the event after it
select id as mid from public.audit_events where org_id = :'org_a' order by id offset 2 limit 1 \gset
select id as next from public.audit_events where org_id = :'org_a' and id > :mid order by id limit 1 \gset

-- ---------------------------------------------------------------------------
-- An event edited after it was written
-- ---------------------------------------------------------------------------
begin;
set local session_replication_role = replica; -- the test's way past the append-only trigger
update public.audit_events set after = '{"n": 99}' where id = :mid;
select t99zl.ok(t99zl.status(:'org_a') = 'content_mismatch', 'an edited event is found');
select t99zl.ok(t99zl.first_bad(:'org_a') = :mid, 'at the edited event');
select t99zl.ok((select timezone_hint is null and reason like '%changed after it was written%'
                   from tebos_private.audit_verify(array[:'org_a'::uuid], false)), 'and it is not explained by a time zone');
select t99zl.ok(t99zl.status(:'org_b') = 'intact', 'the other organisation is unaffected');
rollback;

-- edited, with its hash recomputed to match: the next event no longer points to it
begin;
set local session_replication_role = replica;
update public.audit_events set after = '{"n": 99}' where id = :mid;
update public.audit_events e set hash = tebos_private.audit_expected_hash(e) where id = :mid;
select t99zl.ok(t99zl.status(:'org_a') = 'broken_link', 'rehashing an edited event breaks the next link');
select t99zl.ok(t99zl.first_bad(:'org_a') = :next, 'found at the event after it');
rollback;

-- ---------------------------------------------------------------------------
-- An event removed
-- ---------------------------------------------------------------------------
begin;
set local session_replication_role = replica;
delete from public.audit_events where id = :mid;
select t99zl.ok(t99zl.status(:'org_a') = 'broken_link', 'a removed event is found');
select t99zl.ok(t99zl.first_bad(:'org_a') = :next, 'at the event that pointed past it');
select t99zl.ok((select reason like '%removed or reordered%' from tebos_private.audit_verify(array[:'org_a'::uuid], false)),
  'and the reason says so');
rollback;

-- ---------------------------------------------------------------------------
-- A forged event: right link, wrong hash
-- ---------------------------------------------------------------------------
begin;
insert into public.audit_events (org_id, actor_type, actor_id, action, entity_type, prev_hash, hash)
select :'org_a', 'user', 'someone', 'test.forged', 'test', hash, repeat('0', 64)
  from public.audit_events where org_id = :'org_a' order by id desc limit 1
returning id as forged \gset
select t99zl.ok(t99zl.status(:'org_a') = 'content_mismatch' and t99zl.first_bad(:'org_a') = :forged, 'a forged event is found');
rollback;

-- ---------------------------------------------------------------------------
-- History that starts part-way
-- ---------------------------------------------------------------------------
begin;
set local session_replication_role = replica; -- no "organisation created" event for this one
insert into public.organisations (name, slug) values ('Chain C 99zj', 'chain-c-99zj') returning id as org_c \gset
insert into public.audit_events (org_id, occurred_at, actor_type, action, entity_type, prev_hash, hash)
values (:'org_c', '2026-10-17 10:00:00+00', 'system', 'test.event', 'test', repeat('a', 64), 'pending')
returning id as orphan \gset
update public.audit_events e set hash = tebos_private.audit_expected_hash(e) where id = :orphan;
select t99zl.ok(t99zl.status(:'org_c') = 'unverifiable_start', 'missing earlier history is reported as such');
select t99zl.ok(t99zl.first_bad(:'org_c') is null, 'it is not reported as a change');
rollback;

-- ---------------------------------------------------------------------------
-- An event written by a session in another time zone
-- ---------------------------------------------------------------------------
begin;
set local timezone = 'Africa/Johannesburg';
select tebos_private.write_audit(:'org_a', 'test.event', 'test', null, null, '{"zone": "+02"}');
select id as zoned from public.audit_events where org_id = :'org_a' order by id desc limit 1 \gset
select t99zl.ok(t99zl.status(:'org_a') = 'content_mismatch' and t99zl.first_bad(:'org_a') = :zoned,
  'an event hashed in another time zone does not verify in UTC');
select t99zl.ok((select timezone_hint = '+02' from tebos_private.audit_verify(array[:'org_a'::uuid], false)),
  'and the hint names the offset that explains it');
rollback;
select t99zl.ok(t99zl.status(:'org_a') = 'intact', 'after every rollback, chain A is intact again');

-- ---------------------------------------------------------------------------
-- Who may check
-- ---------------------------------------------------------------------------
insert into public.memberships (org_id, user_id, role) values (:'org_a', :'member', 'operator');
insert into public.platform_admins (user_id) values (:'padmin');

set role anon;
select t99zl.ok(t99zl.refused('select * from public.audit_chain_status()'), 'a visitor cannot check');
select t99zl.ok(t99zl.refused('select * from tebos_private.audit_verify()'), 'nor run the verifier directly');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '', false);
select t99zl.ok(t99zl.refused('select * from public.audit_chain_status()'), 'signing in is required');
select set_config('request.jwt.claim.sub', :'member', false);
select t99zl.ok(t99zl.refused('select * from tebos_private.audit_verify()'), 'a member cannot run the verifier directly');
select t99zl.ok((select count(*) = 1 and bool_and(org_id = :'org_a') and bool_and(status = 'intact')
                   from public.audit_chain_status()), 'a member sees their own organisation''s chain only');
select set_config('request.jwt.claim.sub', :'outsider', false);
select t99zl.ok((select count(*) = 0 from public.audit_chain_status()), 'someone in no organisation sees no chain');
select set_config('request.jwt.claim.sub', :'padmin', false);
select t99zl.ok((select count(*) = 1 and bool_and(org_id is null) from public.audit_chain_status()),
  'a platform admin sees the platform chain');
reset role;
select set_config('request.jwt.claim.sub', '', false);
