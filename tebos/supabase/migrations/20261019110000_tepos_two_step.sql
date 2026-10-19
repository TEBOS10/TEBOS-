-- TEPOS opens only after two-step sign-in (founder, 17 Oct 2026: "beef up security").
--
-- Until now only the private organisation's money records needed a session that passed two-step sign-in
-- (two_step_resilience). The founder's other TEPOS organisations, such as Tidy Enterprise with its property
-- cases, opened with a password alone. Now every organisation that belongs to TEPOS (organisations.app =
-- 'tepos') counts its members as members only in a session that passed two-step sign-in (aal2). Every access
-- rule that asks is_member or has_role, including the organisation itself, its memberships and its audit
-- trail, follows. A stolen password alone opens nothing of TEPOS.
--
-- TEBOS organisations are unchanged. Server-side work (the service role) doesn't go through these checks.

create or replace function tebos_private.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m join public.organisations o on o.id = m.org_id
     where m.org_id = p_org and m.user_id = auth.uid()
       and (o.app <> 'tepos' or tebos_private.two_step())
  )
$$;

create or replace function tebos_private.has_role(p_org uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m join public.organisations o on o.id = m.org_id
     where m.org_id = p_org and m.user_id = auth.uid() and m.role = any (p_roles)
       and (o.app <> 'tepos' or tebos_private.two_step())
  )
$$;
