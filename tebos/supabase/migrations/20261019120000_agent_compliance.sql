-- The agent's office, slice 2 (founder, 19 Oct 2026): documents and compliance per deal, and the path to the
-- Fidelity Fund Certificate (FFC). On the founder's condition: "no tampering with actual legal documents".
-- So nothing here stores, edits, signs or sends a document. It only tracks, per deal, which documents exist,
-- where the agency keeps them (PropCtrl, Doxit, the agency file), and what is still missing or due.
--
-- What a deal needs comes from the agency's own papers, never from memory (mirrored in src/domain/agent.ts):
--   * Pelser Real Estate's "Property Check list (Office use)": FICA for purchasers and sellers, the property's
--     certificates, the agent's requirements, commission and file closing;
--   * the agency's New Agent Welcome package: while the agent is a candidate, sole mandates and offers to
--     purchase are co-signed by a full-status practitioner;
--   * the founder (19 Oct): mandate, condition disclosure, FICA, offer to purchase or lease, proof of payment.
-- The FFC path holds only steps that name their source; the PPRA application form (section 13) gives the
-- candidate's registration steps. Anything else is added by the founder with its source.
--
-- Rules: a document marked received or checked has its date; checked says where it is kept; not applicable
-- says why; a step marked done has its date and where its proof is kept. No contact details, ID numbers or
-- secrets in any text. Only in the private organisation, for its owner, after two-step sign-in. Audited
-- (redacted), like the rest of the office.

create table public.agent_deal_items (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  listing_id   uuid not null,
  item         text not null check (item in (
                 'mandate_signed', 'mandate_cosigned', 'condition_report', 'otp_or_lease_signed', 'otp_cosigned', 'proof_of_payment', 'property24_update',
                 'buyer_nda', 'buyer_identity', 'buyer_proof_of_address', 'buyer_marriage_certificate', 'buyer_entity_documents', 'buyer_resolution',
                 'buyer_vat', 'buyer_income_tax', 'buyer_sanctions_search', 'buyer_risk_assessment_popia',
                 'seller_entity_documents', 'seller_resolution', 'seller_vat', 'seller_proof_of_address', 'seller_marriage_certificate',
                 'seller_income_tax', 'seller_sanctions_search', 'seller_risk_assessment_popia',
                 'electrical_coc', 'electric_fence_certificate', 'gas_certificate',
                 'bond_approved', 'suspensive_conditions_met', 'sent_to_transfer_attorney',
                 'agent_ffc', 'agent_sars_confirmation', 'agent_bank_confirmation',
                 'commission_invoice', 'commission_paid', 'file_closed')),
  status       text not null default 'missing' check (status in ('missing', 'requested', 'received', 'checked', 'not_applicable')),
  due_on       date,
  received_on  date,
  kept_in      text check (kept_in is null or length(kept_in) <= 160),
  reason       text check (reason is null or length(reason) <= 300),
  note         text check (note is null or length(note) <= 500),
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (listing_id, item),
  foreign key (listing_id, org_id) references public.agent_listings (id, org_id) on delete cascade,
  check (status not in ('received', 'checked') or received_on is not null),
  check (status <> 'checked' or length(trim(coalesce(kept_in, ''))) > 0),
  check (status <> 'not_applicable' or length(trim(coalesce(reason, ''))) > 0)
);
create index agent_deal_items_listing_idx on public.agent_deal_items (listing_id);

create table public.agent_ffc_steps (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organisations (id) on delete cascade,
  position     integer not null default 0,
  title        text not null check (length(trim(title)) between 1 and 160),
  source       text not null check (length(trim(source)) between 3 and 300),
  status       text not null default 'to_do' check (status in ('to_do', 'in_progress', 'done')),
  due_on       date,
  done_on      date,
  evidence     text check (evidence is null or length(evidence) <= 300),
  note         text check (note is null or length(note) <= 500),
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (status <> 'done' or (done_on is not null and length(trim(coalesce(evidence, ''))) > 0))
);
create index agent_ffc_steps_org_idx on public.agent_ffc_steps (org_id, position);

create function tebos_private.guard_agent_compliance() returns trigger
language plpgsql set search_path = '' as $$
declare
  v jsonb := to_jsonb(new);
  k text;
begin
  if not tebos_private.is_private_org(new.org_id) then
    raise exception 'the agent''s office lives only in a private organisation' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
  end if;
  foreach k in array array['kept_in', 'reason', 'note', 'title', 'source', 'evidence'] loop
    if tebos_private.looks_secret(v ->> k) then
      raise exception 'this looks like a password, key or token; secrets are never stored here'
        using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    if tebos_private.looks_personal(v ->> k) then
      raise exception 'no contact details or ID numbers here until the agency allows it: say where the document is kept instead'
        using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
  end loop;
  if tg_op = 'INSERT' then
    if tebos_private.is_client() then
      new.created_by := auth.uid();
    end if;
  else
    new.created_by := old.created_by;
    if tg_table_name = 'agent_deal_items' and ((v ->> 'item') is distinct from (to_jsonb(old) ->> 'item')
                                                or (v ->> 'listing_id') is distinct from (to_jsonb(old) ->> 'listing_id')) then
      raise exception 'a checklist entry belongs to its deal and document' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
    end if;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['agent_deal_items', 'agent_ffc_steps'] loop
    execute format('create trigger guard_agent_compliance before insert or update on public.%I for each row execute function tebos_private.guard_agent_compliance()', t);
    execute format('create trigger touch before update on public.%I for each row execute function tebos_private.touch_updated_at()', t);
    execute format('create trigger freeze_tenant_keys before update on public.%I for each row execute function tebos_private.freeze_tenant_keys()', t);
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function tebos_private.audit_row_redacted()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format($p$create policy owner_all on public.%I for all to authenticated
                      using (tebos_private.has_role(org_id, array['org_admin']) and tebos_private.two_step())
                      with check (tebos_private.has_role(org_id, array['org_admin']) and tebos_private.two_step())$p$, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
