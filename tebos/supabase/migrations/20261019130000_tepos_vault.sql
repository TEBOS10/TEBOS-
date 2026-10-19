-- The private vault (founder, 19 Oct 2026: "store these documents in my office, organised professionally").
-- ROADMAP priority 5: private documents, every read audited, short-lived signed links.
--
-- What it holds: the founder's own papers (the agency's blank forms, the onboarding pack, the PPRA application,
-- the employment letter, marketing). Some carry the founder's ID number, so they never go near the code
-- repository: the founder uploads them from TEPOS, into Supabase Storage, in a private bucket.
--
-- "No tampering with actual legal documents": a stored file is never changed or replaced. There is no update or
-- delete rule on the files. Each document's fingerprint (SHA-256, taken in the browser before upload) is kept, so
-- anyone can check a copy against it. Removing a file is the founder's decision, done by hand, never by the app.
--
-- Rules:
--   * Only in a private organisation, for its owner, after two-step sign-in.
--   * A file can be uploaded only to the path its record names, and only once.
--   * A record counts as stored only when the database itself sees the file (vault_confirm), never on the
--     browser's word.
--   * Opening a file goes through vault_open, which writes a read record first. The storage rule lets the owner
--     sign a link (valid one minute) only right after that record, so no read goes unlogged.
--   * No passwords or secrets in titles or notes. The audit trail is redacted.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tepos-vault', 'tepos-vault', false, 20971520,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

create table public.vault_documents (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organisations (id) on delete cascade,
  folder        text not null check (folder in ('licence', 'agency_forms', 'onboarding', 'deals', 'marketing', 'personal')),
  pack_item     text check (pack_item is null or pack_item in (
                  'ppra_application', 'employment_letter',
                  'exclusive_mandate', 'open_mandate', 'offer_to_purchase', 'mandatory_disclosure', 'fica_form',
                  'fica_risk_assessment', 'popi_consent', 'popi_consent_short', 'seventy_two_hour_clause', 'property_checklist',
                  'welcome_package', 'doxit_manual', 'nda',
                  'agent_flyer')),
  title         text not null check (length(trim(title)) between 2 and 160),
  file_name     text not null check (length(file_name) between 1 and 200),
  mime_type     text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes    bigint not null check (size_bytes between 1 and 20971520),
  sha256        text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  storage_path  text not null unique,
  stored_at     timestamptz,
  note          text check (note is null or length(note) <= 500),
  archived_at   timestamptz,
  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, org_id),
  check (storage_path = org_id::text || '/' || id::text)
);
create index vault_documents_org_idx on public.vault_documents (org_id, folder);

-- Every opening of a file. Written only by vault_open; never changed or removed by the app.
create table public.vault_reads (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  document_id  uuid not null,
  user_id      uuid not null references auth.users (id),
  opened_at    timestamptz not null default now(),
  foreign key (document_id, org_id) references public.vault_documents (id, org_id) on delete cascade
);
create index vault_reads_document_idx on public.vault_reads (document_id, opened_at desc);

-- Is the file really in storage? Asked by the database, not the browser.
create function tebos_private.vault_object_exists(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from storage.objects where bucket_id = 'tepos-vault' and name = p_path)
$$;
grant execute on function tebos_private.vault_object_exists(text) to authenticated;

create function tebos_private.guard_vault_document() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not tebos_private.is_private_org(new.org_id) then
    raise exception 'the vault lives only in a private organisation' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
  end if;
  if tebos_private.looks_secret(new.title) or tebos_private.looks_secret(new.note) then
    raise exception 'this looks like a password, key or token; secrets are never stored here'
      using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  if tg_op = 'INSERT' then
    new.stored_at := null;
    if tebos_private.is_client() then
      new.created_by := auth.uid();
    end if;
  else
    new.created_by := old.created_by;
    if new.storage_path is distinct from old.storage_path or new.sha256 is distinct from old.sha256
       or new.size_bytes is distinct from old.size_bytes or new.mime_type is distinct from old.mime_type
       or new.file_name is distinct from old.file_name then
      raise exception 'a stored file and its fingerprint never change' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
    end if;
    if old.stored_at is not null then
      new.stored_at := old.stored_at;
    elsif new.stored_at is not null then
      if not tebos_private.vault_object_exists(new.storage_path) then
        raise exception 'the file has not arrived in the vault' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
      end if;
      new.stored_at := now();
    end if;
  end if;
  return new;
end $$;

create trigger guard_vault_document before insert or update on public.vault_documents
  for each row execute function tebos_private.guard_vault_document();
create trigger touch before update on public.vault_documents for each row execute function tebos_private.touch_updated_at();
create trigger freeze_tenant_keys before update on public.vault_documents for each row execute function tebos_private.freeze_tenant_keys();
create trigger audit after insert or update or delete on public.vault_documents for each row execute function tebos_private.audit_row_redacted();

alter table public.vault_documents enable row level security;
revoke all on public.vault_documents from anon, authenticated;
create policy owner_select on public.vault_documents for select to authenticated
  using (tebos_private.has_role(org_id, array['org_admin']) and tebos_private.two_step());
create policy owner_insert on public.vault_documents for insert to authenticated
  with check (tebos_private.has_role(org_id, array['org_admin']) and tebos_private.two_step());
create policy owner_update on public.vault_documents for update to authenticated
  using (tebos_private.has_role(org_id, array['org_admin']) and tebos_private.two_step())
  with check (tebos_private.has_role(org_id, array['org_admin']) and tebos_private.two_step());
grant select, insert, update on public.vault_documents to authenticated;
grant all on public.vault_documents to service_role;

alter table public.vault_reads enable row level security;
revoke all on public.vault_reads from anon, authenticated;
create policy owner_select on public.vault_reads for select to authenticated
  using (tebos_private.has_role(org_id, array['org_admin']) and tebos_private.two_step());
grant select on public.vault_reads to authenticated;
grant all on public.vault_reads to service_role;

-- After an upload: the database checks the file is there, then marks the record stored.
create function public.vault_confirm(p_document uuid) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare d public.vault_documents;
begin
  select * into d from public.vault_documents where id = p_document;
  if d.id is null or not (tebos_private.has_role(d.org_id, array['org_admin']) and tebos_private.two_step()) then
    raise exception 'no such document' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
  end if;
  if d.stored_at is not null then
    return d.stored_at;
  end if;
  -- the guard checks the file is really there before it accepts the date
  update public.vault_documents set stored_at = now() where id = p_document returning stored_at into d.stored_at;
  return d.stored_at;
end $$;

-- Opening a file: the read is written down first, then the file's path is handed back for a one-minute link.
create function public.vault_open(p_document uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare d public.vault_documents;
begin
  select * into d from public.vault_documents where id = p_document;
  if d.id is null or not (tebos_private.has_role(d.org_id, array['org_admin']) and tebos_private.two_step()) then
    raise exception 'no such document' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
  end if;
  if d.stored_at is null then
    raise exception 'the file has not arrived in the vault' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  insert into public.vault_reads (org_id, document_id, user_id) values (d.org_id, d.id, auth.uid());
  return d.storage_path;
end $$;

revoke all on function public.vault_confirm(uuid), public.vault_open(uuid) from public, anon;
grant execute on function public.vault_confirm(uuid), public.vault_open(uuid) to authenticated;

-- The storage rules for the bucket. Upload: only to the path a record names, before it is stored. Read (which is
-- what signing a link needs): only within a minute of a logged opening. No rule lets anyone change or remove a file.
create function tebos_private.vault_may_upload(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.vault_documents d
     where d.storage_path = p_path and d.stored_at is null and d.archived_at is null
       and tebos_private.has_role(d.org_id, array['org_admin']) and tebos_private.two_step()
  )
$$;

create function tebos_private.vault_may_read(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.vault_documents d join public.vault_reads r on r.document_id = d.id
     where d.storage_path = p_path and r.user_id = auth.uid() and r.opened_at > now() - interval '1 minute'
       and tebos_private.has_role(d.org_id, array['org_admin']) and tebos_private.two_step()
  )
$$;

grant execute on function tebos_private.vault_may_upload(text), tebos_private.vault_may_read(text) to authenticated;

create policy tepos_vault_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'tepos-vault' and tebos_private.vault_may_upload(name));
create policy tepos_vault_read on storage.objects for select to authenticated
  using (bucket_id = 'tepos-vault' and tebos_private.vault_may_read(name));
