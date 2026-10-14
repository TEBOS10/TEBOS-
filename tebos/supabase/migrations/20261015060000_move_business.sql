-- Moving a business to another organisation, the one sanctioned way.
--
-- Records never change organisation: freeze_tenant_keys refuses it on every
-- tenant table, evidence and measurements are never edited, and RLS keeps each
-- organisation to its own rows. The founder approved (14 Oct 2026) separating
-- the businesses that shared one organisation into one organisation each
-- (docs/audit/2026-10-14-platform-audit.md, section 3), which needs exactly one
-- exception, and only this one:
--
--   * tebos_private.move_business(business, to_org) moves a business and every
--     record that belongs to it in one statement, so every composite key holds
--     at the end. Only TEBOS's server can call it: never a signed-in person,
--     never the API.
--   * While it runs, the guards accept an update that changes nothing but
--     org_id, from the business's organisation to the named one, for that
--     business's rows. Any other change, any other organisation, any other
--     business, or any call from a client session is refused as before.
--   * A business with client-pipeline records (an opportunity) is refused: its
--     contract, invoices and delivery belong to the client's organisation.
--   * Audit history stays where it was written: events are never rewritten.

create function tebos_private.is_sanctioned_move(p_old jsonb, p_new jsonb) returns boolean
language sql stable set search_path = '' as $$
  select not tebos_private.is_client()
     and coalesce(current_setting('tebos.move_to_org', true), '') <> ''
     and p_new ->> 'org_id' = current_setting('tebos.move_to_org', true)
     and p_old ->> 'org_id' = current_setting('tebos.move_from_org', true)
     and (p_new ->> 'business_id' is null or p_new ->> 'business_id' = current_setting('tebos.move_business', true))
     and (p_new - 'org_id' - 'updated_at') = (p_old - 'org_id' - 'updated_at')
$$;

create or replace function tebos_private.freeze_tenant_keys() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) -> 'org_id' is distinct from to_jsonb(old) -> 'org_id'
      or to_jsonb(new) -> 'business_id' is distinct from to_jsonb(old) -> 'business_id')
     and not tebos_private.is_sanctioned_move(to_jsonb(old), to_jsonb(new)) then
    raise exception '% rows cannot move between organisations or businesses', tg_table_name
      using errcode = '42501', hint = 'TEBOS_TENANT_KEY_FROZEN';
  end if;
  return new;
end $$;

create or replace function tebos_private.guard_evidence_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tebos_private.is_sanctioned_move(to_jsonb(old), to_jsonb(new)) then
    return new;
  end if;
  if (new.fact, new.excerpt, new.structured_value, new.source_id, new.scan_id, new.scan_target_id,
      new.retrieved_at, new.content_location, new.business_id, new.org_id)
     is distinct from
     (old.fact, old.excerpt, old.structured_value, old.source_id, old.scan_id, old.scan_target_id,
      old.retrieved_at, old.content_location, old.business_id, old.org_id) then
    raise exception 'evidence content is immutable; record new evidence instead'
      using errcode = 'P0001', hint = 'TEBOS_EVIDENCE_IMMUTABLE';
  end if;
  if old.state <> new.state and new.state not in ('stale', 'conflicting', 'unsupported') then
    raise exception 'evidence state may only move to stale, conflicting or unsupported'
      using errcode = 'P0001', hint = 'TEBOS_EVIDENCE_IMMUTABLE';
  end if;
  return new;
end $$;

create or replace function tebos_private.guard_measurement() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_state text;
  v_source text;
  v_structured jsonb;
  v_retrieved timestamptz;
  v_created timestamptz;
  v_raw text;
  v_value numeric;
begin
  if tg_op = 'UPDATE' then
    if tebos_private.is_sanctioned_move(to_jsonb(old), to_jsonb(new)) then
      return new;
    end if;
    raise exception 'measurements are never edited; record a new one'
      using errcode = 'P0001', hint = 'TEBOS_EVIDENCE_IMMUTABLE';
  end if;

  select e.state, s.source_type, e.structured_value, e.retrieved_at, e.created_at
    into v_state, v_source, v_structured, v_retrieved, v_created
    from public.evidence e join public.sources s on s.id = e.source_id
   where e.id = new.evidence_id and e.business_id = new.business_id;
  if not found or v_state in ('unavailable', 'unsupported') then
    raise exception 'a measurement must cite evidence that was obtained'
      using errcode = 'P0001', hint = 'TEBOS_MEASUREMENT_UNSUPPORTED';
  end if;

  if new.basis = 'measured' then
    if v_source not in ('connected_system', 'system')
       or v_state not in ('acquired', 'partially_acquired', 'system_generated') then
      raise exception 'a measured value must come from a connected system''s evidence'
        using errcode = 'P0001', hint = 'TEBOS_MEASUREMENT_UNSUPPORTED';
    end if;
    v_raw := v_structured #>> new.value_path;
    if v_raw is null or v_raw !~ '^-?[0-9]+(\.[0-9]+)?$' then
      raise exception 'the evidence holds no number at %', array_to_string(new.value_path, '.')
        using errcode = 'P0001', hint = 'TEBOS_MEASUREMENT_UNSUPPORTED';
    end if;
    v_value := v_raw::numeric;
    if new.value is not null and new.value <> v_value then
      raise exception 'a measured value is read from the evidence, not typed in'
        using errcode = 'P0001', hint = 'TEBOS_MEASUREMENT_UNSUPPORTED';
    end if;
    new.value := v_value;
    new.measured_at := v_retrieved;
  else
    if v_source <> 'user_statement' then
      raise exception 'a stated value must cite the owner''s own statement'
        using errcode = 'P0001', hint = 'TEBOS_MEASUREMENT_UNSUPPORTED';
    end if;
    new.measured_at := coalesce(v_retrieved, v_created);
  end if;

  if tebos_private.is_client() then
    new.recorded_by := auth.uid();
  end if;
  return new;
end $$;

create function tebos_private.move_business(p_business uuid, p_to_org uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_from uuid;
  v_moved jsonb;
begin
  if tebos_private.is_client() then
    raise exception 'only TEBOS''s server moves a business between organisations'
      using errcode = '42501', hint = 'TEBOS_SERVER_ONLY';
  end if;
  select org_id into v_from from public.businesses where id = p_business for update;
  if v_from is null then
    raise exception 'there is no business %', p_business using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  if v_from = p_to_org or not exists (select 1 from public.organisations where id = p_to_org) then
    raise exception 'move a business to a different, existing organisation' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  if exists (select 1 from public.opportunities where business_id = p_business) then
    raise exception 'a client''s business stays with its contract, invoices and delivery; it can''t be moved'
      using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  -- a credential shared with a business that stays behind can't come along
  if exists (
    select 1 from public.connection_instances mine
      join public.connection_instances other
        on other.business_id is distinct from p_business and other.org_id = v_from
       and (other.credential_ref_id in (mine.credential_ref_id, mine.webhook_credential_ref_id)
            or other.webhook_credential_ref_id in (mine.credential_ref_id, mine.webhook_credential_ref_id))
     where mine.business_id = p_business) then
    raise exception 'this business shares a credential with another; separate them first'
      using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;

  perform set_config('tebos.move_business', p_business::text, true),
          set_config('tebos.move_from_org', v_from::text, true),
          set_config('tebos.move_to_org', p_to_org::text, true);

  -- one statement, so every (id, org_id) key is consistent when it's checked
  with
    b   as (update public.businesses set org_id = p_to_org where id = p_business returning 1),
    ctx as (update public.business_contexts set org_id = p_to_org where business_id = p_business returning 1),
    src as (update public.sources set org_id = p_to_org where business_id = p_business returning 1),
    sc  as (update public.scans set org_id = p_to_org where business_id = p_business returning 1),
    st  as (update public.scan_targets set org_id = p_to_org
             where scan_id in (select id from public.scans where business_id = p_business) returning 1),
    ev  as (update public.evidence set org_id = p_to_org where business_id = p_business returning 1),
    ar  as (update public.agent_runs set org_id = p_to_org where business_id = p_business returning 1),
    tc  as (update public.tool_calls set org_id = p_to_org
             where agent_run_id in (select id from public.agent_runs where business_id = p_business) returning 1),
    ci  as (update public.connection_instances set org_id = p_to_org where business_id = p_business returning 1),
    ie  as (update public.integration_events set org_id = p_to_org
             where connection_instance_id in (select id from public.connection_instances where business_id = p_business) returning 1),
    cr  as (update public.credential_references set org_id = p_to_org
             where id in (select credential_ref_id from public.connection_instances where business_id = p_business
                          union select webhook_credential_ref_id from public.connection_instances where business_id = p_business) returning 1),
    fi  as (update public.findings set org_id = p_to_org where business_id = p_business returning 1),
    fe  as (update public.finding_evidence set org_id = p_to_org where business_id = p_business returning 1),
    ac  as (update public.actions set org_id = p_to_org where business_id = p_business returning 1),
    ad  as (update public.action_dependencies set org_id = p_to_org where business_id = p_business returning 1),
    ap  as (update public.approvals set org_id = p_to_org
             where action_id in (select id from public.actions where business_id = p_business) returning 1),
    arn as (update public.action_runs set org_id = p_to_org
             where action_id in (select id from public.actions where business_id = p_business) returning 1),
    oc  as (update public.outcomes set org_id = p_to_org
             where action_id in (select id from public.actions where business_id = p_business) returning 1),
    iv  as (update public.interview_sessions set org_id = p_to_org where business_id = p_business returning 1),
    ob  as (update public.objectives set org_id = p_to_org where business_id = p_business returning 1),
    om  as (update public.objective_measurements set org_id = p_to_org where business_id = p_business returning 1),
    bc  as (update public.board_components set org_id = p_to_org where business_id = p_business returning 1),
    bf  as (update public.board_flows set org_id = p_to_org where business_id = p_business returning 1),
    bs  as (update public.board_steps set org_id = p_to_org where business_id = p_business returning 1),
    sp  as (update public.step_proposals set org_id = p_to_org where business_id = p_business returning 1)
  select jsonb_build_object(
    'businesses', (select count(*) from b), 'business_contexts', (select count(*) from ctx), 'sources', (select count(*) from src),
    'scans', (select count(*) from sc), 'scan_targets', (select count(*) from st), 'evidence', (select count(*) from ev),
    'agent_runs', (select count(*) from ar), 'tool_calls', (select count(*) from tc), 'connection_instances', (select count(*) from ci),
    'integration_events', (select count(*) from ie), 'credential_references', (select count(*) from cr), 'findings', (select count(*) from fi),
    'finding_evidence', (select count(*) from fe), 'actions', (select count(*) from ac), 'action_dependencies', (select count(*) from ad),
    'approvals', (select count(*) from ap), 'action_runs', (select count(*) from arn), 'outcomes', (select count(*) from oc),
    'interview_sessions', (select count(*) from iv), 'objectives', (select count(*) from ob), 'objective_measurements', (select count(*) from om),
    'board_components', (select count(*) from bc), 'board_flows', (select count(*) from bf), 'board_steps', (select count(*) from bs),
    'step_proposals', (select count(*) from sp))
    into v_moved;

  perform set_config('tebos.move_business', '', true),
          set_config('tebos.move_from_org', '', true),
          set_config('tebos.move_to_org', '', true);
  return v_moved;
end $$;
revoke all on function tebos_private.move_business(uuid, uuid) from public, anon, authenticated;
-- is_sanctioned_move stays callable: the tenant guards run as whoever is writing, and it answers no to every client
