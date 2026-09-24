-- TEBOS capability layer (dossier §18/§19/§41).
--
-- Business logic asks "which capability is required?", never "which vendor?".
-- The registry (capabilities, connectors, connector_capabilities) is
-- platform-wide: it says what TEBOS knows how to use. connection_instances
-- are per tenant: they say what an organisation has actually connected.
-- The two are deliberately separate tables.

create table public.capabilities (
  key               text primary key check (key ~ '^[a-z][a-z0-9_.]*$'),   -- e.g. 'email.send_transactional'
  name              text not null,
  description       text,
  -- minimum risk tier of any operation under this capability (dossier §17)
  default_risk_tier smallint not null check (default_risk_tier between 0 and 3),
  created_at        timestamptz not null default now()
);

create table public.connectors (
  key               text primary key check (key ~ '^[a-z][a-z0-9_.-]*$'),  -- e.g. 'resend', 'hubspot'
  provider          text not null,
  name              text not null,
  auth_method       text not null check (auth_method in ('none', 'api_key', 'oauth2', 'basic', 'service_account', 'mcp')),
  supports_webhooks boolean not null default false,
  supports_polling  boolean not null default false,
  rate_limit        jsonb,
  data_sensitivity  text not null default 'controlled' check (data_sensitivity in ('public', 'controlled', 'restricted')),
  execution_method  text not null check (execution_method in ('api', 'mcp', 'automation', 'browser', 'internal')),
  created_at        timestamptz not null default now()
);

create table public.connector_capabilities (
  connector_key  text not null references public.connectors (key) on delete cascade,
  capability_key text not null references public.capabilities (key) on delete cascade,
  operation      text not null check (operation in ('read', 'write')),
  risk_tier      smallint not null check (risk_tier between 0 and 3),
  required_scopes text[] not null default '{}',
  primary key (connector_key, capability_key, operation)
);

-- References to secrets held in a vault (e.g. Supabase Vault / provider
-- secret manager). There is deliberately no column that can hold a secret.
create table public.credential_references (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organisations (id) on delete cascade,
  connector_key text not null references public.connectors (key),
  vault_ref     text not null,      -- opaque pointer, resolved only server-side
  label         text,
  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  rotated_at    timestamptz,
  revoked_at    timestamptz,
  unique (id, org_id)
);

create table public.connection_instances (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organisations (id) on delete cascade,
  business_id       uuid,
  connector_key     text not null references public.connectors (key),
  status            text not null default 'configured' check (status in ('configured', 'authentication_required',
                      'connected', 'degraded', 'expired', 'unavailable', 'disabled')),
  granted_scopes    text[] not null default '{}',
  credential_ref_id uuid,
  last_verified_at  timestamptz,      -- last time an operation proved the connection works
  last_success_at   timestamptz,
  last_failure_at   timestamptz,
  failure_detail    text,
  created_by        uuid references auth.users (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, org_id),
  foreign key (business_id, org_id) references public.businesses (id, org_id) on delete cascade,
  foreign key (credential_ref_id, org_id) references public.credential_references (id, org_id),
  -- "connected" is only ever shown after verification (dossier §19)
  check (status <> 'connected' or last_verified_at is not null)
);

-- Moving to "connected" requires a verification that happened just now, and
-- credentials when the connector needs them.
create function tebos_private.guard_connection() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_auth text;
begin
  if new.status = 'connected' and new.status is distinct from old.status then
    select auth_method into v_auth from public.connectors where key = new.connector_key;
    if v_auth <> 'none' and new.credential_ref_id is null then
      raise exception 'connection % cannot be connected without a credential reference', new.id
        using errcode = 'P0001', hint = 'TEBOS_CONNECTION_UNVERIFIED';
    end if;
    if new.last_verified_at is null or new.last_verified_at < now() - interval '15 minutes'
       or new.last_verified_at is not distinct from old.last_verified_at then
      raise exception 'connection % needs a fresh verification before it can be marked connected', new.id
        using errcode = 'P0001', hint = 'TEBOS_CONNECTION_UNVERIFIED';
    end if;
  end if;
  return new;
end $$;

create trigger enforce_state_machine before insert or update of status on public.connection_instances
  for each row execute function tebos_private.guard_status('connection');
create trigger guard_connection before update of status on public.connection_instances
  for each row execute function tebos_private.guard_connection();
create trigger touch before update on public.connection_instances
  for each row execute function tebos_private.touch_updated_at();

-- Inbound provider events. The unique key makes webhook replays no-ops.
create table public.integration_events (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null,
  connection_instance_id uuid not null,
  provider_event_id      text not null,
  event_type             text not null,
  payload_summary        jsonb,
  received_at            timestamptz not null default now(),
  processed_at           timestamptz,
  unique (connection_instance_id, provider_event_id),
  foreign key (connection_instance_id, org_id) references public.connection_instances (id, org_id) on delete cascade
);

create trigger audit after insert or update or delete on public.credential_references
  for each row execute function tebos_private.audit_row();
create trigger audit after insert or update or delete on public.connection_instances
  for each row execute function tebos_private.audit_row();
create trigger audit after insert or update or delete on public.capabilities
  for each row execute function tebos_private.audit_row();
create trigger audit after insert or update or delete on public.connectors
  for each row execute function tebos_private.audit_row();
create trigger audit after insert or update or delete on public.connector_capabilities
  for each row execute function tebos_private.audit_row();

-- Seed: capabilities only. No connector is seeded as usable; adding one is a
-- deliberate, reviewed change.
insert into public.capabilities (key, name, description, default_risk_tier) values
  ('web.read_public',           'Read public web pages',      'Acquire publicly reachable pages through the SSRF-safe fetcher', 0),
  ('analysis.generate_findings','Generate findings',          'Interpret stored evidence into findings', 1),
  ('document.draft',            'Draft internal document',    'Create a non-public internal artefact', 1),
  ('task.create_internal',      'Create internal task',       'Create a task in the TEBOS internal task engine', 1),
  ('crm.create_contact',        'Create CRM contact',         'Create an external CRM record', 2),
  ('email.send_transactional',  'Send transactional email',   'Send an email to an external recipient', 2),
  ('web.update_public_content', 'Update public web content',  'Change public-facing but recoverable configuration', 2),
  ('finance.initiate_payment',  'Initiate payment',           'Move money', 3),
  ('credentials.rotate',        'Rotate credentials',         'Change credentials on an external system', 3),
  ('data.delete_irreversible',  'Delete data irreversibly',   'Destructive, non-recoverable deletion', 3);
