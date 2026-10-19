-- The private vault: only in the private organisation, for its owner, after two-step sign-in; a file goes only
-- where its record says, once, and is never changed or removed; "stored" only when the file is really there;
-- every opening is logged first, and only then may a link be signed.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99zo;
grant usage on schema t99zo to anon, authenticated;
create function t99zo.expect_error(p_sql text, p_expect text) returns void
language plpgsql as $$
declare v_hint text; v_state text; v_msg text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint, v_state = returned_sqlstate, v_msg = message_text;
    if (p_expect like 'TEBOS_%' and v_hint is distinct from p_expect) or (p_expect not like 'TEBOS_%' and v_state <> p_expect) then
      raise exception 'expected % but got % / % (%)', p_expect, v_state, v_hint, v_msg;
    end if;
    return;
  end;
  raise exception 'expected % but statement succeeded: %', p_expect, p_sql;
end $$;
create function t99zo.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t99zo to anon, authenticated;

select '9f9c0000-0000-0000-0000-00000000000a' as owner, '9f9c0000-0000-0000-0000-00000000000b' as other,
       '9f9c0000-0000-0000-0000-0000000000d2' as shared_org, repeat('a', 64) as fp \gset
insert into auth.users (id, email, email_confirmed_at) values (:'owner', 'owner@p99zo.test', now()), (:'other', 'other@p99zo.test', now());
insert into public.organisations (id, name, slug) values (:'shared_org', 'Shared 99zo', 'shared-99zo');
insert into public.memberships (org_id, user_id, role) values (:'shared_org', :'owner', 'org_admin');
select t99zo.ok((select not public from storage.buckets where id = 'tepos-vault'), 'the bucket is private');

set role authenticated;
select set_config('request.jwt.claim.sub', :'owner', false);
select set_config('request.jwt.claims', '{"aal":"aal2"}', false);
select public.create_private_organisation('Vault 99zo', 'vault-99zo') as vault \gset
select gen_random_uuid() as doc \gset
select :'vault' || '/' || :'doc' as path \gset

-- ===========================================================================
-- Filing a document
-- ===========================================================================
insert into public.vault_documents (id, org_id, folder, pack_item, title, file_name, mime_type, size_bytes, sha256, storage_path, stored_at)
values (:'doc', :'vault', 'agency_forms', 'exclusive_mandate', 'Exclusive mandate (blank form)', 'Exclusive_Mandate.pdf', 'application/pdf', 548300, :'fp', :'path', now());
select t99zo.ok((select stored_at is null from public.vault_documents where id = :'doc'), 'a new record is not stored on the browser''s word');
-- the path is the record's own; only listed folders, types and sizes; a real fingerprint; no secrets
select t99zo.expect_error(format($$insert into public.vault_documents (org_id, folder, title, file_name, mime_type, size_bytes, sha256, storage_path) values (%L, 'agency_forms', 'X form', 'x.pdf', 'application/pdf', 10, %L, %L)$$, :'vault', :'fp', :'vault' || '/elsewhere'), '23514');
select t99zo.expect_error(format($$insert into public.vault_documents (id, org_id, folder, title, file_name, mime_type, size_bytes, sha256, storage_path) values (%L, %L, 'secrets', 'X form', 'x.pdf', 'application/pdf', 10, %L, %L)$$, gen_random_uuid(), :'vault', :'fp', 'p'), '23514');
select gen_random_uuid() as d2 \gset
select t99zo.expect_error(format($$insert into public.vault_documents (id, org_id, folder, title, file_name, mime_type, size_bytes, sha256, storage_path) values (%L, %L, 'personal', 'X form', 'x.exe', 'application/x-msdownload', 10, %L, %L)$$, :'d2', :'vault', :'fp', :'vault' || '/' || :'d2'), '23514');
select t99zo.expect_error(format($$insert into public.vault_documents (id, org_id, folder, title, file_name, mime_type, size_bytes, sha256, storage_path) values (%L, %L, 'personal', 'X form', 'x.pdf', 'application/pdf', 30000000, %L, %L)$$, :'d2', :'vault', :'fp', :'vault' || '/' || :'d2'), '23514');
select t99zo.expect_error(format($$insert into public.vault_documents (id, org_id, folder, title, file_name, mime_type, size_bytes, sha256, storage_path) values (%L, %L, 'personal', 'X form', 'x.pdf', 'application/pdf', 10, 'not-a-hash', %L)$$, :'d2', :'vault', :'vault' || '/' || :'d2'), '23514');
select t99zo.expect_error(format($$update public.vault_documents set note = 'password: hunter2' where id = %L$$, :'doc'), 'TEBOS_VALIDATION');
-- only in a private organisation
select t99zo.expect_error(format($$insert into public.vault_documents (id, org_id, folder, title, file_name, mime_type, size_bytes, sha256, storage_path) values (%L, %L, 'personal', 'X form', 'x.pdf', 'application/pdf', 10, %L, %L)$$, :'d2', :'shared_org', :'fp', :'shared_org' || '/' || :'d2'), 'TEBOS_PERMISSION_DENIED');

-- ===========================================================================
-- Uploading: only where a record says, and "stored" only when the file is there
-- ===========================================================================
select t99zo.expect_error(format($$update public.vault_documents set stored_at = now() where id = %L$$, :'doc'), 'TEBOS_VALIDATION');
select t99zo.expect_error(format($$select public.vault_confirm(%L)$$, :'doc'), 'TEBOS_VALIDATION');
select t99zo.expect_error(format($$insert into storage.objects (bucket_id, name) values ('tepos-vault', %L)$$, :'vault' || '/not-a-record'), '42501');
insert into storage.objects (bucket_id, name) values ('tepos-vault', :'path');
select t99zo.ok(public.vault_confirm(:'doc') is not null, 'stored once the file is there');
select t99zo.ok((select stored_at is not null from public.vault_documents where id = :'doc'), 'the record says stored');
-- the file is never replaced, changed or removed
select t99zo.expect_error(format($$insert into storage.objects (bucket_id, name) values ('tepos-vault', %L)$$, :'path'), '42501');
update storage.objects set metadata = '{"x":1}' where name = :'path';
delete from storage.objects where name = :'path';
reset role;
select t99zo.ok((select count(*) = 1 and bool_and(metadata is null) from storage.objects where name = :'path'), 'the file is untouched');
set role authenticated;
select t99zo.expect_error(format($$update public.vault_documents set sha256 = %L where id = %L$$, repeat('b', 64), :'doc'), 'TEBOS_INPUT_FROZEN');
select t99zo.expect_error(format($$update public.vault_documents set storage_path = %L where id = %L$$, :'vault' || '/x', :'doc'), 'TEBOS_INPUT_FROZEN');
update public.vault_documents set stored_at = null where id = :'doc';
select t99zo.ok((select stored_at is not null from public.vault_documents where id = :'doc'), 'stored stays stored');
-- the title, folder and note can be tidied; deleting a record is not the app's to do
update public.vault_documents set title = 'Exclusive mandate', folder = 'agency_forms' where id = :'doc';
select t99zo.expect_error(format($$delete from public.vault_documents where id = %L$$, :'doc'), '42501');
select t99zo.ok((select count(*) = 1 from public.vault_documents where id = :'doc'), 'the app cannot delete a record');

-- ===========================================================================
-- Opening: logged first, and only then may a link be signed
-- ===========================================================================
select t99zo.ok((select count(*) = 0 from storage.objects where name = :'path'), 'no read without a logged opening');
select t99zo.ok(public.vault_open(:'doc') = :'path', 'opening hands back the path');
select t99zo.ok((select count(*) = 1 from public.vault_reads where document_id = :'doc'), 'the opening is logged');
select t99zo.ok((select count(*) = 1 from storage.objects where name = :'path'), 'after a logged opening the file can be signed');
select t99zo.expect_error(format($$insert into public.vault_reads (org_id, document_id, user_id) values (%L, %L, %L)$$, :'vault', :'doc', :'owner'), '42501');
select t99zo.expect_error('delete from public.vault_reads', '42501');
select t99zo.ok((select count(*) = 1 from public.vault_reads where document_id = :'doc'), 'the read log cannot be wiped');

-- ===========================================================================
-- Password-only sessions and other people get nothing
-- ===========================================================================
select set_config('request.jwt.claims', '{"aal":"aal1"}', false);
select t99zo.ok((select count(*) = 0 from public.vault_documents) and (select count(*) = 0 from public.vault_reads)
                and (select count(*) = 0 from storage.objects), 'a password-only session sees nothing');
select t99zo.expect_error(format($$select public.vault_open(%L)$$, :'doc'), 'TEBOS_PERMISSION_DENIED');
select set_config('request.jwt.claims', '{"aal":"aal2"}', false);
select set_config('request.jwt.claim.sub', :'other', false);
select t99zo.ok((select count(*) = 0 from public.vault_documents) and (select count(*) = 0 from storage.objects), 'another person sees nothing');
select t99zo.expect_error(format($$select public.vault_open(%L)$$, :'doc'), 'TEBOS_PERMISSION_DENIED');
select set_config('request.jwt.claim.sub', :'owner', false);
select t99zo.ok(not exists (select 1 from public.audit_events where entity_type = 'vault_documents' and coalesce(after::text, '') like '%Exclusive%'), 'the trail is redacted');

reset role;
