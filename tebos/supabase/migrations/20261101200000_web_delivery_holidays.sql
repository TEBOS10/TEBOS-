-- The Web Delivery clock counts South Africa's public holidays (founder, 1 Nov 2026: "build the template and holidays").
-- The Public Holidays Act 36 of 1994 lists ten fixed dates plus Good Friday and Family Day (the Monday after Easter);
-- a holiday that falls on a Sunday moves the holiday to the Monday. Days the President declares ad hoc (for example
-- an election day) are not in this list: they are added here by a new migration when they are gazetted.
-- Mirrored in src/domain/web-delivery.ts (SA_FIXED_HOLIDAYS, isSaPublicHoliday); test/schema-parity.test.ts keeps them
-- in step. Replaces the bodies of add_business_days and business_days_between; their signatures don't change.

-- Western Easter Sunday (the anonymous Gregorian computus)
create function tebos_private.easter_sunday(p_year integer) returns date
language sql immutable set search_path = '' as $$
  with v as (
    select p_year % 19 as a, p_year / 100 as b, p_year % 100 as c
  ), w as (
    select a, b, c, b / 4 as d, b % 4 as e, (b + 8) / 25 as f from v
  ), x as (
    select a, c, e, (19 * a + b - d - (b - f + 1) / 3 + 15) % 30 as h, c / 4 as i, c % 4 as k from w
  ), y as (
    select a, h, (32 + 2 * e + 2 * i - h - k) % 7 as l from x
  ), z as (
    select h, l, (a + 11 * h + 22 * l) / 451 as m from y
  )
  select make_date(p_year, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1) from z
$$;

-- a statutory holiday on this exact date, before the Sunday rule
create function tebos_private.sa_statutory_holiday(p_day date) returns boolean
language sql immutable set search_path = '' as $$
  select to_char(p_day, 'MM-DD') in ('01-01', '03-21', '04-27', '05-01', '06-16', '08-09', '09-24', '12-16', '12-25', '12-26')
      or p_day = tebos_private.easter_sunday(extract(year from p_day)::integer) - 2
      or p_day = tebos_private.easter_sunday(extract(year from p_day)::integer) + 1
$$;

create function tebos_private.is_sa_public_holiday(p_day date) returns boolean
language sql immutable set search_path = '' as $$
  select tebos_private.sa_statutory_holiday(p_day)
      or (extract(isodow from p_day) = 1 and tebos_private.sa_statutory_holiday(p_day - 1))
$$;

create function tebos_private.is_business_day(p_day date) returns boolean
language sql immutable set search_path = '' as $$
  select extract(isodow from p_day) < 6 and not tebos_private.is_sa_public_holiday(p_day)
$$;

create or replace function tebos_private.add_business_days(p_from date, p_days integer) returns date
language plpgsql immutable set search_path = '' as $$
declare
  v date := p_from;
  n integer := 0;
begin
  while n < p_days loop
    v := v + 1;
    if tebos_private.is_business_day(v) then n := n + 1; end if;
  end loop;
  return v;
end $$;

create or replace function tebos_private.business_days_between(p_from date, p_to date) returns integer
language sql immutable set search_path = '' as $$
  select count(*)::integer from generate_series(p_from + 1, p_to, interval '1 day') d where tebos_private.is_business_day(d::date)
$$;
