-- Two-step sign-in for the private organisation (threat model T2,
-- docs/resilience/blueprint.md). Resilience records are read and written only
-- in a session that passed a second step: an authenticator-app code (TOTP),
-- which Supabase records as the session's assurance level, aal2. A stolen
-- password alone opens nothing here. The app enrols and challenges the factor;
-- the database is what enforces it.

create function tebos_private.two_step() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;

drop policy owner_all on public.res_money_items;
create policy owner_all on public.res_money_items for all to authenticated
  using (tebos_private.has_role(org_id, array['org_admin']) and tebos_private.two_step())
  with check (tebos_private.has_role(org_id, array['org_admin']) and tebos_private.two_step());
