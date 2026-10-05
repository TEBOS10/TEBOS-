-- Architecture proposals: a written rule and an owner for a step only the
-- founder does today, proposed by the business's team (or its TEBOS
-- maintainer) and decided by the business's owner.
--
--   * Only a live founder step can get a proposal, and it must hand the step to
--     someone else (staff, a provider, an automation, or the customer) with a
--     written rule. An automation must name the piece it runs on.
--   * One open proposal per step. Its content is frozen once proposed.
--   * Only an org admin decides, and never their own proposal.
--   * Approving changes the board in one step: the founder step is retired (the
--     record of how it was, with its evidence) and a new stated step takes its
--     place (how it will be). Nothing is overwritten.

create table public.step_proposals (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null,
  business_id    uuid not null,
  step_id        uuid not null references public.board_steps (id),
  performer      text not null check (performer in ('staff', 'automation', 'provider', 'client')),
  performer_role text check (performer_role is null or length(btrim(performer_role)) between 1 and 120),
  component_id   uuid,
  decision_rule  text not null check (length(btrim(decision_rule)) between 10 and 2000),
  reason         text not null check (length(btrim(reason)) between 10 and 2000),
  status         text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected', 'withdrawn')),
  proposed_by    uuid not null references auth.users (id),
  decided_by     uuid references auth.users (id),
  decided_at     timestamptz,
  decision_note  text check (decision_note is null or length(decision_note) <= 2000),
  new_step_id    uuid references public.board_steps (id),
  created_at     timestamptz not null default now(),
  foreign key (business_id, org_id) references public.businesses (id, org_id) on delete cascade,
  foreign key (component_id, business_id) references public.board_components (id, business_id),
  check (performer <> 'automation' or component_id is not null),
  check ((status in ('approved', 'rejected')) = (decided_by is not null and decided_at is not null)),
  check ((status = 'approved') = (new_step_id is not null)),
  check (status <> 'rejected' or coalesce(length(btrim(decision_note)), 0) > 0)
);
create unique index step_proposals_one_open_idx on public.step_proposals (step_id) where status = 'proposed';
create index step_proposals_business_idx on public.step_proposals (business_id, created_at desc);

create function tebos_private.guard_step_proposal() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_step record;
begin
  if tg_op = 'DELETE' then
    raise exception 'proposals are kept' using errcode = '42501', hint = 'TEBOS_EVIDENCE_IMMUTABLE';
  end if;

  if tg_op = 'INSERT' then
    select business_id, performer, retired_at into v_step from public.board_steps where id = new.step_id;
    if v_step.business_id is distinct from new.business_id then
      raise exception 'the step is not on this business''s board' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    if v_step.performer <> 'founder' or v_step.retired_at is not null then
      raise exception 'proposals are for steps only the founder does today' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    if new.status <> 'proposed' or new.decided_by is not null or new.new_step_id is not null then
      raise exception 'a proposal starts undecided' using errcode = 'P0001', hint = 'TEBOS_ILLEGAL_TRANSITION';
    end if;
    if tebos_private.is_client() then
      new.proposed_by := auth.uid();
    end if;
    return new;
  end if;

  -- what was proposed, and by whom, never changes
  if (new.org_id, new.business_id, new.step_id, new.performer, new.performer_role, new.component_id, new.decision_rule,
      new.reason, new.proposed_by, new.created_at)
     is distinct from
     (old.org_id, old.business_id, old.step_id, old.performer, old.performer_role, old.component_id, old.decision_rule,
      old.reason, old.proposed_by, old.created_at) then
    raise exception 'a proposal can''t be edited: withdraw it and propose again' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  if new.status is distinct from old.status and old.status <> 'proposed' then
    raise exception 'this proposal is already %', old.status using errcode = 'P0001', hint = 'TEBOS_ILLEGAL_TRANSITION';
  end if;
  if old.status <> 'proposed' and new.decision_note is distinct from old.decision_note then
    raise exception 'a decided proposal can''t be edited' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  if tebos_private.is_client() then
    if new.status = 'approved' then
      raise exception 'approve with approve_step_proposal, which changes the board in the same step' using errcode = '42501', hint = 'TEBOS_SERVER_ONLY';
    end if;
    if new.status = 'withdrawn' and old.proposed_by <> auth.uid() then
      raise exception 'only whoever proposed it can withdraw it' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
    end if;
    if new.status = 'rejected' then
      if not tebos_private.has_role(old.org_id, array['org_admin']) then
        raise exception 'the business''s owner decides proposals' using errcode = '42501', hint = 'TEBOS_NOT_APPROVER';
      end if;
      if old.proposed_by = auth.uid() then
        raise exception 'nobody decides their own proposal' using errcode = '42501', hint = 'TEBOS_SELF_APPROVAL';
      end if;
      new.decided_by := auth.uid();
      new.decided_at := now();
    end if;
    if (new.decided_by, new.decided_at, new.new_step_id) is distinct from (old.decided_by, old.decided_at, old.new_step_id)
       and new.status <> 'rejected' then
      raise exception 'the decision is recorded by TEBOS' using errcode = '42501', hint = 'TEBOS_SERVER_ONLY';
    end if;
  end if;
  return new;
end $$;

create trigger guard before insert or update or delete on public.step_proposals
  for each row execute function tebos_private.guard_step_proposal();
create trigger audit after insert or update or delete on public.step_proposals
  for each row execute function tebos_private.audit_row();
create trigger freeze_tenant_keys before update on public.step_proposals
  for each row execute function tebos_private.freeze_tenant_keys();

alter table public.step_proposals enable row level security;
revoke all on public.step_proposals from anon, authenticated;
create policy member_read on public.step_proposals for select to authenticated using (tebos_private.is_member(org_id));
create policy operator_propose on public.step_proposals for insert to authenticated
  with check (tebos_private.has_role(org_id, array['org_admin', 'operator']));
create policy member_decide on public.step_proposals for update to authenticated
  using (tebos_private.has_role(org_id, array['org_admin', 'operator']))
  with check (tebos_private.has_role(org_id, array['org_admin', 'operator']));
grant select, insert on public.step_proposals to authenticated;
grant update (status, decision_note) on public.step_proposals to authenticated;
grant all on public.step_proposals to service_role;

-- Approves a proposal and changes the board in one transaction. Runs as its
-- owner so it can record the decision, so it checks here what the guard checks
-- for everyone else: the caller is an org admin of the business, and not the
-- proposer. The board's own guards still apply. The founder step is retired,
-- never edited; the new step is stated, in the same place in the flow.
create function public.approve_step_proposal(p_proposal uuid, p_note text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_p record;
  v_old record;
  v_new uuid;
begin
  select * into v_p from public.step_proposals where id = p_proposal for update;
  if v_p.id is null or not tebos_private.is_member(v_p.org_id) then
    raise exception 'proposal not found' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
  end if;
  if not tebos_private.has_role(v_p.org_id, array['org_admin']) then
    raise exception 'the business''s owner decides proposals' using errcode = '42501', hint = 'TEBOS_NOT_APPROVER';
  end if;
  if v_p.proposed_by = auth.uid() then
    raise exception 'nobody decides their own proposal' using errcode = '42501', hint = 'TEBOS_SELF_APPROVAL';
  end if;
  if v_p.status <> 'proposed' then
    raise exception 'this proposal is already %', v_p.status using errcode = 'P0001', hint = 'TEBOS_ILLEGAL_TRANSITION';
  end if;
  select * into v_old from public.board_steps where id = v_p.step_id for update;
  if v_old.retired_at is not null or v_old.performer <> 'founder' then
    raise exception 'the step has changed since this was proposed' using errcode = 'P0001', hint = 'TEBOS_ILLEGAL_TRANSITION';
  end if;
  update public.board_steps set retired_at = now() where id = v_old.id;
  insert into public.board_steps (org_id, business_id, flow_id, position, name, performer, performer_role, component_id,
                                  decision_rule, documented, basis)
  values (v_old.org_id, v_old.business_id, v_old.flow_id, v_old.position, v_old.name, v_p.performer, v_p.performer_role,
          v_p.component_id, v_p.decision_rule, true, 'stated')
  returning id into v_new;
  update public.step_proposals
     set status = 'approved', decided_by = auth.uid(), decided_at = now(), new_step_id = v_new,
         decision_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_proposal;
  return v_new;
end $$;
revoke all on function public.approve_step_proposal(uuid, text) from public, anon;
grant execute on function public.approve_step_proposal(uuid, text) to authenticated;
