-- The Listing studio (founder, 19 Oct 2026: "build the listing studio"). The founder drops in a property's photos and
-- facts; TEPOS draws the Pelser-branded advert, the walkthrough shot list and the caption from those facts alone.
-- Nothing is published: the founder downloads or files the advert and posts it themselves.
--
-- This adds the advert's facts to each listing. Every one is optional and stated by the founder; the advert shows
-- only what is filled in, so it never invents a feature. Photos stay on the founder's device (or in the vault when
-- filed): none are stored here.
--
-- Rules: counts are whole numbers from 0 to 99; areas are zero or more; at most six highlights of up to 60
-- characters each; no contact details, ID numbers or secrets in the suburb, city or highlights. The rest of the
-- listing's rules (private organisation, owner, two-step sign-in, redacted audit) apply as before.

alter table public.agent_listings
  add column property_kind text check (property_kind is null or property_kind in (
    'house', 'apartment', 'townhouse', 'commercial', 'industrial', 'land', 'farm')),
  add column suburb       text check (suburb is null or length(trim(suburb)) between 1 and 80),
  add column city         text check (city is null or length(trim(city)) between 1 and 80),
  add column bedrooms     integer check (bedrooms is null or bedrooms between 0 and 99),
  add column bathrooms    integer check (bathrooms is null or bathrooms between 0 and 99),
  add column offices      integer check (offices is null or offices between 0 and 99),
  add column kitchens     integer check (kitchens is null or kitchens between 0 and 99),
  add column parking      integer check (parking is null or parking between 0 and 99),
  add column floor_m2     numeric(10, 1) check (floor_m2 is null or floor_m2 >= 0),
  add column erf_m2       numeric(12, 1) check (erf_m2 is null or erf_m2 >= 0),
  add column highlights   text[] not null default '{}' check (cardinality(highlights) <= 6);

create function tebos_private.guard_listing_facts() returns trigger
language plpgsql set search_path = '' as $$
declare h text;
begin
  foreach h in array array[new.suburb, new.city] || new.highlights loop
    if h is null then
      continue;
    end if;
    if tebos_private.looks_secret(h) then
      raise exception 'this looks like a password, key or token; secrets are never stored here'
        using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    if tebos_private.looks_personal(h) then
      raise exception 'no contact details or ID numbers in a listing''s facts'
        using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
  end loop;
  foreach h in array new.highlights loop
    if length(trim(h)) not between 1 and 60 then
      raise exception 'each highlight is 1 to 60 characters' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
  end loop;
  return new;
end $$;

create trigger guard_listing_facts before insert or update on public.agent_listings
  for each row execute function tebos_private.guard_listing_facts();
