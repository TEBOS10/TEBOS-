-- The free self-check: "How much does your business run through you?"
-- (src/domain/selfcheck.ts). Anyone may submit answers; nobody can read them
-- back through the API. Answers are stored without names or contact details,
-- only for anonymous totals, and the score is computed here from the answers,
-- never taken from the browser. TEBOS's own board counts how many people take
-- the check: the attention it earns.

create table public.self_check_results (
  id         uuid primary key default gen_random_uuid(),
  answers    smallint[] not null check (cardinality(answers) = 10 and 0 <= all (answers) and 2 >= all (answers)),
  score      smallint not null check (score between 0 and 100),
  size_band  text check (size_band is null or size_band in ('1-5', '6-20', '21-50', '51-200', '200+')),
  region     text check (region is null or region in ('ZA', 'NG', 'KE', 'africa_other', 'other')),
  created_at timestamptz not null default now()
);
create index self_check_results_created_idx on public.self_check_results (created_at);

alter table public.self_check_results enable row level security;
revoke all on public.self_check_results from anon, authenticated;
grant all on public.self_check_results to service_role;

create function tebos_private.self_check_score(p_answers smallint[]) returns smallint
language sql immutable set search_path = '' as $$
  select (select sum(a) from unnest(p_answers) a) * 100 / 20
$$;

-- The only way in: validated answers, the score computed here, returned to show.
create function public.submit_self_check(p_answers int[], p_size text default null, p_region text default null) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_answers smallint[];
  v_score smallint;
begin
  if p_answers is null or cardinality(p_answers) <> 10 or not (0 <= all (p_answers) and 2 >= all (p_answers)) then
    raise exception 'the self-check has ten answers, each 0, 1 or 2' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  v_answers := p_answers::smallint[];
  v_score := tebos_private.self_check_score(v_answers);
  insert into public.self_check_results (answers, score, size_band, region)
    values (v_answers, v_score, nullif(p_size, ''), nullif(p_region, ''));
  return v_score;
end $$;

revoke execute on function public.submit_self_check(int[], text, text) from public;
grant execute on function public.submit_self_check(int[], text, text) to anon, authenticated;

-- Anonymous totals, for publishing (e.g. "the average business owner is the
-- bottleneck in 6 of 10 areas"). Only groups of 10 or more are shown.
create function public.self_check_totals()
returns table (size_band text, results bigint, average_score numeric)
language sql stable security definer set search_path = '' as $$
  select coalesce(size_band, 'unknown'), count(*), round(avg(score), 1)
    from public.self_check_results
   group by 1
  having count(*) >= 10
$$;
revoke execute on function public.self_check_totals() from public, anon;
grant execute on function public.self_check_totals() to authenticated;

-- TEBOS's board: the attention the self-check earns.
alter function tebos_private.company_snapshot() rename to company_snapshot_base;

create function tebos_private.company_snapshot() returns jsonb
language sql stable security definer set search_path = '' as $$
  select tebos_private.company_snapshot_base() || jsonb_build_object('attention', jsonb_build_object(
    'self_checks_7_days', (select count(*) from public.self_check_results where created_at > now() - interval '7 days'),
    'self_checks_30_days', (select count(*) from public.self_check_results where created_at > now() - interval '30 days'),
    'average_score_30_days', coalesce((select round(avg(score))::int from public.self_check_results where created_at > now() - interval '30 days'), 0)
  ))
$$;
revoke all on function tebos_private.company_snapshot() from public;
revoke all on function tebos_private.company_snapshot_base() from public;
grant execute on function tebos_private.company_snapshot() to service_role;
