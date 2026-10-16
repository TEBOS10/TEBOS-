-- The TEBOS client map (founder, 17 Oct 2026): each client's tile in its own
-- colours, and how each business relates to Tidy. Mirrored in src/domain/brand.ts.
--   * Colours are lower-case hex; text on a tile is chosen for contrast by the app.
--   * relationship: client, in_development (a venture being built, such as
--     Hospitality OS) or own (Tidy's own business). Unset for businesses that
--     were only scanned: they are not clients and are not on the map.

alter table public.businesses
  add column brand_primary text check (brand_primary ~ '^#[0-9a-f]{6}$'),
  add column brand_accent  text check (brand_accent ~ '^#[0-9a-f]{6}$'),
  add column brand_surface text check (brand_surface ~ '^#[0-9a-f]{6}$'),
  add column relationship  text check (relationship in ('client', 'in_development', 'own'));
