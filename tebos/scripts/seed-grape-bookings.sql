-- Grape Studios' bookings, from the rate cards the founder supplied on 1 Nov 2026 (ADR 0015, ADR 0016).
-- Run once, by the founder or a TEBOS maintainer, AFTER Grape Studios has signed its agreement and its organisation
-- exists in TEBOS with the slug 'grape-studios' (Pipeline → onboarding). It stays closed to online bookings
-- (accepting = false) and has no working hours until Grape Studios gives them: set both on TEBOS → Bookings.
-- Banking details are deliberately not here: Grape Studios writes its own deposit instructions in TEBOS.
do $$
declare v_org uuid; v_s uuid;
begin
  select id into v_org from public.organisations where slug = 'grape-studios';
  if v_org is null then raise exception 'create Grape Studios'' organisation (slug grape-studios) first'; end if;

  insert into public.booking_settings (org_id, public_name, contact_email, accepting)
  values (v_org, 'Grape Studios', 'grapephotographybookings@gmail.com', false)
  on conflict (org_id) do nothing;

  insert into public.booking_services (org_id, key, name, cover_path, pictures_note, delivery_days, at_studio, sort)
  values (v_org, 'studio', 'Studio shoots', '/photos/studio.jpg', '20 to 25 edited pictures per hour', '[2,5)', true, 1) returning id into v_s;
  insert into public.booking_packages (service_id, org_id, label, minutes, price_cents, note, sort) values
    (v_s, v_org, '1 hour', 60, 260000, 'Up to 2 outfits', 1), (v_s, v_org, '2 hours', 120, 340000, 'Up to 3 outfits', 2),
    (v_s, v_org, 'Half day', 240, 640000, null, 3), (v_s, v_org, 'Full day', 480, 1230000, null, 4);

  insert into public.booking_services (org_id, key, name, cover_path, pictures_note, delivery_days, travel_min, travel_max, sort)
  values (v_org, 'on_location', 'On location', '/photos/on-location.jpg', 'Unlimited edited pictures', '[2,5)', 300, 400, 2) returning id into v_s;
  insert into public.booking_packages (service_id, org_id, label, minutes, price_cents, sort) values
    (v_s, v_org, '1 hour', 60, 180000, 1), (v_s, v_org, '2 hours', 120, 230000, 2), (v_s, v_org, 'Half day', 240, 520000, 3);

  insert into public.booking_services (org_id, key, name, cover_path, pictures_note, delivery_days, travel_min, travel_max, sort)
  values (v_org, 'corporate', 'Corporate', '/photos/corporate.jpg', 'Unlimited edited pictures', '[2,5)', 300, 400, 3) returning id into v_s;
  insert into public.booking_packages (service_id, org_id, label, minutes, price_cents, sort) values
    (v_s, v_org, 'Per hour', 60, 180000, 1), (v_s, v_org, 'Half day', 240, 650000, 2), (v_s, v_org, 'Full day', 480, 965000, 3);

  insert into public.booking_services (org_id, key, name, cover_path, pictures_note, delivery_days, travel_min, travel_max, sort)
  values (v_org, 'graduation', 'Graduation', '/photos/graduation.jpg', 'Unlimited edited pictures', '[2,5)', 300, 400, 4) returning id into v_s;
  insert into public.booking_packages (service_id, org_id, label, minutes, price_cents, sort) values
    (v_s, v_org, '1 hour', 60, 150000, 1), (v_s, v_org, '2 hours', 120, 230000, 2), (v_s, v_org, 'Half day', 240, 520000, 3);

  insert into public.booking_services (org_id, key, name, cover_path, pictures_note, delivery_days, travel_min, travel_max, sort)
  values (v_org, 'property', 'Property listing', '/photos/property.jpg', 'No limit on edited pictures', '[1,3)', 300, 450, 5) returning id into v_s;
  insert into public.booking_packages (service_id, org_id, label, minutes, price_cents, note, sort) values
    (v_s, v_org, 'Per unit', 60, 80000, 'One unit, about an hour', 1);

  insert into public.booking_services (org_id, key, name, cover_path, delivery_days, travel_min, travel_max, sort)
  values (v_org, 'events', 'Events', '/photos/events.jpg', '[2,5)', 300, 400, 6);
end $$;
