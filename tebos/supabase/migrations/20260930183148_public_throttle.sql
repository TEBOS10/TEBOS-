-- Public submissions are throttled, so nobody can flood TEBOS from outside:
-- fake enquiries would bury real leads and inflate the leads objective, and
-- fake self-checks would inflate the attention objective. Limits apply to
-- requests through the API (which always carry request headers), per source
-- and in total. The source is stored only as a salted hash, never the raw IP.

create table tebos_private.public_submissions (
  id         bigint generated always as identity primary key,
  kind       text not null check (kind in ('enquiry', 'self_check')),
  source     text not null,
  created_at timestamptz not null default now()
);
create index public_submissions_recent_idx on tebos_private.public_submissions (kind, created_at);
create index public_submissions_source_idx on tebos_private.public_submissions (kind, source, created_at);
revoke all on tebos_private.public_submissions from public, anon, authenticated;

-- Raises TEBOS_RATE_LIMITED when one source, or everyone together, has sent
-- too many of `kind` in the last hour. Does nothing for direct database
-- connections (no request headers): those already hold database credentials.
create function tebos_private.throttle(p_kind text, p_per_source int, p_total int) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_headers json := nullif(current_setting('request.headers', true), '')::json;
  v_ip text;
  v_source text;
begin
  if v_headers is null then
    return;
  end if;
  v_ip := coalesce(nullif(trim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), ''), v_headers ->> 'x-real-ip', 'unknown');
  v_source := encode(sha256(convert_to('tebos-throttle:' || v_ip, 'UTF8')), 'hex');
  -- one caller at a time per kind, so a burst can't slip past the count
  perform pg_advisory_xact_lock(hashtext('tebos_throttle:' || p_kind));
  if (select count(*) from tebos_private.public_submissions
       where kind = p_kind and source = v_source and created_at > now() - interval '1 hour') >= p_per_source
     or (select count(*) from tebos_private.public_submissions
       where kind = p_kind and created_at > now() - interval '1 hour') >= p_total then
    raise exception 'too many submissions; try again later' using errcode = 'P0001', hint = 'TEBOS_RATE_LIMITED';
  end if;
  delete from tebos_private.public_submissions where created_at < now() - interval '1 day';
  insert into tebos_private.public_submissions (kind, source) values (p_kind, v_source);
end $$;
revoke all on function tebos_private.throttle(text, int, int) from public;

-- Website enquiries: 3 an hour from one source, 60 an hour in total.
-- Leads entered by sales staff aren't throttled (enquiry_source runs first and sets source).
create function tebos_private.enquiry_throttle() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.source = 'website' and current_setting('role', true) in ('anon', 'authenticated') then
    perform tebos_private.throttle('enquiry', 3, 60);
  end if;
  return new;
end $$;
create trigger enquiry_throttle before insert on public.enquiries
  for each row execute function tebos_private.enquiry_throttle();

-- The self-check: 5 an hour from one source, 300 an hour in total.
create or replace function public.submit_self_check(p_answers int[], p_size text default null, p_region text default null) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_answers smallint[];
  v_score smallint;
begin
  if p_answers is null or cardinality(p_answers) <> 10 or not (0 <= all (p_answers) and 2 >= all (p_answers)) then
    raise exception 'the self-check has ten answers, each 0, 1 or 2' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  perform tebos_private.throttle('self_check', 5, 300);
  v_answers := p_answers::smallint[];
  v_score := tebos_private.self_check_score(v_answers);
  insert into public.self_check_results (answers, score, size_band, region)
    values (v_answers, v_score, nullif(p_size, ''), nullif(p_region, ''));
  return v_score;
end $$;
