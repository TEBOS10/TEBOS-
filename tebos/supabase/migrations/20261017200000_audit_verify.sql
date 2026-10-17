-- Audit-chain verification: says whether the audit trail is intact, and where it
-- is not. It only reads. It never rewrites, deletes or "repairs" an event.
--
-- How the chain is written (foundation migration, tebos_private.write_audit):
--   * one chain per organisation, and one for platform events (org_id null);
--   * appends to a chain are serialised by a per-chain lock held until commit, so
--     id order is chain order;
--   * each event stores the previous event's hash (prev_hash), and its own hash:
--     sha256(concat_ws('|', prev_hash, occurred_at::text, actor_type, actor_id,
--                       action, entity_type, entity_id::text, before::text, after::text)).
--
-- What each chain is checked for, first problem by id wins:
--   broken_link        an event's prev_hash is not the previous event's hash
--                      (an event was removed or reordered, or a later event's hash changed)
--   content_mismatch   an event's fields no longer give its stored hash (it was edited)
--   unverifiable_start the chain's first event points to an earlier event that isn't
--                      there: what follows is checked, what came before can't be
--   intact             none of the above
--
-- occurred_at::text depends on the writing session's time zone. TEBOS's server and
-- roles are UTC, so events are recomputed in UTC. When an event fails only because
-- it was written by a session in another time zone, timezone_hint says which offset
-- makes it match: a writing-session difference, not a change to the event. It is
-- still reported as a mismatch.
--
-- What a chain alone cannot show: removal of a chain's newest events, or a whole
-- chain rewritten by someone with owner access to the database. last_id and
-- last_hash are returned so a chain's head can be recorded outside the database
-- and compared later.

-- The hash an event should have, recomputed exactly as write_audit computes it.
create function tebos_private.audit_expected_hash(e public.audit_events) returns text
language sql stable set search_path = '' set "TimeZone" = 'UTC' set "DateStyle" = 'ISO, MDY' as $$
  select encode(sha256(convert_to(concat_ws('|', e.prev_hash, e.occurred_at::text, e.actor_type, e.actor_id, e.action,
    e.entity_type, e.entity_id::text, e.before::text, e.after::text), 'UTF8')), 'hex')
$$;

-- For an event whose hash doesn't match in UTC: the UTC offset (e.g. '+02') at which
-- it would match, or null if no whole-zone offset explains it.
create function tebos_private.audit_timezone_hint(e public.audit_events) returns text
language sql stable set search_path = '' set "TimeZone" = 'UTC' set "DateStyle" = 'ISO, MDY' as $$
  with offsets as (
    select distinct utc_offset as off from pg_catalog.pg_timezone_names
     where extract(epoch from utc_offset)::bigint % 60 = 0
  ), rendered as (
    select off,
           case when off < interval '0' then '-' else '+' end
             || lpad((abs(extract(epoch from off)::bigint) / 3600)::text, 2, '0')
             || case when abs(extract(epoch from off)::bigint) % 3600 <> 0
                     then ':' || lpad(((abs(extract(epoch from off)::bigint) % 3600) / 60)::text, 2, '0') else '' end as suffix
      from offsets
     where off <> interval '0'
  )
  select r.suffix from rendered r
   where encode(sha256(convert_to(concat_ws('|', e.prev_hash, (e.occurred_at at time zone r.off)::text || r.suffix,
           e.actor_type, e.actor_id, e.action, e.entity_type, e.entity_id::text, e.before::text, e.after::text), 'UTF8')), 'hex')
         = e.hash
   order by r.off
   limit 1
$$;

-- One row per chain. p_orgs limits which organisation chains are checked (null: all);
-- p_platform includes the platform chain. Reads only.
create function tebos_private.audit_verify(p_orgs uuid[] default null, p_platform boolean default true)
returns table (
  org_id        uuid,
  status        text,
  events        bigint,
  first_id      bigint,
  last_id       bigint,
  last_hash     text,
  first_bad_id  bigint,
  reason        text,
  timezone_hint text
)
language sql stable set search_path = '' as $$
  with scoped as (
    select e.*
      from public.audit_events e
     where (e.org_id is null and p_platform)
        or (e.org_id is not null and (p_orgs is null or e.org_id = any (p_orgs)))
  ), checked as (
    select s.id, s.org_id, s.hash, s.prev_hash,
           row_number() over w as n,
           lag(s.hash) over w as previous_hash,
           s.hash = tebos_private.audit_expected_hash(s::public.audit_events) as content_ok
      from scoped s
    window w as (partition by s.org_id order by s.id)
  ), problems as (
    select c.*,
           case
             when c.n > 1 and c.prev_hash is distinct from c.previous_hash then 'broken_link'
             when not c.content_ok then 'content_mismatch'
           end as problem
      from checked c
  ), chains as (
    select p.org_id,
           count(*) as events,
           min(p.id) as first_id,
           max(p.id) as last_id,
           (array_agg(p.hash order by p.id desc))[1] as last_hash,
           min(p.id) filter (where p.problem is not null) as first_bad_id,
           bool_or(p.n = 1 and p.prev_hash is not null) as starts_mid_chain
      from problems p
     group by p.org_id
  )
  select ch.org_id,
         case when ch.first_bad_id is not null then bad.problem
              when ch.starts_mid_chain then 'unverifiable_start'
              else 'intact' end,
         ch.events, ch.first_id, ch.last_id, ch.last_hash, ch.first_bad_id,
         case
           when bad.problem = 'broken_link' then
             'event ' || ch.first_bad_id || ' does not point to the event before it: an event was removed or reordered, or the one before it was changed'
           when bad.problem = 'content_mismatch' then
             'event ' || ch.first_bad_id || '''s recorded fields no longer give its hash: it was changed after it was written'
           when ch.starts_mid_chain then
             'the first event (' || ch.first_id || ') points to an earlier event that is not here; everything after it was checked'
         end,
         case when bad.problem = 'content_mismatch' then
           (select tebos_private.audit_timezone_hint(a) from public.audit_events a where a.id = ch.first_bad_id) end
    from chains ch
    left join problems bad on bad.id = ch.first_bad_id
   order by ch.org_id nulls first
$$;

-- Checking the trail is for the server and, through audit_chain_status, for people
-- who may already read those events.
revoke all on function tebos_private.audit_expected_hash(public.audit_events) from public, anon, authenticated;
revoke all on function tebos_private.audit_timezone_hint(public.audit_events) from public, anon, authenticated;
revoke all on function tebos_private.audit_verify(uuid[], boolean) from public, anon, authenticated;
grant execute on function tebos_private.audit_expected_hash(public.audit_events) to service_role;
grant execute on function tebos_private.audit_timezone_hint(public.audit_events) to service_role;
grant execute on function tebos_private.audit_verify(uuid[], boolean) to service_role;

-- The chains the signed-in person may see, by the same rule as reading audit_events:
-- their own organisations, and the platform chain for platform admins.
create function public.audit_chain_status()
returns table (
  org_id        uuid,
  status        text,
  events        bigint,
  first_id      bigint,
  last_id       bigint,
  last_hash     text,
  first_bad_id  bigint,
  reason        text,
  timezone_hint text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'sign in to check the audit trail' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
  end if;
  return query
    select v.* from tebos_private.audit_verify(
      array(select m.org_id from public.memberships m where m.user_id = auth.uid()),
      tebos_private.is_platform_admin()) v;
end $$;

revoke all on function public.audit_chain_status() from public, anon;
grant execute on function public.audit_chain_status() to authenticated, service_role;
