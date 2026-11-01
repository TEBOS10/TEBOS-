-- Websites a client already has (founder, 1 Nov 2026: "We need to be able to integrate TEBOS in a website should a client
-- already have one or need it edited"). A web project now says where it starts:
--   * new_build         TEBOS builds the site (as before);
--   * edit_existing     TEBOS edits the client's existing site;
--   * connect_existing  TEBOS keeps the client's site and connects it to their TEBOS operating system (enquiries,
--                       bookings and requests flow into TEBOS).
-- Additive. The rules (mirrored in src/domain/web-delivery.ts):
--   * An existing site needs its address (https).
--   * Where a project starts is settled at intake; after that it is fixed.
--   * For an existing site, "technical access" counts as met only when access to the client's own site is on record:
--     a hosting, repository or CMS integration on the project, owned by the client and granted or verified. TEBOS
--     never starts work on a site it has no recorded right to touch.

alter table public.web_projects
  add column starting_point text not null default 'new_build'
    check (starting_point in ('new_build', 'edit_existing', 'connect_existing')),
  add column existing_url text
    check (existing_url is null or (existing_url ~ '^https://[^\s/]+\.[^\s]+$' and length(existing_url) <= 300)),
  add constraint web_projects_existing_url_needed check (starting_point = 'new_build' or existing_url is not null),
  add constraint web_projects_existing_url_clean check (not tebos_private.looks_secret(existing_url));

grant update (starting_point, existing_url) on public.web_projects to authenticated;

create function tebos_private.guard_web_starting_point() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.starting_point, new.existing_url) is distinct from (old.starting_point, old.existing_url) and old.status <> 'intake' then
    raise exception 'where a project starts is settled at intake' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  return new;
end $$;
create trigger guard_web_starting_point before update on public.web_projects
  for each row execute function tebos_private.guard_web_starting_point();

create function tebos_private.guard_existing_site_access() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.item = 'technical_access' and new.status = 'met'
     and exists (select 1 from public.web_projects p where p.id = new.project_id and p.starting_point <> 'new_build')
     and not exists (select 1 from public.web_integrations i
                      where i.project_id = new.project_id and i.service in ('hosting', 'repository', 'cms')
                        and i.account_owner = 'client' and i.status in ('granted', 'verified') and i.tebos_access <> 'none') then
    raise exception 'record the client''s grant of access to their existing site (hosting, repository or CMS) first'
      using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  return new;
end $$;
create trigger guard_existing_site_access before insert or update on public.web_readiness_items
  for each row execute function tebos_private.guard_existing_site_access();
