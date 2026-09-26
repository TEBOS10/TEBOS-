-- Business review: findings from all of a business's evidence, not one scan.
--
-- A scan analysis reads one website scan. A business review reads what TEBOS
-- holds about the business across channels — the latest website scan,
-- interview answers and other user statements, and the latest snapshot from
-- each connected system — and proposes findings from them together.
--
-- A review's findings replace the previous review's: a finding is linked to
-- the analysis run that produced it, and a later review supersedes the
-- earlier review's findings by run (there is no one-to-one successor finding).
-- Only TEBOS's server may set either link.

alter table public.findings
  add column analysis_run_id   uuid,
  add column superseded_by_run uuid,
  add constraint findings_analysis_run_fk foreign key (analysis_run_id, org_id) references public.agent_runs (id, org_id),
  add constraint findings_superseded_by_run_fk foreign key (superseded_by_run, org_id) references public.agent_runs (id, org_id);

alter table public.findings drop constraint findings_check;
alter table public.findings add constraint findings_superseded_check
  check (status <> 'superseded' or superseded_by is not null or superseded_by_run is not null);

create index findings_analysis_run_idx on public.findings (analysis_run_id) where analysis_run_id is not null;

create function tebos_private.guard_finding_origin() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not tebos_private.is_client() then
    return new;
  end if;
  if tg_op = 'INSERT' and (new.analysis_run_id is not null or new.superseded_by_run is not null)
     or tg_op = 'UPDATE' and (new.analysis_run_id is distinct from old.analysis_run_id
                              or new.superseded_by_run is distinct from old.superseded_by_run) then
    raise exception 'only TEBOS''s intelligence worker links findings to analysis runs'
      using errcode = '42501', hint = 'TEBOS_SERVER_ONLY';
  end if;
  return new;
end $$;

create trigger guard_finding_origin before insert or update on public.findings
  for each row execute function tebos_private.guard_finding_origin();
