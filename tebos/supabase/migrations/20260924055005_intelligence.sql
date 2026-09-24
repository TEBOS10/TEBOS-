-- TEBOS intelligence core: businesses, scans, evidence, findings.
--
-- Traceability chain (dossier §5): source -> evidence -> finding -> action.
-- Composite foreign keys carry org_id / business_id down the chain, so a row
-- can never point at another tenant's (or another business's) data.

-- ---------------------------------------------------------------------------
-- Businesses: the persistent unit of work (dossier §10)
-- ---------------------------------------------------------------------------

create table public.businesses (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organisations (id) on delete cascade,
  name            text not null check (length(trim(name)) > 0),
  legal_name      text,
  trading_name    text,
  website         text,
  primary_domain  text check (primary_domain = lower(primary_domain)),
  industry        text,
  business_model  text,
  geography       text,
  size_context    text,
  created_by      uuid references auth.users (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  archived_at     timestamptz,
  unique (id, org_id)
);
-- one live business per domain per tenant: repeat scans attach to it
create unique index businesses_org_domain_idx on public.businesses (org_id, primary_domain)
  where primary_domain is not null and archived_at is null;

-- Progressive context (dossier §11). Everything a user tells TEBOS is kept
-- as a user statement, never silently promoted to observed fact.
create table public.business_contexts (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  business_id uuid not null,
  kind        text not null check (kind in ('objective', 'constraint', 'problem', 'system', 'provider',
                                            'stakeholder', 'desired_outcome', 'note')),
  statement   text not null check (length(trim(statement)) > 0),
  supplied_by uuid references auth.users (id),
  created_at  timestamptz not null default now(),
  retired_at  timestamptz,
  foreign key (business_id, org_id) references public.businesses (id, org_id) on delete cascade
);
create index business_contexts_business_idx on public.business_contexts (business_id);

create table public.sources (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  business_id uuid not null,
  source_type text not null check (source_type in ('public_web', 'document', 'connected_system',
                                                   'user_statement', 'specialist', 'third_party', 'system')),
  uri         text,
  label       text,
  -- 0..1 prior on how much this kind of source can be relied on
  reliability numeric(4,3) check (reliability between 0 and 1),
  created_at  timestamptz not null default now(),
  unique (id, org_id),
  unique (id, business_id),
  foreign key (business_id, org_id) references public.businesses (id, org_id) on delete cascade
);
create unique index sources_identity_idx on public.sources (business_id, source_type, coalesce(uri, ''));

-- ---------------------------------------------------------------------------
-- Scans (dossier §39). Status is derived from targets and enforced below:
-- a scan cannot claim "completed" while any target was not acquired, and
-- cannot claim "failed" while it holds acquired evidence.
-- ---------------------------------------------------------------------------

create table public.scans (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null,
  business_id           uuid not null,
  objective             text,
  scope                 jsonb not null default '{}'::jsonb,
  target_limit          int not null default 7 check (target_limit between 1 and 500),
  status                text not null default 'queued'
                          check (status in ('queued', 'running', 'completed', 'partial', 'failed', 'cancelled')),
  confidence            numeric(4,3) check (confidence between 0 and 1),
  confidence_components jsonb,
  failure_class         text check (failure_class in ('acquisition', 'extraction', 'reasoning_limitation',
                                                      'integration', 'permission', 'validation', 'dependency', 'internal')),
  failure_detail        text,
  requested_by          uuid references auth.users (id),
  created_at            timestamptz not null default now(),
  started_at            timestamptz,
  finished_at           timestamptz,
  unique (id, org_id),
  unique (id, business_id),
  foreign key (business_id, org_id) references public.businesses (id, org_id) on delete cascade,
  check (status <> 'failed' or failure_class is not null)
);
create index scans_business_idx on public.scans (business_id, created_at desc);

create table public.scan_targets (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  scan_id       uuid not null,
  source_id     uuid,
  uri           text not null,
  status        text not null default 'pending'
                  check (status in ('pending', 'acquired', 'partially_acquired', 'unavailable', 'blocked', 'skipped')),
  http_status   int,
  failure_class text check (failure_class in ('acquisition', 'extraction', 'permission', 'validation', 'internal')),
  failure_detail text,
  content_hash  text,
  bytes         int check (bytes >= 0),
  attempted_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (id, org_id),
  unique (scan_id, uri),
  foreign key (scan_id, org_id) references public.scans (id, org_id) on delete cascade,
  foreign key (source_id, org_id) references public.sources (id, org_id),
  -- a target that was not acquired must say why (dossier §25/§46)
  check (status not in ('unavailable', 'blocked') or failure_class is not null)
);

create function tebos_private.guard_scan_outcome() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  n_total int; n_pending int; n_acquired int; n_full int;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'running' and new.started_at is null then
    new.started_at := now();
  end if;

  if new.status in ('completed', 'partial', 'failed') then
    select count(*),
           count(*) filter (where status = 'pending'),
           count(*) filter (where status in ('acquired', 'partially_acquired')),
           count(*) filter (where status = 'acquired')
      into n_total, n_pending, n_acquired, n_full
      from public.scan_targets where scan_id = new.id;

    if n_pending > 0 then
      raise exception 'scan % still has % pending target(s)', new.id, n_pending
        using errcode = 'P0001', hint = 'TEBOS_SCAN_UNRESOLVED_TARGETS';
    end if;
    if new.status = 'completed' and (n_total = 0 or n_full < n_total) then
      raise exception 'scan % cannot be completed: % of % targets fully acquired', new.id, n_full, n_total
        using errcode = 'P0001', hint = 'TEBOS_SCAN_NOT_COMPLETE';
    end if;
    if new.status = 'partial' and (n_acquired = 0 or n_full = n_total) then
      raise exception 'scan % is not partial: % acquired of % targets', new.id, n_acquired, n_total
        using errcode = 'P0001', hint = 'TEBOS_SCAN_NOT_PARTIAL';
    end if;
    if new.status = 'failed' and n_acquired > 0 then
      raise exception 'scan % holds acquired evidence and must be reported as partial, not failed', new.id
        using errcode = 'P0001', hint = 'TEBOS_SCAN_HIDES_EVIDENCE';
    end if;
  end if;

  if new.status in ('completed', 'partial', 'failed', 'cancelled') then
    new.finished_at := coalesce(new.finished_at, now());
  end if;
  return new;
end $$;

create trigger enforce_state_machine before insert or update of status on public.scans
  for each row execute function tebos_private.guard_status('scan');
create trigger guard_outcome before update of status on public.scans
  for each row execute function tebos_private.guard_scan_outcome();
create trigger enforce_state_machine before insert or update of status on public.scan_targets
  for each row execute function tebos_private.guard_status('scan_target');

-- ---------------------------------------------------------------------------
-- Evidence: first-class, provenance-carrying facts (dossier §13).
-- "Not found" is recorded as state 'unavailable' with a description of what
-- is missing — never as a fact that something does not exist.
-- ---------------------------------------------------------------------------

create table public.evidence (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null,
  business_id         uuid not null,
  source_id           uuid not null,
  scan_id             uuid,
  scan_target_id      uuid,
  state               text not null check (state in ('acquired', 'partially_acquired', 'unavailable', 'stale',
                                                     'conflicting', 'unsupported', 'user_supplied', 'system_generated')),
  fact                text,
  missing_description text,
  excerpt             text,
  structured_value    jsonb,
  content_location    text,           -- selector / page / section inside the source
  retrieved_at        timestamptz,
  fresh_until         timestamptz,
  extraction_status   text check (extraction_status in ('complete', 'partial', 'failed', 'not_applicable')),
  confidence          numeric(4,3) check (confidence between 0 and 1),
  created_by_actor    text not null default tebos_private.actor_type(),
  created_at          timestamptz not null default now(),
  unique (id, org_id),
  unique (id, business_id),
  foreign key (business_id, org_id) references public.businesses (id, org_id) on delete cascade,
  foreign key (source_id, business_id) references public.sources (id, business_id),
  foreign key (scan_id, business_id) references public.scans (id, business_id),
  foreign key (scan_target_id, org_id) references public.scan_targets (id, org_id),
  -- a fact is asserted iff the evidence was actually obtained
  check ((state = 'unavailable') = (fact is null)),
  check (state <> 'unavailable' or missing_description is not null),
  -- acquired evidence must say when it was retrieved and show what it saw
  check (state not in ('acquired', 'partially_acquired')
         or (retrieved_at is not null and (excerpt is not null or structured_value is not null)))
);
create index evidence_business_idx on public.evidence (business_id, created_at desc);
create index evidence_scan_idx on public.evidence (scan_id);

-- Evidence content is immutable once recorded; only its lifecycle metadata
-- (state -> stale/conflicting, freshness, confidence) may change.
create function tebos_private.guard_evidence_immutable() returns trigger
language plpgsql as $$
begin
  if (new.fact, new.excerpt, new.structured_value, new.source_id, new.scan_id, new.scan_target_id,
      new.retrieved_at, new.content_location, new.business_id, new.org_id)
     is distinct from
     (old.fact, old.excerpt, old.structured_value, old.source_id, old.scan_id, old.scan_target_id,
      old.retrieved_at, old.content_location, old.business_id, old.org_id) then
    raise exception 'evidence content is immutable; record new evidence instead'
      using errcode = 'P0001', hint = 'TEBOS_EVIDENCE_IMMUTABLE';
  end if;
  if old.state <> new.state and new.state not in ('stale', 'conflicting', 'unsupported') then
    raise exception 'evidence state may only move to stale, conflicting or unsupported'
      using errcode = 'P0001', hint = 'TEBOS_EVIDENCE_IMMUTABLE';
  end if;
  return new;
end $$;

create trigger guard_immutable before update on public.evidence
  for each row execute function tebos_private.guard_evidence_immutable();

-- ---------------------------------------------------------------------------
-- Findings: evidence-backed interpretations (dossier §15)
-- ---------------------------------------------------------------------------

create table public.findings (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null,
  business_id           uuid not null,
  scan_id               uuid,
  title                 text not null check (length(trim(title)) > 0),
  statement             text not null,
  kind                  text not null default 'interpretation' check (kind in ('interpretation', 'hypothesis')),
  category              text not null check (category in ('weakness', 'bottleneck', 'missing_capability', 'risk',
                          'opportunity', 'inconsistency', 'duplicated_effort', 'manual_work', 'untracked_work',
                          'revenue_leakage', 'operational_leakage', 'dependency', 'gap')),
  impact_hypothesis     text,
  confidence            numeric(4,3) not null check (confidence between 0 and 1),
  confidence_components jsonb,
  missing_information   text[] not null default '{}',
  status                text not null default 'draft' check (status in ('draft', 'active', 'superseded', 'dismissed')),
  superseded_by         uuid references public.findings (id),
  created_by_actor      text not null default tebos_private.actor_type(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (id, org_id),
  unique (id, business_id),
  foreign key (business_id, org_id) references public.businesses (id, org_id) on delete cascade,
  foreign key (scan_id, business_id) references public.scans (id, business_id),
  check (status <> 'superseded' or superseded_by is not null)
);
create index findings_business_idx on public.findings (business_id, status);

-- The evidence graph. Composite keys guarantee a finding can only cite
-- evidence about the same business.
create table public.finding_evidence (
  org_id      uuid not null,
  business_id uuid not null,
  finding_id  uuid not null,
  evidence_id uuid not null,
  relation    text not null default 'supports' check (relation in ('supports', 'contradicts', 'context')),
  note        text,
  created_at  timestamptz not null default now(),
  primary key (finding_id, evidence_id),
  foreign key (business_id, org_id) references public.businesses (id, org_id) on delete cascade,
  foreign key (finding_id, business_id) references public.findings (id, business_id) on delete cascade,
  foreign key (evidence_id, business_id) references public.evidence (id, business_id)
);
create index finding_evidence_evidence_idx on public.finding_evidence (evidence_id);

-- Evidence before assertion: an active finding must be supported by at least
-- one piece of evidence that was actually obtained. Checked at commit so a
-- finding and its evidence links can be written in one transaction.
create function tebos_private.check_finding_supported(p_finding uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
begin
  select status into v_status from public.findings where id = p_finding;
  if v_status = 'active' and not exists (
    select 1 from public.finding_evidence fe
    join public.evidence e on e.id = fe.evidence_id
    where fe.finding_id = p_finding and fe.relation = 'supports'
      and e.state in ('acquired', 'partially_acquired', 'user_supplied', 'system_generated', 'stale', 'conflicting')
  ) then
    raise exception 'finding % is active without supporting evidence', p_finding
      using errcode = 'P0001', hint = 'TEBOS_FINDING_UNSUPPORTED';
  end if;
end $$;

create function tebos_private.enforce_finding_supported() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'findings' then
    perform tebos_private.check_finding_supported(new.id);
  else
    perform tebos_private.check_finding_supported(old.finding_id);
  end if;
  return null;
end $$;

create constraint trigger finding_supported after insert or update on public.findings
  deferrable initially deferred for each row execute function tebos_private.enforce_finding_supported();
create constraint trigger finding_supported after delete or update on public.finding_evidence
  deferrable initially deferred for each row execute function tebos_private.enforce_finding_supported();

create trigger enforce_state_machine before insert or update of status on public.findings
  for each row execute function tebos_private.guard_status('finding');
create trigger touch before update on public.findings
  for each row execute function tebos_private.touch_updated_at();
create trigger touch before update on public.businesses
  for each row execute function tebos_private.touch_updated_at();

-- Audit
create trigger audit after insert or update or delete on public.businesses
  for each row execute function tebos_private.audit_row();
create trigger audit after insert or update or delete on public.business_contexts
  for each row execute function tebos_private.audit_row();
create trigger audit after insert or update or delete on public.sources
  for each row execute function tebos_private.audit_row();
create trigger audit after insert or update or delete on public.scans
  for each row execute function tebos_private.audit_row();
create trigger audit after insert or update or delete on public.scan_targets
  for each row execute function tebos_private.audit_row();
create trigger audit after insert or update or delete on public.evidence
  for each row execute function tebos_private.audit_row();
create trigger audit after insert or update or delete on public.findings
  for each row execute function tebos_private.audit_row();
create trigger audit after insert or update or delete on public.finding_evidence
  for each row execute function tebos_private.audit_row();
