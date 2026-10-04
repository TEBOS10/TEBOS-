-- Observed pieces: the board's pieces and steps confirmed by evidence.
--
-- A piece of the board is observed only when evidence TEBOS obtained confirms
-- it: a scan, a document, a connected system's reading. What the owner said
-- (user_supplied evidence, e.g. an interview answer) makes a piece stated,
-- never observed: the owner's word is not proof of itself. Stale or
-- conflicting evidence can't make a piece observed either.
--
-- Once evidence confirmed a piece, it stays observed: it can cite newer
-- evidence, or be retired, but not quietly fall back to stated or proposed.
-- Evidence does not un-happen.

create or replace function tebos_private.guard_board_basis() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_state text;
  v_kind text;
begin
  if new.basis = 'observed'
     and (tg_op = 'INSERT' or old.basis is distinct from 'observed' or new.evidence_id is distinct from old.evidence_id) then
    select e.state, s.source_type into v_state, v_kind
      from public.evidence e join public.sources s on s.id = e.source_id
     where e.id = new.evidence_id;
    if v_state is null or v_state not in ('acquired', 'partially_acquired', 'system_generated') then
      raise exception 'an observed piece of the board must cite evidence that was obtained and is current'
        using errcode = 'P0001', hint = 'TEBOS_EVIDENCE_REQUIRED';
    end if;
    if v_kind = 'user_statement' then
      raise exception 'what the owner said makes a piece stated, not observed: cite evidence TEBOS obtained'
        using errcode = 'P0001', hint = 'TEBOS_EVIDENCE_REQUIRED';
    end if;
  end if;
  if tg_op = 'UPDATE' and old.basis = 'observed' and new.basis <> 'observed' then
    raise exception 'a piece evidence confirmed stays observed: cite newer evidence, or retire it'
      using errcode = 'P0001', hint = 'TEBOS_ILLEGAL_TRANSITION';
  end if;
  return new;
end $$;
