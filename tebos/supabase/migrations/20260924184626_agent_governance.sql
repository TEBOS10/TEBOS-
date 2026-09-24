-- TEBOS agent governance (dossier §21/§22/§47).
--
-- Agents reason; the control plane governs. Every agent run and tool call is
-- recorded with purpose, permissions used and result, so a support operator
-- can reconstruct what happened.

create table public.agent_runs (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null,
  business_id      uuid,
  agent_role       text not null check (agent_role in ('orchestrator', 'acquisition', 'business_intelligence',
                     'workflow_architect', 'integration_executor', 'verification')),
  purpose          text not null,
  scan_id          uuid,
  action_id        uuid,
  input_context    jsonb not null default '{}'::jsonb,   -- references to what was provided, not secrets
  status           text not null default 'running' check (status in ('running', 'succeeded', 'failed', 'cancelled')),
  model_provider   text,
  model            text,
  tokens_in        int check (tokens_in >= 0),
  tokens_out       int check (tokens_out >= 0),
  output_summary   jsonb,
  error_detail     text,
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  unique (id, org_id),
  foreign key (business_id, org_id) references public.businesses (id, org_id) on delete cascade,
  foreign key (scan_id, org_id) references public.scans (id, org_id),
  foreign key (action_id, org_id) references public.actions (id, org_id),
  check (status <> 'failed' or error_detail is not null)
);

create table public.tool_calls (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null,
  agent_run_id     uuid not null,
  tool             text not null,
  capability_key   text references public.capabilities (key),
  permissions_used text[] not null default '{}',
  input_summary    jsonb,
  output_summary   jsonb,
  status           text not null check (status in ('succeeded', 'failed', 'denied')),
  error_detail     text,
  latency_ms       int check (latency_ms >= 0),
  created_at       timestamptz not null default now(),
  foreign key (agent_run_id, org_id) references public.agent_runs (id, org_id) on delete cascade,
  check (status = 'succeeded' or error_detail is not null)
);
create index tool_calls_run_idx on public.tool_calls (agent_run_id);

create function tebos_private.finish_agent_run() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status and new.status <> 'running' then
    new.finished_at := coalesce(new.finished_at, now());
  end if;
  return new;
end $$;

create trigger enforce_state_machine before insert or update of status on public.agent_runs
  for each row execute function tebos_private.guard_status('agent_run');
create trigger finish before update of status on public.agent_runs
  for each row execute function tebos_private.finish_agent_run();

create trigger audit after insert or update or delete on public.agent_runs
  for each row execute function tebos_private.audit_row();
create trigger audit after insert or update or delete on public.tool_calls
  for each row execute function tebos_private.audit_row();
