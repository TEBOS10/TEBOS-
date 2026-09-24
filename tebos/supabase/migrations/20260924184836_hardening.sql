-- Hardening after the first Supabase advisor run on tebos-core.
--
-- 1. Pin search_path on the remaining tebos_private functions
--    (lint 0011_function_search_path_mutable).
-- 2. create_organisation is for signed-in users only: EXECUTE was still
--    inherited by anon through PUBLIC (lint 0028).
-- 3. Evaluate auth.uid() once per statement in platform_admins (lint 0003).
-- 4. Split "for all" write policies into per-command policies so SELECT is
--    governed by exactly one policy per table (lint 0006). Access is unchanged.

alter function tebos_private.actor_type() set search_path = '';
alter function tebos_private.actor_id() set search_path = '';
alter function tebos_private.audit_append_only() set search_path = '';
alter function tebos_private.touch_updated_at() set search_path = '';
alter function tebos_private.guard_evidence_immutable() set search_path = '';
alter function tebos_private.guard_action_run() set search_path = '';
alter function tebos_private.finish_agent_run() set search_path = '';
alter function tebos_private.freeze_tenant_keys() set search_path = '';

revoke execute on function public.create_organisation(text, text) from public, anon;
grant execute on function public.create_organisation(text, text) to authenticated;

drop policy self_read on public.platform_admins;
create policy self_read on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()));

-- Registry tables: platform admins write.
do $$
declare t text;
begin
  foreach t in array array['capabilities', 'connectors', 'connector_capabilities'] loop
    execute format('drop policy registry_write on public.%I', t);
    execute format('create policy registry_insert on public.%I for insert to authenticated
                      with check (tebos_private.is_platform_admin())', t);
    execute format('create policy registry_update on public.%I for update to authenticated
                      using (tebos_private.is_platform_admin()) with check (tebos_private.is_platform_admin())', t);
    execute format('create policy registry_delete on public.%I for delete to authenticated
                      using (tebos_private.is_platform_admin())', t);
  end loop;
end $$;

-- Memberships: org admins insert, update and delete.
drop policy admin_write on public.memberships;
create policy admin_insert on public.memberships for insert to authenticated
  with check (tebos_private.has_role(org_id, array['org_admin']));
create policy admin_update on public.memberships for update to authenticated
  using (tebos_private.has_role(org_id, array['org_admin'])) with check (tebos_private.has_role(org_id, array['org_admin']));
create policy admin_delete on public.memberships for delete to authenticated
  using (tebos_private.has_role(org_id, array['org_admin']));

-- Connections and credential references: org admins insert and update
-- (no delete grant exists; history is preserved).
do $$
declare t text;
begin
  foreach t in array array['connection_instances', 'credential_references'] loop
    execute format('drop policy admin_write on public.%I', t);
    execute format('create policy admin_insert on public.%I for insert to authenticated
                      with check (tebos_private.has_role(org_id, array[''org_admin'']))', t);
    execute format('create policy admin_update on public.%I for update to authenticated
                      using (tebos_private.has_role(org_id, array[''org_admin'']))
                      with check (tebos_private.has_role(org_id, array[''org_admin'']))', t);
  end loop;
end $$;
