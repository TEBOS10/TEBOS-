-- The Property Revenue Architect Platform is its own platform (founder, 29 Oct 2026): a third web app from the same
-- code base and database, linked to TEPOS, apart from TEBOS. A landlord's account belongs to it alone: TEBOS never
-- lists it, TEPOS never lists it, and it never lists theirs (organisations.app, migration organisation_app).
--
-- The rules:
--   * An organisation belongs to one app, now one of three: tebos, tepos or pra. A private organisation is TEPOS's.
--   * A landlord opens their own account: one per person, which they own. Unlike TEBOS's client organisations
--     (set up by TEBOS's staff), no invitation is needed. Its records are isolated by the same row-level security.
--   * The slug is made by the database, never chosen by the browser.

alter table public.organisations drop constraint organisations_app_check,
  add constraint organisations_app_check check (app in ('tebos', 'tepos', 'pra'));

create function public.create_pra_account(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  new_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'give the account a name (2 to 120 characters)' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  if tebos_private.looks_personal(v_name) then
    raise exception 'no phone numbers, email addresses or ID numbers in an account name' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  if exists (select 1 from public.memberships m join public.organisations o on o.id = m.org_id
              where m.user_id = auth.uid() and m.role = 'org_admin' and o.app = 'pra') then
    raise exception 'you already have a property account; add more properties inside it' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  insert into public.organisations (name, slug, app)
    values (v_name, 'pra-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12), 'pra')
    returning id into new_id;
  insert into public.memberships (org_id, user_id, role) values (new_id, auth.uid(), 'org_admin');
  return new_id;
end $$;
revoke all on function public.create_pra_account(text) from public, anon;
grant execute on function public.create_pra_account(text) to authenticated;
