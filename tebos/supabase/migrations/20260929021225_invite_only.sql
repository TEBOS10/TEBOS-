-- Invite-only access: nobody creates their own TEBOS organisation.
--
-- Until now any signed-in user could create an organisation and start using
-- TEBOS (scans, interviews, reviews), which costs money and shows the product
-- to anyone who signs up, competitors included. From here:
--   * only TEBOS's platform admins create organisations: for a client once
--     their plan starts, and for TEBOS itself;
--   * everyone else joins an organisation through an invitation, which is
--     bound to the invited, confirmed email address;
--   * an account with neither sees and can do nothing: every tenant table is
--     behind membership (row-level security).

create or replace function public.create_organisation(p_name text, p_slug text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not tebos_private.is_platform_admin() then
    raise exception 'organisations are set up by TEBOS when a client''s plan starts; ask for an invitation to join one'
      using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
  end if;
  insert into public.organisations (name, slug) values (p_name, p_slug) returning id into new_id;
  insert into public.memberships (org_id, user_id, role) values (new_id, auth.uid(), 'org_admin');
  return new_id;
end $$;

revoke execute on function public.create_organisation(text, text) from public, anon;
grant execute on function public.create_organisation(text, text) to authenticated;
