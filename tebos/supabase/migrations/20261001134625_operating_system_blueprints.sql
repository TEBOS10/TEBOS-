-- Operating-system blueprints (src/domain/blueprints.ts): a starting operating
-- system for a kind of business, laid onto a client's board in one step.
--
-- Everything a blueprint lays down is PROPOSED: not something the owner told
-- TEBOS (stated) and not something evidence confirmed (observed). The owner
-- confirms each piece (proposed -> stated), evidence can confirm it
-- (-> observed), or it is retired. Nothing becomes proposed again once stated
-- or observed, so a blueprint can never overwrite what the business said.

alter table public.board_components drop constraint board_components_basis_check;
alter table public.board_components add constraint board_components_basis_check check (basis in ('proposed', 'stated', 'observed'));
alter table public.board_steps drop constraint board_steps_basis_check;
alter table public.board_steps add constraint board_steps_basis_check check (basis in ('proposed', 'stated', 'observed'));
alter table public.board_flows add column basis text not null default 'stated' check (basis in ('proposed', 'stated'));

-- Which blueprint (key@version) a piece came from, for the record. Frozen.
alter table public.board_components add column from_blueprint text check (from_blueprint is null or length(from_blueprint) <= 64);
alter table public.board_flows      add column from_blueprint text check (from_blueprint is null or length(from_blueprint) <= 64);
alter table public.board_steps      add column from_blueprint text check (from_blueprint is null or length(from_blueprint) <= 64);

create function tebos_private.guard_board_proposal() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.from_blueprint is distinct from old.from_blueprint then
      raise exception 'where a piece of the board came from cannot be changed'
        using errcode = 'P0001', hint = 'TEBOS_SERVER_ONLY';
    end if;
    if new.basis = 'proposed' and old.basis <> 'proposed' then
      raise exception 'a piece the business stated or evidence confirmed cannot go back to being a proposal'
        using errcode = 'P0001', hint = 'TEBOS_ILLEGAL_TRANSITION';
    end if;
  elsif new.basis = 'proposed' and new.from_blueprint is null then
    raise exception 'a proposed piece of the board must name the blueprint it came from'
      using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  return new;
end $$;

create trigger guard_board_proposal before insert or update on public.board_components
  for each row execute function tebos_private.guard_board_proposal();
create trigger guard_board_proposal before insert or update on public.board_flows
  for each row execute function tebos_private.guard_board_proposal();
create trigger guard_board_proposal before insert or update on public.board_steps
  for each row execute function tebos_private.guard_board_proposal();

-- Lays a blueprint onto a business's board in one transaction, as proposals.
-- Runs as the caller (security invoker): only the business's operators and
-- admins can do it, exactly as if they added each piece by hand. Pieces and
-- flows whose names the board already has are left alone; it never edits or
-- removes anything.
create function public.apply_blueprint(p_business uuid, p_blueprint jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_org uuid;
  v_tag text;
  v_piece jsonb;
  v_flow jsonb;
  v_step jsonb;
  v_flow_id uuid;
  v_component uuid;
  v_pieces int := 0;
  v_flows int := 0;
  v_steps int := 0;
begin
  select org_id into v_org from public.businesses where id = p_business;
  if v_org is null then
    raise exception 'business not found' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
  end if;
  if jsonb_typeof(p_blueprint -> 'pieces') <> 'array' or jsonb_typeof(p_blueprint -> 'flows') <> 'array'
     or coalesce(p_blueprint ->> 'key', '') !~ '^[a-z0-9-]{3,48}$' or coalesce(p_blueprint ->> 'version', '') !~ '^[0-9]{1,4}$' then
    raise exception 'not a blueprint' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  v_tag := (p_blueprint ->> 'key') || '@' || (p_blueprint ->> 'version');

  for v_piece in select * from jsonb_array_elements(p_blueprint -> 'pieces') loop
    if not exists (select 1 from public.board_components c where c.business_id = p_business and c.retired_at is null
                    and lower(c.name) = lower(v_piece ->> 'name')) then
      insert into public.board_components (org_id, business_id, name, kind, description, owner_role, basis, from_blueprint)
        values (v_org, p_business, v_piece ->> 'name', v_piece ->> 'kind', v_piece ->> 'description', v_piece ->> 'owner_role', 'proposed', v_tag);
      v_pieces := v_pieces + 1;
    end if;
  end loop;

  for v_flow in select * from jsonb_array_elements(p_blueprint -> 'flows') loop
    if exists (select 1 from public.board_flows f where f.business_id = p_business and f.retired_at is null
                and lower(f.name) = lower(v_flow ->> 'name')) then
      continue;
    end if;
    insert into public.board_flows (org_id, business_id, name, starts_when, done_when, owner_role, basis, from_blueprint)
      values (v_org, p_business, v_flow ->> 'name', v_flow ->> 'starts_when', v_flow ->> 'done_when', v_flow ->> 'owner_role', 'proposed', v_tag)
      returning id into v_flow_id;
    v_flows := v_flows + 1;
    for v_step in select * from jsonb_array_elements(v_flow -> 'steps') loop
      v_component := null;
      if v_step ->> 'piece' is not null then
        select c.id into v_component from public.board_components c
         where c.business_id = p_business and c.retired_at is null and lower(c.name) = lower(v_step ->> 'piece');
      end if;
      insert into public.board_steps (org_id, business_id, flow_id, position, name, performer, performer_role, component_id,
                                      decision_rule, basis, from_blueprint)
        values (v_org, p_business, v_flow_id, (v_step ->> 'position')::int, v_step ->> 'name', v_step ->> 'performer',
                v_step ->> 'performer_role', v_component, v_step ->> 'decision_rule', 'proposed', v_tag);
      v_steps := v_steps + 1;
    end loop;
  end loop;

  return jsonb_build_object('blueprint', v_tag, 'pieces', v_pieces, 'flows', v_flows, 'steps', v_steps);
end $$;

revoke all on function public.apply_blueprint(uuid, jsonb) from public, anon;
grant execute on function public.apply_blueprint(uuid, jsonb) to authenticated;
