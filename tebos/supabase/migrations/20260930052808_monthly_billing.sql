-- Monthly billing after the first payment (src/domain/billing.ts).
--
--   * Every onboarded client has a billing account. Small-business plans are
--     active from the start, billed monthly from their first payment's date.
--     A Company-plan account waits for its fee: a platform admin sets it from
--     the agreed proposal, with a note saying which proposal.
--   * TEBOS's server issues each month's invoice on the date, emails a
--     payment link and reminds the client when it's late. It never charges a
--     card by itself: the client pays (money is tier 3). Pausing, resuming or
--     ending billing, voiding an invoice, and recording an EFT are a platform
--     admin's decisions, each with a reason.
--   * An invoice is fixed once issued, and is paid only by a confirmed
--     payment of its full amount. Payments are never edited.

insert into public.state_transitions (machine, from_state, to_state) values
  ('billing', '(initial)', 'awaiting_fee'),
  ('billing', '(initial)', 'active'),
  ('billing', 'awaiting_fee', 'active'),
  ('billing', 'awaiting_fee', 'ended'),
  ('billing', 'active', 'paused'),
  ('billing', 'active', 'ended'),
  ('billing', 'paused', 'active'),
  ('billing', 'paused', 'ended'),
  ('invoice', '(initial)', 'open'),
  ('invoice', 'open', 'paid'),
  ('invoice', 'open', 'void');

-- ---------------------------------------------------------------------------
-- Billing accounts
-- ---------------------------------------------------------------------------
create table public.billing_accounts (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid not null unique references public.opportunities (id),
  org_id          uuid not null references public.organisations (id) on delete cascade,
  plan            text not null check (plan in ('starter', 'growth', 'company', 'equity')),
  monthly_cents   integer check (monthly_cents is null or monthly_cents > 0),
  currency        text not null default 'ZAR' check (currency = 'ZAR'),
  anchor_day      smallint check (anchor_day is null or anchor_day between 1 and 31),
  next_invoice_on date,
  status          text not null,
  fee_note        text check (fee_note is null or length(fee_note) <= 1000),
  status_note     text check (status_note is null or length(status_note) <= 1000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (status <> 'active' or (monthly_cents is not null and next_invoice_on is not null and anchor_day is not null))
);

create function tebos_private.guard_billing_account() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tebos_private.is_client() then
    if tg_op <> 'UPDATE' then
      raise exception 'billing accounts are opened by TEBOS when a client is onboarded'
        using errcode = '42501', hint = 'TEBOS_SERVER_ONLY';
    end if;
    if (new.opportunity_id, new.org_id, new.plan, new.currency, new.created_at)
       is distinct from (old.opportunity_id, old.org_id, old.plan, old.currency, old.created_at) then
      raise exception 'a billing account belongs to one client' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
    end if;
    -- a fee set by a person says where it comes from (the agreed proposal)
    if new.monthly_cents is distinct from old.monthly_cents
       and (coalesce(length(trim(new.fee_note)), 0) = 0 or new.fee_note is not distinct from old.fee_note) then
      raise exception 'say where the new fee comes from (e.g. the proposal accepted on a date)'
        using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    if new.status is distinct from old.status
       and (coalesce(length(trim(new.status_note)), 0) = 0 or new.status_note is not distinct from old.status_note) then
      raise exception 'say why billing is %', new.status using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    if new.next_invoice_on is distinct from old.next_invoice_on then
      if new.next_invoice_on < current_date then
        raise exception 'the next invoice date can''t be in the past' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
      end if;
      new.anchor_day := extract(day from new.next_invoice_on);
    end if;
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end $$;

create trigger guard_status before insert or update on public.billing_accounts
  for each row execute function tebos_private.guard_status('billing');
create trigger guard_billing_account before insert or update or delete on public.billing_accounts
  for each row execute function tebos_private.guard_billing_account();

-- ---------------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------------
create sequence tebos_private.invoice_seq;

create table public.invoices (
  id                 uuid primary key default gen_random_uuid(),
  number             text not null unique,
  billing_account_id uuid not null references public.billing_accounts (id),
  opportunity_id     uuid not null references public.opportunities (id),
  org_id             uuid not null references public.organisations (id) on delete cascade,
  period_start       date not null,
  period_end         date not null,
  amount_cents       integer not null check (amount_cents > 0),
  currency           text not null default 'ZAR' check (currency = 'ZAR'),
  status             text not null default 'open',
  issued_on          date not null default current_date,
  due_on             date not null,
  paid_at            timestamptz,
  payment_url        text,
  payment_reference  text unique,
  void_reason        text check (void_reason is null or length(void_reason) <= 1000),
  created_at         timestamptz not null default now(),
  check (period_end >= period_start),
  check (due_on >= issued_on),
  check ((status = 'paid') = (paid_at is not null)),
  check (status <> 'void' or coalesce(length(trim(void_reason)), 0) > 0),
  unique (billing_account_id, period_start)
);
create index invoices_open_idx on public.invoices (due_on) where status = 'open';

create function tebos_private.guard_invoice() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'invoices are never deleted; void one with a reason' using errcode = 'P0001', hint = 'TEBOS_EVIDENCE_IMMUTABLE';
  end if;
  if tg_op = 'INSERT' then
    if tebos_private.is_client() then
      raise exception 'invoices are issued by TEBOS''s server' using errcode = '42501', hint = 'TEBOS_SERVER_ONLY';
    end if;
    new.number := 'TEBOS-' || to_char(new.issued_on, 'YYYY') || '-' || lpad(nextval('tebos_private.invoice_seq')::text, 4, '0');
    return new;
  end if;
  -- what was billed never changes
  if (new.number, new.billing_account_id, new.opportunity_id, new.org_id, new.period_start, new.period_end,
      new.amount_cents, new.currency, new.issued_on, new.due_on, new.created_at)
     is distinct from
     (old.number, old.billing_account_id, old.opportunity_id, old.org_id, old.period_start, old.period_end,
      old.amount_cents, old.currency, old.issued_on, old.due_on, old.created_at) then
    raise exception 'an issued invoice is never rewritten; void it and issue a new one'
      using errcode = 'P0001', hint = 'TEBOS_EVIDENCE_IMMUTABLE';
  end if;
  -- the payment link is set once, by the server
  if (new.payment_url, new.payment_reference) is distinct from (old.payment_url, old.payment_reference)
     and (tebos_private.is_client() or old.payment_reference is not null) then
    raise exception 'the payment link is set once, by TEBOS''s server' using errcode = '42501', hint = 'TEBOS_SERVER_ONLY';
  end if;
  if new.status is distinct from old.status then
    if new.status = 'paid' then
      if not exists (
        select 1 from public.payments p where p.invoice_id = new.id and p.status = 'success' and p.amount_cents >= new.amount_cents
      ) then
        raise exception 'an invoice is paid only on a confirmed payment of its full amount'
          using errcode = 'P0001', hint = 'TEBOS_PAYMENT_UNPROVEN';
      end if;
    elsif new.status = 'void' and tebos_private.is_client() and not tebos_private.is_platform_admin() then
      raise exception 'only a platform admin voids an invoice' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
    end if;
  elsif new.paid_at is distinct from old.paid_at or new.void_reason is distinct from old.void_reason then
    raise exception 'recorded with the status change only' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  return new;
end $$;

create trigger guard_status before insert or update on public.invoices
  for each row execute function tebos_private.guard_status('invoice');
create trigger guard_invoice before insert or update or delete on public.invoices
  for each row execute function tebos_private.guard_invoice();

-- ---------------------------------------------------------------------------
-- Payments against invoices: a confirmed payment of the full amount marks
-- the invoice paid, whichever way it arrived (Paystack, or an EFT an admin
-- recorded).
-- ---------------------------------------------------------------------------
alter table public.payments add column invoice_id uuid references public.invoices (id);
create unique index payments_one_success_per_invoice_idx on public.payments (invoice_id) where invoice_id is not null and status = 'success';

create function tebos_private.payment_settles_invoice() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.invoices;
begin
  if new.invoice_id is null then
    return null;
  end if;
  select * into v_inv from public.invoices where id = new.invoice_id;
  if v_inv.opportunity_id is distinct from new.opportunity_id then
    raise exception 'a payment settles an invoice of the same client' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  if new.status = 'success' and v_inv.status = 'open' and new.amount_cents >= v_inv.amount_cents then
    update public.invoices set status = 'paid', paid_at = new.paid_at where id = v_inv.id;
  end if;
  return null;
end $$;

create trigger settles_invoice after insert on public.payments
  for each row execute function tebos_private.payment_settles_invoice();

grant insert (invoice_id) on public.payments to authenticated;
grant select (invoice_id) on public.payments to authenticated;

-- ---------------------------------------------------------------------------
-- Invoice emails go through the same outbox: one of each kind per invoice
-- ---------------------------------------------------------------------------
alter table public.outbox_emails add column invoice_id uuid references public.invoices (id);
alter table public.outbox_emails drop constraint outbox_emails_opportunity_id_kind_key;
create unique index outbox_emails_one_per_kind_idx on public.outbox_emails (opportunity_id, kind) where invoice_id is null;
create unique index outbox_emails_one_per_invoice_kind_idx on public.outbox_emails (invoice_id, kind) where invoice_id is not null;
alter table public.outbox_emails drop constraint outbox_emails_kind_check,
  add constraint outbox_emails_kind_check check (kind in ('payment_link', 'contract', 'invitation', 'invoice', 'invoice_reminder_1', 'invoice_reminder_2'));
grant select (invoice_id) on public.outbox_emails to authenticated;

-- ---------------------------------------------------------------------------
-- Access: platform admins manage billing; the client's team and their
-- maintainer read it. Audited throughout.
-- ---------------------------------------------------------------------------
alter table public.billing_accounts enable row level security;
revoke all on public.billing_accounts from anon, authenticated;
create policy billing_read on public.billing_accounts for select to authenticated
  using (tebos_private.maintains(opportunity_id) or tebos_private.is_member(org_id));
create policy admin_manage on public.billing_accounts for update to authenticated
  using (tebos_private.is_platform_admin()) with check (tebos_private.is_platform_admin());
grant select on public.billing_accounts to authenticated;
grant update (monthly_cents, next_invoice_on, status, fee_note, status_note) on public.billing_accounts to authenticated;
grant all on public.billing_accounts to service_role;

alter table public.invoices enable row level security;
revoke all on public.invoices from anon, authenticated;
create policy invoice_read on public.invoices for select to authenticated
  using (tebos_private.maintains(opportunity_id) or tebos_private.is_member(org_id));
create policy admin_void on public.invoices for update to authenticated
  using (tebos_private.is_platform_admin()) with check (tebos_private.is_platform_admin() and status = 'void');
grant select on public.invoices to authenticated;
grant update (status, void_reason) on public.invoices to authenticated;
grant all on public.invoices to service_role;

create trigger audit after insert or update or delete on public.billing_accounts
  for each row execute function tebos_private.audit_row();
create trigger audit after insert or update or delete on public.invoices
  for each row execute function tebos_private.audit_row();

-- ---------------------------------------------------------------------------
-- TEBOS's own board: recurring revenue and what's owed
-- ---------------------------------------------------------------------------
create or replace function tebos_private.company_snapshot() returns jsonb
language sql stable security definer set search_path = '' as $$
  select tebos_private.company_snapshot_base()
    || jsonb_build_object('attention', jsonb_build_object(
      'self_checks_7_days', (select count(*) from public.self_check_results where created_at > now() - interval '7 days'),
      'self_checks_30_days', (select count(*) from public.self_check_results where created_at > now() - interval '30 days'),
      'average_score_30_days', coalesce((select round(avg(score))::int from public.self_check_results where created_at > now() - interval '30 days'), 0)
    ))
    || jsonb_build_object('billing', jsonb_build_object(
      'monthly_recurring_zar', coalesce((select sum(monthly_cents) from public.billing_accounts where status = 'active'), 0) / 100,
      'accounts_active', (select count(*) from public.billing_accounts where status = 'active'),
      'accounts_awaiting_fee', (select count(*) from public.billing_accounts where status = 'awaiting_fee'),
      'accounts_paused', (select count(*) from public.billing_accounts where status = 'paused'),
      'invoices_open', (select count(*) from public.invoices where status = 'open'),
      'invoices_overdue', (select count(*) from public.invoices where status = 'open' and due_on < current_date),
      'overdue_zar', coalesce((select sum(amount_cents) from public.invoices where status = 'open' and due_on < current_date), 0) / 100,
      'oldest_overdue_days', coalesce((select current_date - min(due_on) from public.invoices where status = 'open' and due_on < current_date), 0)
    ))
$$;
