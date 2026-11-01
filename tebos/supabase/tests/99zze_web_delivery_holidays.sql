-- The delivery clock counts South African public holidays: the Act's fixed dates, Good Friday, Family Day, and the
-- Monday after a holiday on a Sunday. The same dates are checked in test/web-delivery.test.ts.
\set ON_ERROR_STOP on
set client_min_messages = warning;
do $$
begin
  if tebos_private.easter_sunday(2024) <> '2024-03-31' or tebos_private.easter_sunday(2025) <> '2025-04-20'
     or tebos_private.easter_sunday(2026) <> '2026-04-05' or tebos_private.easter_sunday(2027) <> '2027-03-28'
     or tebos_private.easter_sunday(2030) <> '2030-04-21' then
    raise exception 'Easter is wrong';
  end if;
  if not (tebos_private.is_sa_public_holiday('2026-12-16') and tebos_private.is_sa_public_holiday('2026-04-03')
          and tebos_private.is_sa_public_holiday('2026-04-06') and tebos_private.is_sa_public_holiday('2028-09-25')) then
    raise exception 'a holiday was missed';
  end if;
  if tebos_private.is_sa_public_holiday('2022-12-27') or tebos_private.is_sa_public_holiday('2026-11-02') then
    raise exception 'a working day was taken as a holiday';
  end if;
  if tebos_private.add_business_days('2026-12-24', 3) <> '2026-12-30' or tebos_private.add_business_days('2026-04-02', 3) <> '2026-04-09'
     or tebos_private.add_business_days('2026-12-15', 1) <> '2026-12-17' or tebos_private.add_business_days('2026-10-30', 3) <> '2026-11-04' then
    raise exception 'a deadline ignored a holiday';
  end if;
  if tebos_private.business_days_between('2026-04-02', '2026-04-07') <> 1 or tebos_private.business_days_between('2026-11-02', '2026-11-09') <> 5 then
    raise exception 'a pause was miscounted';
  end if;
end $$;
