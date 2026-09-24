-- TEBOS access control (dossier §24/§33/§34).
--
-- Tenant isolation is enforced by row-level security on every tenant table.
-- Roles per organisation:
--   org_admin — everything inside the organisation, incl. members and connections
--   operator  — runs scans, records evidence/findings, proposes and runs actions
--   approver  — reads everything, decides approvals
--   viewer    — read-only
-- Platform admins manage the global capability/connector registry. They do
-- NOT get implicit access to tenant data.
-- Nothing is deletable by clients except memberships: history is preserved
-- and work is ended through state transitions (cancelled, archived, ...).

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon;
grant usage on schema tebos_private to authenticated, service_role;
revoke execute on function tebos_private.write_audit(uuid, text, text, uuid, jsonb, jsonb) from public;

grant all on all tables in schema public to service_role;
grant select on all tables in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- Global registry: readable by any signed-in user, writable by platform admins
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['state_transitions', 'capabilities', 'connectors', 'connector_capabilities'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy registry_read on public.%I for select to authenticated using (true)', t);
    execute format('create policy registry_write on public.%I for all to authenticated
                      using (tebos_private.is_platform_admin()) with check (tebos_private.is_platform_admin())', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
-- the state machine definitions are code, not configuration
drop policy registry_write on public.state_transitions;
revoke insert, update, delete on public.state_transitions from authenticated;

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------
alter table public.platform_admins enable row level security;
create policy self_read on public.platform_admins for select to authenticated using (user_id = auth.uid());

alter table public.organisations enable row level security;
create policy member_read on public.organisations for select to authenticated
  using (tebos_private.is_member(id));
create policy admin_update on public.organisations for update to authenticated
  using (tebos_private.has_role(id, array['org_admin'])) with check (tebos_private.has_role(id, array['org_admin']));
grant update (name) on public.organisations to authenticated;
grant execute on function public.create_organisation(text, text) to authenticated;

alter table public.memberships enable row level security;
create policy member_read on public.memberships for select to authenticated
  using (tebos_private.is_member(org_id));
create policy admin_write on public.memberships for all to authenticated
  using (tebos_private.has_role(org_id, array['org_admin'])) with check (tebos_private.has_role(org_id, array['org_admin']));
grant insert, update, delete on public.memberships to authenticated;

-- ---------------------------------------------------------------------------
-- Tenant data: members read; operators and org admins write
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['businesses', 'business_contexts', 'sources', 'scans', 'scan_targets', 'evidence',
                           'findings', 'finding_evidence', 'actions', 'action_dependencies', 'action_runs', 'outcomes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy member_read on public.%I for select to authenticated using (tebos_private.is_member(org_id))', t);
    execute format('create policy operator_insert on public.%I for insert to authenticated
                      with check (tebos_private.has_role(org_id, array[''org_admin'', ''operator'']))', t);
    execute format('create policy operator_update on public.%I for update to authenticated
                      using (tebos_private.has_role(org_id, array[''org_admin'', ''operator'']))
                      with check (tebos_private.has_role(org_id, array[''org_admin'', ''operator'']))', t);
    execute format('grant insert, update on public.%I to authenticated', t);
  end loop;
end $$;

-- Approvals: operators request, approvers / org admins decide.
alter table public.approvals enable row level security;
create policy member_read on public.approvals for select to authenticated using (tebos_private.is_member(org_id));
create policy request on public.approvals for insert to authenticated
  with check (tebos_private.has_role(org_id, array['org_admin', 'operator']) and status = 'pending');
create policy decide on public.approvals for update to authenticated
  using (tebos_private.has_role(org_id, array['org_admin', 'approver']))
  with check (tebos_private.has_role(org_id, array['org_admin', 'approver']));
grant insert, update on public.approvals to authenticated;

-- Connections and credential references: org admins manage, operators read.
alter table public.connection_instances enable row level security;
create policy member_read on public.connection_instances for select to authenticated using (tebos_private.is_member(org_id));
create policy admin_write on public.connection_instances for all to authenticated
  using (tebos_private.has_role(org_id, array['org_admin'])) with check (tebos_private.has_role(org_id, array['org_admin']));
grant insert, update on public.connection_instances to authenticated;

alter table public.credential_references enable row level security;
create policy operator_read on public.credential_references for select to authenticated
  using (tebos_private.has_role(org_id, array['org_admin', 'operator']));
create policy admin_write on public.credential_references for all to authenticated
  using (tebos_private.has_role(org_id, array['org_admin'])) with check (tebos_private.has_role(org_id, array['org_admin']));
grant insert, update on public.credential_references to authenticated;
-- vault_ref is resolved server-side only; clients never read it
revoke select on public.credential_references from authenticated;
grant select (id, org_id, connector_key, label, created_by, created_at, rotated_at, revoked_at)
  on public.credential_references to authenticated;

-- Written by trusted server code (service role) only; members may read.
do $$
declare t text;
begin
  foreach t in array array['integration_events', 'agent_runs', 'tool_calls'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy member_read on public.%I for select to authenticated using (tebos_private.is_member(org_id))', t);
  end loop;
end $$;

-- Audit trail: tenant members read their own organisation's events; platform
-- events are visible to platform admins. Nobody writes directly.
alter table public.audit_events enable row level security;
create policy member_read on public.audit_events for select to authenticated
  using ((org_id is not null and tebos_private.is_member(org_id))
         or (org_id is null and tebos_private.is_platform_admin()));
revoke insert, update, delete, truncate on public.audit_events from service_role;

-- Rows never move between tenants or businesses.
create function tebos_private.freeze_tenant_keys() returns trigger
language plpgsql as $$
begin
  if to_jsonb(new) -> 'org_id' is distinct from to_jsonb(old) -> 'org_id'
     or to_jsonb(new) -> 'business_id' is distinct from to_jsonb(old) -> 'business_id' then
    raise exception '% rows cannot move between organisations or businesses', tg_table_name
      using errcode = '42501', hint = 'TEBOS_TENANT_KEY_FROZEN';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['memberships', 'businesses', 'business_contexts', 'sources', 'scans', 'scan_targets',
                           'evidence', 'findings', 'finding_evidence', 'actions', 'action_dependencies', 'approvals',
                           'action_runs', 'outcomes', 'credential_references', 'connection_instances',
                           'integration_events', 'agent_runs', 'tool_calls'] loop
    execute format('create trigger freeze_tenant_keys before update on public.%I
                      for each row execute function tebos_private.freeze_tenant_keys()', t);
  end loop;
end $$;
