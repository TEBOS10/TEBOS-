-- TEPOS and TEBOS are two separate web apps (founder, 16 Oct 2026). Each
-- organisation belongs to one of them: TEBOS shows only TEBOS organisations,
-- TEPOS only TEPOS ones. A private organisation is always TEPOS's. Which app an
-- organisation belongs to is not something the apps can change.

alter table public.organisations add column app text not null default 'tebos' check (app in ('tebos', 'tepos'));
update public.organisations set app = 'tepos' where private;
alter table public.organisations add constraint organisations_private_is_tepos check (not private or app = 'tepos');

create or replace function public.create_private_organisation(p_name text, p_slug text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  insert into public.organisations (name, slug, private, app) values (p_name, p_slug, true, 'tepos') returning id into new_id;
  insert into public.memberships (org_id, user_id, role) values (new_id, auth.uid(), 'org_admin');
  return new_id;
end $$;

-- A client's tile on the TEBOS map opens the client's own web app (founder, 16 Oct 2026): the address where
-- TEBOS's people sign in to their department. Never a page of TEBOS's own data. Only https addresses.
alter table public.businesses add column app_url text check (app_url ~ '^https://[^\s]+$');
