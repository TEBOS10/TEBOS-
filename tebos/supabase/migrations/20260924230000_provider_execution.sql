-- TEBOS stage 4: execution through verified providers (dossier §18–§20, §23).
--
-- An approved action runs through a connected provider and is verified by the
-- provider, not by TEBOS's own word:
--   * connection health (connected, verified, scopes) is written only by
--     TEBOS's server, after it has actually called the provider;
--   * credentials live in Supabase Vault. The database stores only a pointer,
--     and nothing a browser can call returns a secret;
--   * what an action executes (execution_input) is frozen once approval is
--     requested, and an approval authorises only the exact input it saw;
--   * runs through a provider, and the provider's confirmations, are written
--     only by the execution worker.
--
-- "Client" below means a request made with a user's own session (the
-- PostgREST roles anon / authenticated). TEBOS's server and its
-- security-definer functions are not clients.

create function tebos_private.is_client() returns boolean
language sql stable set search_path = '' as $$
  select current_user in ('authenticated', 'anon')
$$;

create function tebos_private.input_hash(p jsonb) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(coalesce(p::text, 'null'), 'UTF8')), 'hex')
$$;

-- ---------------------------------------------------------------------------
-- Registry: the first real provider. It is usable by an organisation only
-- once that organisation's own connection has been verified.
-- ---------------------------------------------------------------------------
insert into public.connectors (key, provider, name, auth_method, supports_webhooks, supports_polling, rate_limit,
                               data_sensitivity, execution_method)
values ('resend', 'Resend', 'Resend transactional email', 'api_key', true, true, '{"requests_per_second": 2}',
        'controlled', 'api');
insert into public.connector_capabilities (connector_key, capability_key, operation, risk_tier, required_scopes)
values ('resend', 'email.send_transactional', 'write', 2, '{emails:send}');

-- ---------------------------------------------------------------------------
-- Connections
-- ---------------------------------------------------------------------------
alter table public.connection_instances
  add column settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(settings) = 'object' and length(settings::text) <= 4096),
  add column webhook_credential_ref_id uuid,
  add column verification_requested_at timestamptz,
  add foreign key (webhook_credential_ref_id, org_id) references public.credential_references (id, org_id);

-- Clients configure, disable and re-enable connections and ask for a
-- verification. Everything that says whether a connection works is the
-- server's to write.
create function tebos_private.guard_connection_client() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not tebos_private.is_client() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'configured' or new.last_verified_at is not null or new.last_success_at is not null
       or new.last_failure_at is not null or new.failure_detail is not null or new.granted_scopes <> '{}'
       or new.credential_ref_id is not null or new.webhook_credential_ref_id is not null then
      raise exception 'a new connection starts unverified; only TEBOS''s server records its health'
        using errcode = '42501', hint = 'TEBOS_SERVER_ONLY';
    end if;
    new.created_by := auth.uid();
    return new;
  end if;
  if (new.last_verified_at, new.last_success_at, new.last_failure_at, new.failure_detail, new.granted_scopes,
      new.credential_ref_id, new.webhook_credential_ref_id, new.created_by)
     is distinct from
     (old.last_verified_at, old.last_success_at, old.last_failure_at, old.failure_detail, old.granted_scopes,
      old.credential_ref_id, old.webhook_credential_ref_id, old.created_by) then
    raise exception 'connection health and credentials are recorded only by TEBOS''s server'
      using errcode = '42501', hint = 'TEBOS_SERVER_ONLY';
  end if;
  if new.status is distinct from old.status and new.status not in ('disabled', 'configured') then
    raise exception 'a connection can only be marked % by TEBOS''s server after checking it with the provider', new.status
      using errcode = '42501', hint = 'TEBOS_SERVER_ONLY';
  end if;
  return new;
end $$;

create trigger guard_connection_client before insert or update on public.connection_instances
  for each row execute function tebos_private.guard_connection_client();

-- Store a credential in Vault and point the connection at it. The secret is
-- never readable back through any client-callable function. A new API key
-- makes the connection unverified until the server has used it.
create function public.set_connection_secret(p_connection uuid, p_purpose text, p_secret text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_conn public.connection_instances;
  v_old uuid;
  v_old_vault text;
  v_vault uuid;
  v_ref uuid;
begin
  select * into v_conn from public.connection_instances where id = p_connection for update;
  if v_conn.id is null or not tebos_private.has_role(v_conn.org_id, array['org_admin']) then
    raise exception 'only an organisation admin can set connection credentials'
      using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
  end if;
  if p_purpose is null or p_purpose not in ('api_key', 'webhook_signing_secret') then
    raise exception 'unknown credential purpose %', p_purpose using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  if p_secret is null or length(btrim(p_secret)) < 8 or length(p_secret) > 4096 or btrim(p_secret) ~ '\s' then
    raise exception 'that does not look like a credential' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;

  v_vault := vault.create_secret(btrim(p_secret), null, format('TEBOS %s for connection %s', p_purpose, p_connection));
  insert into public.credential_references (org_id, connector_key, vault_ref, label, created_by)
  values (v_conn.org_id, v_conn.connector_key, 'vault:' || v_vault, p_purpose, auth.uid())
  returning id into v_ref;

  if p_purpose = 'api_key' then
    v_old := v_conn.credential_ref_id;
    if v_conn.status in ('connected', 'degraded', 'expired') then
      update public.connection_instances set status = 'authentication_required' where id = p_connection;
    end if;
    update public.connection_instances
       set credential_ref_id = v_ref,
           status = case when status in ('authentication_required', 'unavailable') then 'configured' else status end,
           verification_requested_at = now()
     where id = p_connection;
  else
    v_old := v_conn.webhook_credential_ref_id;
    update public.connection_instances set webhook_credential_ref_id = v_ref where id = p_connection;
  end if;

  if v_old is not null then
    update public.credential_references set revoked_at = now() where id = v_old returning vault_ref into v_old_vault;
    if v_old_vault like 'vault:%' then
      delete from vault.secrets where id = substring(v_old_vault from 7)::uuid;
    end if;
  end if;
  return v_ref;
end $$;
revoke all on function public.set_connection_secret(uuid, text, text) from public, anon;
-- set_connection_secret is the only way a client creates or replaces a credential reference
revoke insert, update on public.credential_references from authenticated;
grant execute on function public.set_connection_secret(uuid, text, text) to authenticated;

-- Server-side only: resolve a live credential reference to its secret.
create function tebos_private.read_credential(p_ref uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_ref text;
  v_secret text;
begin
  select vault_ref into v_ref from public.credential_references where id = p_ref and revoked_at is null;
  if v_ref is null or v_ref not like 'vault:%' then
    return null;
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where id = substring(v_ref from 7)::uuid;
  return v_secret;
end $$;
revoke all on function tebos_private.read_credential(uuid) from public, anon, authenticated;
grant execute on function tebos_private.read_credential(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Actions: what is executed, and approval of exactly that
-- ---------------------------------------------------------------------------
alter table public.actions
  add column execution_input jsonb
    check (execution_input is null or (jsonb_typeof(execution_input) = 'object' and length(execution_input::text) <= 65536));

alter table public.approvals add column input_hash text;

alter table public.action_runs
  add column provider_reference text,
  add column provider_status text,
  add column provider_status_at timestamptz;
create unique index action_runs_provider_reference_idx on public.action_runs (connection_instance_id, provider_reference)
  where provider_reference is not null;

-- Fires before enforce_state_machine and guard_action (trigger names sort), so
-- the approval being checked has not yet been consumed.
create function tebos_private.guard_action_execution() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_approval uuid;
begin
  if (new.execution_input, new.execution_method, new.capability_key)
     is distinct from (old.execution_input, old.execution_method, old.capability_key)
     and old.status not in ('proposed', 'ready', 'blocked', 'failed') then
    raise exception 'action % cannot change what it executes while it is %', new.id, old.status
      using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'ready' and new.execution_method = 'api' and (new.capability_key is null or new.execution_input is null) then
    raise exception 'action % runs through a provider, so it needs a capability and its input before it is ready', new.id
      using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;

  if new.execution_method = 'api' and new.status in ('running', 'completed') and tebos_private.is_client() then
    raise exception 'only TEBOS''s execution worker runs provider actions and records their result'
      using errcode = '42501', hint = 'TEBOS_SERVER_ONLY';
  end if;

  if new.approval_required and new.execution_input is not null and new.status in ('approved', 'queued', 'running') then
    v_approval := tebos_private.valid_approval(new.id);
    if v_approval is not null and (select input_hash from public.approvals where id = v_approval)
                                  is distinct from tebos_private.input_hash(new.execution_input) then
      raise exception 'the approval for action % was given for different input; request approval again', new.id
        using errcode = 'P0001', hint = 'TEBOS_APPROVAL_REQUIRED';
    end if;
  end if;
  return new;
end $$;

create trigger enforce_approved_input before update on public.actions
  for each row execute function tebos_private.guard_action_execution();

-- An approval records (and its hash pins) the exact input it authorises.
create function tebos_private.bind_approval_input() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_input jsonb;
begin
  if tg_op = 'UPDATE' then
    if new.input_hash is distinct from old.input_hash then
      raise exception 'approval records cannot be rewritten' using errcode = 'P0001', hint = 'TEBOS_APPROVAL_IMMUTABLE';
    end if;
    return new;
  end if;
  select execution_input into v_input from public.actions where id = new.action_id;
  new.input_hash := tebos_private.input_hash(v_input);
  if v_input is not null then
    new.proposed_action := coalesce(new.proposed_action, '{}'::jsonb) || jsonb_build_object('execution_input', v_input);
  end if;
  return new;
end $$;

create trigger bind_input before insert or update on public.approvals
  for each row execute function tebos_private.bind_approval_input();

-- Runs through a provider, and anything the provider said, come only from
-- the execution worker. People record manual runs.
create function tebos_private.guard_run_origin() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not tebos_private.is_client() then
    return new;
  end if;
  if new.execution_method <> 'manual' or (tg_op = 'UPDATE' and old.execution_method <> 'manual') then
    raise exception 'only TEBOS''s execution worker records runs through a provider'
      using errcode = '42501', hint = 'TEBOS_SERVER_ONLY';
  end if;
  if new.provider_reference is not null or new.provider_status is not null or new.provider_status_at is not null
     or coalesce(new.verification_method, '') like 'provider:%' then
    raise exception 'provider confirmations are recorded only by TEBOS''s execution worker'
      using errcode = '42501', hint = 'TEBOS_SERVER_ONLY';
  end if;
  return new;
end $$;

create trigger guard_run_origin before insert or update on public.action_runs
  for each row execute function tebos_private.guard_run_origin();

create index connection_instances_verify_idx on public.connection_instances (verification_requested_at)
  where verification_requested_at is not null;
create index action_runs_unverified_idx on public.action_runs (finished_at)
  where status = 'succeeded' and not verified and provider_reference is not null;
