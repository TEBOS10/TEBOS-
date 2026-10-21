-- The plan's edition is a ceiling (founder, 21 Oct 2026: "you don't want someone with a small package having the same
-- access as a large one"). Each business's board holds at most its organisation's plan's active flows and pieces:
-- Small 4 and 10, Medium 10 and 30, Company 40 and 120; with no active plan, the Small ceiling. It applies to whatever
-- a client adds, by a blueprint or by hand, and when a retired flow or piece is brought back. TEBOS's platform admins
-- (building concept systems and case studies) and the server (pieces observed from evidence) are not capped.
-- Mirrored by BOARD_LIMITS in src/domain/editions.ts.

create function tebos_private.plan_board_limit(p_plan text, p_what text) returns integer
language sql immutable set search_path = '' as $$
  select case p_what
    when 'flows' then case p_plan when 'growth' then 10 when 'company' then 40 else 4 end
    else case p_plan when 'growth' then 30 when 'company' then 120 else 10 end
  end
$$;

-- How many active flows or pieces a business has, read with the definer's rights so the guard counts them all.
create function tebos_private.active_board_count(p_table text, p_business uuid, p_except uuid) returns integer
language plpgsql stable security definer set search_path = '' as $$
declare v integer;
begin
  if p_table = 'board_flows' then
    select count(*) into v from public.board_flows where business_id = p_business and retired_at is null and id is distinct from p_except;
  else
    select count(*) into v from public.board_components where business_id = p_business and retired_at is null and id is distinct from p_except;
  end if;
  return v;
end $$;

create function tebos_private.guard_board_tier() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_plan text;
  v_what text := case tg_table_name when 'board_flows' then 'flows' else 'pieces' end;
  v_limit integer;
begin
  if not tebos_private.is_client() or tebos_private.is_platform_admin() then
    return new;
  end if;
  if new.retired_at is not null or (tg_op = 'UPDATE' and old.retired_at is null) then
    return new; -- only adding, or bringing one back, counts against the ceiling
  end if;
  v_plan := tebos_private.active_plan(new.org_id);
  v_limit := tebos_private.plan_board_limit(v_plan, v_what);
  if tebos_private.active_board_count(tg_table_name, new.business_id, new.id) + 1 > v_limit then
    raise exception 'the % plan holds up to % % per business; retire one first, or a larger plan holds more',
      case v_plan when 'growth' then 'Medium' when 'company' then 'Company' when 'starter' then 'Small' else 'Small (no active plan)' end,
      v_limit, v_what
      using errcode = 'P0001', hint = 'TEBOS_OUT_OF_PLAN';
  end if;
  return new;
end $$;

create trigger guard_board_tier before insert or update of retired_at on public.board_flows
  for each row execute function tebos_private.guard_board_tier();
create trigger guard_board_tier before insert or update of retired_at on public.board_components
  for each row execute function tebos_private.guard_board_tier();
