-- The sales team: people who sell TEBOS without depending on the founder.
--
--   * A platform admin invites a salesperson (or a maintainer) by email. The
--     link is bound to that confirmed address, like a client invitation, and
--     accepting it gives the staff role only: staff are never members of a
--     client's organisation, so they see the pipeline, not clients' data.
--   * Sales adds leads from their own outreach. A lead is an enquiry marked
--     as coming from sales and owned by the person who added it; nobody can
--     claim someone else's lead (only a platform admin reassigns one), which
--     keeps commission honest later. Everything else about a lead is the same
--     as a website enquiry: screened, decided, paid, contracted, on proof.
--   * Staff see each other's names through staff_directory(), and nothing
--     else about each other.

-- ---------------------------------------------------------------------------
-- Staff invitations
-- ---------------------------------------------------------------------------
create table public.staff_invitations (
  id          uuid primary key default gen_random_uuid(),
  email       text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role        text not null check (role in ('sales', 'maintainer')),
  token_hash  text not null unique,
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by  uuid references auth.users (id),
  accepted_by uuid references auth.users (id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  check (expires_at > created_at),
  check (status <> 'accepted' or (accepted_by is not null and accepted_at is not null))
);
create unique index staff_invitations_one_pending_idx on public.staff_invitations (email, role) where status = 'pending';

create function tebos_private.guard_staff_invitation() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.email, new.role, new.token_hash, new.invited_by, new.created_at, new.expires_at)
     is distinct from (old.email, old.role, old.token_hash, old.invited_by, old.created_at, old.expires_at) then
    raise exception 'an invitation cannot be rewritten; revoke it and invite again'
      using errcode = 'P0001', hint = 'TEBOS_INVITATION_INVALID';
  end if;
  return new;
end $$;

create trigger enforce_state_machine before insert or update of status on public.staff_invitations
  for each row execute function tebos_private.guard_status('invitation');
create trigger guard_staff_invitation before update on public.staff_invitations
  for each row execute function tebos_private.guard_staff_invitation();
create trigger audit after insert or update or delete on public.staff_invitations
  for each row execute function tebos_private.audit_row();

alter table public.staff_invitations enable row level security;
revoke all on public.staff_invitations from anon, authenticated;
create policy admin_read on public.staff_invitations for select to authenticated
  using (tebos_private.is_platform_admin());
create policy admin_revoke on public.staff_invitations for update to authenticated
  using (tebos_private.is_platform_admin()) with check (tebos_private.is_platform_admin() and status = 'revoked');
-- the token's fingerprint is never readable
grant select (id, email, role, status, invited_by, accepted_by, created_at, expires_at, accepted_at)
  on public.staff_invitations to authenticated;
grant update (status) on public.staff_invitations to authenticated;
grant all on public.staff_invitations to service_role;

-- Returns the one-time token; it is shown to the admin once and never stored.
create function public.create_staff_invitation(p_email text, p_role text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_email text := lower(trim(p_email));
begin
  if not tebos_private.is_platform_admin() then
    raise exception 'only TEBOS''s platform admins invite staff' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
  end if;
  if exists (
    select 1 from public.platform_staff s join auth.users u on u.id = s.user_id
     where lower(u.email) = v_email and s.role = p_role
  ) then
    raise exception '% already has the % role', v_email, p_role using errcode = 'P0001', hint = 'TEBOS_ALREADY_MEMBER';
  end if;
  -- an earlier pending invitation to the same address and role is replaced
  update public.staff_invitations set status = 'revoked' where email = v_email and role = p_role and status = 'pending';
  insert into public.staff_invitations (email, role, token_hash, invited_by)
    values (v_email, p_role, tebos_private.hash_token(v_token), auth.uid());
  return v_token;
end $$;

-- What the invitation page shows before sign-in: the role and the address it
-- was sent to, nothing else. Unknown, used or expired links show nothing.
create function public.staff_invitation_for_token(p_token text)
returns table (email text, role text, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select i.email, i.role, i.expires_at from public.staff_invitations i
   where i.token_hash = tebos_private.hash_token(p_token) and i.status = 'pending' and i.expires_at > now()
$$;

-- Accept with the token from the link. The signed-in user's confirmed email
-- must be the invited address.
create function public.accept_staff_invitation(p_token text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.staff_invitations;
  v_email text;
  v_confirmed timestamptz;
begin
  if auth.uid() is null then
    raise exception 'sign in to accept an invitation' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
  end if;
  select * into v_inv from public.staff_invitations where token_hash = tebos_private.hash_token(p_token) for update;
  if v_inv.id is null or v_inv.status <> 'pending' then
    raise exception 'this invitation is not valid' using errcode = 'P0001', hint = 'TEBOS_INVITATION_INVALID';
  end if;
  if v_inv.expires_at <= now() then
    update public.staff_invitations set status = 'expired' where id = v_inv.id;
    return null; -- the expiry is recorded; the caller is told the invitation is no longer valid
  end if;
  select lower(email), email_confirmed_at into v_email, v_confirmed from auth.users where id = auth.uid();
  if v_email is distinct from v_inv.email or v_confirmed is null then
    raise exception 'this invitation was sent to a different, or unconfirmed, email address'
      using errcode = '42501', hint = 'TEBOS_INVITATION_EMAIL';
  end if;
  insert into public.platform_staff (user_id, role, added_by) values (auth.uid(), v_inv.role, v_inv.invited_by)
    on conflict do nothing;
  update public.staff_invitations set status = 'accepted', accepted_by = auth.uid(), accepted_at = now() where id = v_inv.id;
  return v_inv.role;
end $$;

-- Staff see each other's names and roles (to know who owns a lead or looks
-- after a client), and nothing else about each other.
create function public.staff_directory()
returns table (user_id uuid, display_name text, email text, roles text[])
language sql stable security definer set search_path = '' as $$
  with people as (
    select a.user_id, 'admin'::text as role from public.platform_admins a
    union all
    select s.user_id, s.role from public.platform_staff s
  )
  select p.user_id, coalesce(pr.display_name, split_part(u.email, '@', 1)), lower(u.email), array_agg(distinct p.role order by p.role)
    from people p join auth.users u on u.id = p.user_id left join public.profiles pr on pr.user_id = p.user_id
   where tebos_private.is_staff(array['sales', 'maintainer'])
   group by p.user_id, pr.display_name, u.email
$$;

revoke execute on function public.create_staff_invitation(text, text) from public, anon;
revoke execute on function public.accept_staff_invitation(text) from public, anon;
revoke execute on function public.staff_directory() from public, anon;
revoke execute on function public.staff_invitation_for_token(text) from public;
grant execute on function public.create_staff_invitation(text, text) to authenticated;
grant execute on function public.accept_staff_invitation(text) to authenticated;
grant execute on function public.staff_directory() to authenticated;
grant execute on function public.staff_invitation_for_token(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Leads from sales
-- ---------------------------------------------------------------------------
alter table public.enquiries
  add column source   text not null default 'website' check (source in ('website', 'sales')),
  add column added_by uuid references auth.users (id),
  add constraint enquiries_sales_has_owner check ((source = 'sales') = (added_by is not null));

-- Where an enquiry came from is decided by who sent it, never by what they
-- sent: sales staff's are theirs; everyone else's is from the website.
-- (Security definer so the public can run it; is_client() would then see the
-- owner, so the caller's API role is read from the session instead.)
create function tebos_private.enquiry_source() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('role', true) in ('anon', 'authenticated') then
    if auth.uid() is not null and tebos_private.is_staff(array['sales']) then
      new.source := 'sales';
      new.added_by := auth.uid();
    else
      new.source := 'website';
      new.added_by := null;
    end if;
  end if;
  return new;
end $$;

create trigger enquiry_source before insert on public.enquiries
  for each row execute function tebos_private.enquiry_source();

alter table public.opportunities
  add column source   text not null default 'website' check (source in ('website', 'sales')),
  add column owner_id uuid references auth.users (id);
create index opportunities_owner_idx on public.opportunities (owner_id) where owner_id is not null;

create or replace function tebos_private.guard_opportunity() returns trigger
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
        new.screening, new.screened_at, new.amount_cents, new.payment_url, new.payment_reference, new.org_id, new.created_at, new.source)
       is distinct from
       (old.enquiry_id, old.plan, old.contact_name, old.business, old.email, old.phone, old.website, old.message,
        old.screening, old.screened_at, old.amount_cents, old.payment_url, old.payment_reference, old.org_id, old.created_at, old.source) then
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
    -- a salesperson may take an unowned lead for themselves; only a platform admin reassigns one
    if new.owner_id is distinct from old.owner_id and not tebos_private.is_platform_admin()
       and not (old.owner_id is null and new.owner_id = auth.uid()) then
      raise exception 'only a platform admin reassigns a lead that has an owner' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
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
  if new.owner_id is not null and (tg_op = 'INSERT' or new.owner_id is distinct from old.owner_id)
     and not tebos_private.user_has_staff_role(new.owner_id, 'sales') then
    raise exception 'a lead''s owner must be TEBOS staff with the sales role' using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
  end if;
  return new;
end $$;

grant update (owner_id) on public.opportunities to authenticated;
