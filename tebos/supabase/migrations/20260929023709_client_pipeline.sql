-- The client pipeline: from a pricing-page enquiry to an onboarded, maintained
-- client, with each step guarded.
--
--   new -> screened -> approved -> awaiting_payment -> paid -> contract_sent -> contracted -> onboarded
--                  \-> declined          (and any open step -> cancelled)
--
--   * TEBOS's staff (platform admins, and people given the sales role) see
--     the pipeline and make the human decisions: approve, decline, cancel. An
--     enquiry that screening flagged (possible competitor, free email, …)
--     can be approved only with a written reason.
--   * Everything else is TEBOS's server's to record, and only on proof:
--     "paid" needs a payment the provider confirmed (or an EFT a platform
--     admin recorded with its reference); "contract_sent" needs a contract
--     rendered from a template a lawyer approved; "contracted" needs the
--     client's recorded acceptance; "onboarded" needs the client's
--     organisation.
--   * A client's organisation exists only after payment and a signed
--     contract, so nothing costly (calls, reviews) can happen before then.
--   * Payments and accepted contracts are never edited.
--   * Equity-partnership applications stop at "approved": they need a
--     valuation and a shareholder agreement, which this pipeline doesn't do.

-- ---------------------------------------------------------------------------
-- TEBOS's own staff
-- ---------------------------------------------------------------------------
create table public.platform_staff (
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null check (role in ('sales', 'maintainer')),
  added_by   uuid references auth.users (id),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create function tebos_private.is_staff(p_roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select tebos_private.is_platform_admin()
      or exists (select 1 from public.platform_staff where user_id = auth.uid() and role = any (p_roles))
$$;

-- Whether someone else holds a staff role (checked by guards, which run with the caller's rights).
create function tebos_private.user_has_staff_role(p_user uuid, p_role text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = p_user)
      or exists (select 1 from public.platform_staff where user_id = p_user and role = p_role)
$$;

alter table public.platform_staff enable row level security;
revoke all on public.platform_staff from anon, authenticated;
create policy staff_read on public.platform_staff for select to authenticated
  using (user_id = auth.uid() or tebos_private.is_platform_admin());
create policy admin_write on public.platform_staff for all to authenticated
  using (tebos_private.is_platform_admin()) with check (tebos_private.is_platform_admin());
grant select, insert, delete on public.platform_staff to authenticated;
grant all on public.platform_staff to service_role;
create trigger audit after insert or update or delete on public.platform_staff
  for each row execute function tebos_private.audit_row();

-- ---------------------------------------------------------------------------
-- Opportunities
-- ---------------------------------------------------------------------------
insert into public.state_transitions (machine, from_state, to_state) values
  ('opportunity', '(initial)', 'new'),
  ('opportunity', 'new', 'screened'),
  ('opportunity', 'new', 'cancelled'),
  ('opportunity', 'screened', 'approved'),
  ('opportunity', 'screened', 'declined'),
  ('opportunity', 'screened', 'cancelled'),
  ('opportunity', 'approved', 'awaiting_payment'),
  ('opportunity', 'approved', 'cancelled'),
  ('opportunity', 'awaiting_payment', 'paid'),
  ('opportunity', 'awaiting_payment', 'cancelled'),
  ('opportunity', 'paid', 'contract_sent'),
  ('opportunity', 'contract_sent', 'contracted'),
  ('opportunity', 'contract_sent', 'cancelled'),
  ('opportunity', 'contracted', 'onboarded');

create table public.opportunities (
  id               uuid primary key default gen_random_uuid(),
  enquiry_id       uuid not null unique references public.enquiries (id),
  plan             text not null check (plan in ('starter', 'growth', 'equity')),
  contact_name     text not null,
  business         text not null,
  email            text not null,
  phone            text,
  website          text,
  message          text,
  status           text not null default 'new',
  -- written by the server
  screening        jsonb not null default '{}'::jsonb check (jsonb_typeof(screening) = 'object'),
  screened_at      timestamptz,
  amount_cents     integer check (amount_cents is null or amount_cents > 0),
  currency         text not null default 'ZAR' check (currency = 'ZAR'),
  payment_url      text,
  payment_reference text unique,
  org_id           uuid references public.organisations (id),
  -- written by staff
  decision_note    text check (decision_note is null or length(decision_note) <= 2000),
  decided_by       uuid references auth.users (id),
  decided_at       timestamptz,
  maintainer_id    uuid references auth.users (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (status not in ('declined', 'cancelled') or coalesce(length(trim(decision_note)), 0) > 0),
  check (status not in ('awaiting_payment', 'paid', 'contract_sent', 'contracted', 'onboarded') or plan <> 'equity')
);
create index opportunities_status_idx on public.opportunities (status, created_at);

-- Payments: what the provider confirmed (or an EFT a platform admin recorded). Never edited.
create table public.payments (
  id             uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities (id),
  provider       text not null check (provider in ('paystack', 'manual')),
  reference      text not null check (length(trim(reference)) between 1 and 200),
  amount_cents   integer not null check (amount_cents > 0),
  currency       text not null default 'ZAR' check (currency = 'ZAR'),
  status         text not null check (status in ('success', 'failed')),
  paid_at        timestamptz,
  note           text check (note is null or length(note) <= 1000),
  raw            jsonb,
  recorded_by    uuid references auth.users (id),
  created_at     timestamptz not null default now(),
  unique (provider, reference),
  check (status <> 'success' or paid_at is not null),
  check (provider <> 'manual' or (recorded_by is not null and coalesce(length(trim(note)), 0) > 0))
);

-- Contract templates: a contract can only be made from a template a lawyer approved.
create table public.contract_templates (
  key            text not null check (key ~ '^[a-z][a-z0-9_-]{1,40}$'),
  version        integer not null check (version > 0),
  plan           text not null check (plan in ('starter', 'growth', 'equity')),
  title          text not null check (length(trim(title)) between 1 and 200),
  body           text not null check (length(body) between 1 and 60000),
  status         text not null default 'draft' check (status in ('draft', 'approved', 'retired')),
  approval_note  text check (approval_note is null or length(approval_note) <= 1000),
  approved_by    uuid references auth.users (id),
  approved_at    timestamptz,
  created_at     timestamptz not null default now(),
  primary key (key, version),
  check (status <> 'approved' or (approved_by is not null and approved_at is not null and coalesce(length(trim(approval_note)), 0) > 0))
);
create unique index contract_templates_one_approved_idx on public.contract_templates (plan) where status = 'approved';

-- Contracts: rendered from an approved template, sent with a one-time link,
-- accepted by the client. The text is fixed once sent; acceptance is final.
create table public.contracts (
  id                uuid primary key default gen_random_uuid(),
  opportunity_id    uuid not null unique references public.opportunities (id),
  template_key      text not null,
  template_version  integer not null,
  title             text not null,
  body              text not null,
  body_hash         text not null,
  token_hash        text not null unique,
  status            text not null default 'sent' check (status in ('sent', 'accepted', 'void')),
  sent_at           timestamptz not null default now(),
  expires_at        timestamptz not null default now() + interval '30 days',
  accepted_at       timestamptz,
  accepted_name     text check (accepted_name is null or length(trim(accepted_name)) between 2 and 120),
  accepted_ip       text,
  accepted_agent    text,
  created_at        timestamptz not null default now(),
  foreign key (template_key, template_version) references public.contract_templates (key, version),
  check (body_hash = encode(sha256(convert_to(body, 'UTF8')), 'hex')),
  check ((status = 'accepted') = (accepted_at is not null and accepted_name is not null))
);

-- The pipeline's emails to the client (payment link, contract link,
-- invitation). Each is recorded in the same transaction as the step it
-- belongs to, then sent with retries, so a link is never lost to a failed
-- send. The body holds a one-time link: only the server reads it.
create table public.outbox_emails (
  id                 uuid primary key default gen_random_uuid(),
  opportunity_id     uuid not null references public.opportunities (id),
  kind               text not null check (kind in ('payment_link', 'contract', 'invitation')),
  to_email           text not null,
  subject            text not null check (length(subject) <= 200),
  body               text not null check (length(body) <= 20000),
  created_at         timestamptz not null default now(),
  attempts           integer not null default 0,
  last_try           timestamptz,
  sent_at            timestamptz,
  provider_reference text,
  error              text,
  unique (opportunity_id, kind),
  check (sent_at is null or provider_reference is not null)
);
create index outbox_emails_due_idx on public.outbox_emails (created_at) where sent_at is null;

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------
create function tebos_private.guard_opportunity() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_flagged boolean;
begin
  if tebos_private.is_client() then
    if tg_op = 'INSERT' then
      raise exception 'opportunities are created by TEBOS from enquiries' using errcode = '42501', hint = 'TEBOS_SERVER_ONLY';
    end if;
    -- staff decide; everything else is the server's
    if (new.enquiry_id, new.plan, new.contact_name, new.business, new.email, new.phone, new.website, new.message,
        new.screening, new.screened_at, new.amount_cents, new.payment_url, new.payment_reference, new.org_id, new.created_at)
       is distinct from
       (old.enquiry_id, old.plan, old.contact_name, old.business, old.email, old.phone, old.website, old.message,
        old.screening, old.screened_at, old.amount_cents, old.payment_url, old.payment_reference, old.org_id, old.created_at) then
      raise exception 'only TEBOS''s server records screening, payment, contract and onboarding details'
        using errcode = '42501', hint = 'TEBOS_SERVER_ONLY';
    end if;
    if new.status is distinct from old.status then
      if new.status not in ('approved', 'declined', 'cancelled') then
        raise exception 'payment, contract and onboarding steps are recorded by TEBOS''s server on proof'
          using errcode = '42501', hint = 'TEBOS_SERVER_ONLY';
      end if;
      new.decided_by := auth.uid();
      new.decided_at := now();
    elsif new.decided_by is distinct from old.decided_by or new.decided_at is distinct from old.decided_at then
      raise exception 'who decided is recorded by TEBOS' using errcode = '42501', hint = 'TEBOS_SERVER_ONLY';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'approved' then
      v_flagged := jsonb_array_length(coalesce(new.screening -> 'flags', '[]'::jsonb)) > 0;
      if v_flagged and coalesce(length(trim(new.decision_note)), 0) = 0 then
        raise exception 'screening flagged this enquiry; say why it is approved anyway'
          using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
      end if;
    elsif new.status = 'awaiting_payment' then
      if new.payment_url is null or new.payment_reference is null or new.amount_cents is null then
        raise exception 'an opportunity awaits payment only once its payment link exists'
          using errcode = 'P0001', hint = 'TEBOS_PAYMENT_UNPROVEN';
      end if;
    elsif new.status = 'paid' then
      if not exists (
        select 1 from public.payments p
         where p.opportunity_id = new.id and p.status = 'success' and p.amount_cents >= new.amount_cents
      ) then
        raise exception 'an opportunity is paid only on a confirmed payment of the full amount'
          using errcode = 'P0001', hint = 'TEBOS_PAYMENT_UNPROVEN';
      end if;
    elsif new.status = 'contract_sent' then
      if not exists (select 1 from public.contracts c where c.opportunity_id = new.id and c.status = 'sent') then
        raise exception 'no contract has been sent' using errcode = 'P0001', hint = 'TEBOS_CONTRACT_UNSIGNED';
      end if;
    elsif new.status = 'contracted' then
      if not exists (select 1 from public.contracts c where c.opportunity_id = new.id and c.status = 'accepted') then
        raise exception 'the client has not accepted the contract' using errcode = 'P0001', hint = 'TEBOS_CONTRACT_UNSIGNED';
      end if;
    elsif new.status = 'onboarded' then
      if new.org_id is null then
        raise exception 'a client is onboarded once their organisation exists' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
      end if;
    end if;
  end if;

  if new.maintainer_id is not null and (tg_op = 'INSERT' or new.maintainer_id is distinct from old.maintainer_id)
     and not tebos_private.user_has_staff_role(new.maintainer_id, 'maintainer') then
    raise exception 'a maintainer must be TEBOS staff with the maintainer role' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  return new;
end $$;

create trigger guard_status before insert or update on public.opportunities
  for each row execute function tebos_private.guard_status('opportunity');
create trigger guard_opportunity before insert or update on public.opportunities
  for each row execute function tebos_private.guard_opportunity();
create trigger touch_updated_at before update on public.opportunities
  for each row execute function tebos_private.touch_updated_at();

create function tebos_private.guard_payment() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' or tg_op = 'DELETE' then
    raise exception 'payments are never edited or deleted' using errcode = 'P0001', hint = 'TEBOS_EVIDENCE_IMMUTABLE';
  end if;
  if tebos_private.is_client() then
    -- people record only EFTs, as platform admins, in their own name
    if new.provider <> 'manual' or not tebos_private.is_platform_admin() then
      raise exception 'provider payments are recorded by TEBOS''s server from the provider''s signed confirmation'
        using errcode = '42501', hint = 'TEBOS_SERVER_ONLY';
    end if;
    new.recorded_by := auth.uid();
    new.raw := null;
  end if;
  return new;
end $$;

create trigger guard_payment before insert or update or delete on public.payments
  for each row execute function tebos_private.guard_payment();

create function tebos_private.guard_contract_template() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if tebos_private.is_client() and new.status <> 'draft' then
      raise exception 'a template starts as a draft; approve it once a lawyer has' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if old.status <> 'draft' and (new.title, new.body, new.plan) is distinct from (old.title, old.body, old.plan) then
      raise exception 'an approved template is fixed; write a new version' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
    end if;
    if old.status = 'retired' and new.status <> 'retired' then
      raise exception 'a retired template stays retired' using errcode = 'P0001', hint = 'TEBOS_ILLEGAL_TRANSITION';
    end if;
    if new.status = 'approved' and old.status = 'draft' and tebos_private.is_client() then
      new.approved_by := auth.uid();
      new.approved_at := now();
    end if;
  end if;
  return new;
end $$;

create trigger guard_contract_template before insert or update on public.contract_templates
  for each row execute function tebos_private.guard_contract_template();

create function tebos_private.guard_contract() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'contracts are never deleted' using errcode = 'P0001', hint = 'TEBOS_EVIDENCE_IMMUTABLE';
  end if;
  if tg_op = 'INSERT' then
    if not exists (
      select 1 from public.contract_templates t
       where t.key = new.template_key and t.version = new.template_version and t.status = 'approved'
    ) then
      raise exception 'a contract can only be made from a template a lawyer approved'
        using errcode = 'P0001', hint = 'TEBOS_CONTRACT_UNAPPROVED';
    end if;
    return new;
  end if;
  if (new.opportunity_id, new.template_key, new.template_version, new.title, new.body, new.body_hash, new.token_hash, new.sent_at, new.expires_at)
     is distinct from
     (old.opportunity_id, old.template_key, old.template_version, old.title, old.body, old.body_hash, old.token_hash, old.sent_at, old.expires_at) then
    raise exception 'a sent contract is never rewritten; void it and send a new one'
      using errcode = 'P0001', hint = 'TEBOS_EVIDENCE_IMMUTABLE';
  end if;
  if old.status = 'accepted' then
    raise exception 'an accepted contract is final' using errcode = 'P0001', hint = 'TEBOS_EVIDENCE_IMMUTABLE';
  end if;
  return new;
end $$;

create trigger guard_contract before insert or update or delete on public.contracts
  for each row execute function tebos_private.guard_contract();

-- ---------------------------------------------------------------------------
-- The client's side: read and accept a contract with the one-time link.
-- No account is needed; the token in the link is the key. The time, name,
-- network address and browser are recorded with the exact text accepted.
-- ---------------------------------------------------------------------------
create function public.contract_for_token(p_token text)
returns table (title text, body text, body_hash text, business text, status text, expires_at timestamptz, accepted_at timestamptz, accepted_name text)
language sql stable security definer set search_path = '' as $$
  select c.title, c.body, c.body_hash, o.business, c.status, c.expires_at, c.accepted_at, c.accepted_name
    from public.contracts c join public.opportunities o on o.id = c.opportunity_id
   where c.token_hash = tebos_private.hash_token(p_token) and c.status <> 'void'
$$;

create function public.accept_contract(p_token text, p_name text, p_body_hash text) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_c public.contracts;
  v_headers json := nullif(current_setting('request.headers', true), '')::json;
  v_at timestamptz := now();
begin
  select * into v_c from public.contracts where token_hash = tebos_private.hash_token(p_token) for update;
  if v_c.id is null or v_c.status = 'void' then
    raise exception 'this contract link is not valid' using errcode = 'P0001', hint = 'TEBOS_CONTRACT_UNSIGNED';
  end if;
  if v_c.status = 'accepted' then
    return v_c.accepted_at;
  end if;
  if v_c.expires_at <= now() then
    raise exception 'this contract link has expired; ask TEBOS for a new one' using errcode = 'P0001', hint = 'TEBOS_CONTRACT_UNSIGNED';
  end if;
  if coalesce(length(trim(p_name)), 0) < 2 then
    raise exception 'type your full name to accept' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  -- the client accepts the exact text they were shown
  if p_body_hash is distinct from v_c.body_hash then
    raise exception 'the contract shown is not the contract on record; reload it' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  update public.contracts
     set status = 'accepted', accepted_at = v_at, accepted_name = trim(p_name),
         accepted_ip = left(coalesce(v_headers ->> 'x-forwarded-for', v_headers ->> 'x-real-ip'), 200),
         accepted_agent = left(v_headers ->> 'user-agent', 400)
   where id = v_c.id;
  update public.opportunities set status = 'contracted' where id = v_c.opportunity_id and status = 'contract_sent';
  return v_at;
end $$;

revoke execute on function public.contract_for_token(text) from public;
revoke execute on function public.accept_contract(text, text, text) from public;
grant execute on function public.contract_for_token(text) to anon, authenticated;
grant execute on function public.accept_contract(text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Access: staff read the pipeline and decide; maintainers see their clients;
-- nobody else sees any of it. Audited throughout.
-- ---------------------------------------------------------------------------
alter table public.opportunities enable row level security;
revoke all on public.opportunities from anon, authenticated;
create policy staff_read on public.opportunities for select to authenticated
  using (tebos_private.is_staff(array['sales']) or maintainer_id = auth.uid());
create policy staff_decide on public.opportunities for update to authenticated
  using (tebos_private.is_staff(array['sales'])) with check (tebos_private.is_staff(array['sales']));
grant select on public.opportunities to authenticated;
grant update (status, decision_note, maintainer_id) on public.opportunities to authenticated;
grant all on public.opportunities to service_role;

alter table public.payments enable row level security;
revoke all on public.payments from anon, authenticated;
create policy staff_read on public.payments for select to authenticated using (tebos_private.is_staff(array['sales']));
create policy admin_record on public.payments for insert to authenticated with check (tebos_private.is_platform_admin());
grant select (id, opportunity_id, provider, reference, amount_cents, currency, status, paid_at, note, recorded_by, created_at)
  on public.payments to authenticated;
grant insert (opportunity_id, provider, reference, amount_cents, currency, status, paid_at, note) on public.payments to authenticated;
grant all on public.payments to service_role;

alter table public.contract_templates enable row level security;
revoke all on public.contract_templates from anon, authenticated;
create policy staff_read on public.contract_templates for select to authenticated using (tebos_private.is_staff(array['sales']));
create policy admin_write on public.contract_templates for all to authenticated
  using (tebos_private.is_platform_admin()) with check (tebos_private.is_platform_admin());
grant select, insert on public.contract_templates to authenticated;
grant update (title, body, status, approval_note) on public.contract_templates to authenticated;
grant all on public.contract_templates to service_role;

alter table public.contracts enable row level security;
revoke all on public.contracts from anon, authenticated;
create policy staff_read on public.contracts for select to authenticated using (tebos_private.is_staff(array['sales']));
-- the link token's fingerprint is never readable
grant select (id, opportunity_id, template_key, template_version, title, body, body_hash, status, sent_at, expires_at,
              accepted_at, accepted_name, accepted_ip, accepted_agent, created_at) on public.contracts to authenticated;
grant all on public.contracts to service_role;

alter table public.outbox_emails enable row level security;
revoke all on public.outbox_emails from anon, authenticated;
create policy staff_read on public.outbox_emails for select to authenticated using (tebos_private.is_staff(array['sales']));
-- staff see whether each email went out, never the link inside it (and the
-- outbox is not audited, so the link never reaches the audit trail either)
grant select (id, opportunity_id, kind, to_email, subject, created_at, attempts, last_try, sent_at, error) on public.outbox_emails to authenticated;
grant all on public.outbox_emails to service_role;

do $$
declare t text;
begin
  foreach t in array array['opportunities', 'payments', 'contract_templates', 'contracts'] loop
    execute format('create trigger audit after insert or update or delete on public.%I
                      for each row execute function tebos_private.audit_row()', t);
  end loop;
end $$;
