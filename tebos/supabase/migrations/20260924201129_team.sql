-- Teams: people's names, invitations, and a guaranteed admin (dossier §33/§34).
--
-- Profiles give people names inside the organisations they share; nobody can
-- read the profile of someone they don't work with. Invitations let an org
-- admin bring someone in without any privileged key: the admin creates a
-- single-use link bound to an email address, and only a signed-in user whose
-- *confirmed* email matches can accept it. Only a hash of the token is stored.

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  email        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- The email shown to colleagues always comes from the signed-in identity,
-- never from what a client sends.
create function tebos_private.profile_identity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    if new.user_id is distinct from auth.uid() then
      raise exception 'you can only edit your own profile' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
    end if;
    new.email := lower(nullif(auth.jwt() ->> 'email', ''));
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger identity before insert or update on public.profiles
  for each row execute function tebos_private.profile_identity();

create function tebos_private.shares_organisation(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships mine
    join public.memberships theirs on theirs.org_id = mine.org_id
    where mine.user_id = auth.uid() and theirs.user_id = p_user
  )
$$;

alter table public.profiles enable row level security;
create policy self_or_colleague_read on public.profiles for select to authenticated
  using (user_id = (select auth.uid()) or tebos_private.shares_organisation(user_id));
create policy self_insert on public.profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy self_update on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select on public.profiles to authenticated;
grant insert (user_id, display_name), update (display_name) on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------

insert into public.state_transitions (machine, from_state, to_state) values
  ('invitation', '(initial)', 'pending'),
  ('invitation', 'pending', 'accepted'),
  ('invitation', 'pending', 'revoked'),
  ('invitation', 'pending', 'expired');

create table public.invitations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations (id) on delete cascade,
  email       text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role        text not null check (role in ('org_admin', 'operator', 'approver', 'viewer')),
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
create unique index invitations_one_pending_idx on public.invitations (org_id, email) where status = 'pending';

-- Only the status may change after creation, and only along the state machine.
create function tebos_private.guard_invitation() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.org_id, new.email, new.role, new.token_hash, new.invited_by, new.created_at, new.expires_at)
     is distinct from (old.org_id, old.email, old.role, old.token_hash, old.invited_by, old.created_at, old.expires_at) then
    raise exception 'an invitation cannot be rewritten; revoke it and invite again'
      using errcode = 'P0001', hint = 'TEBOS_INVITATION_INVALID';
  end if;
  return new;
end $$;

create trigger enforce_state_machine before insert or update of status on public.invitations
  for each row execute function tebos_private.guard_status('invitation');
create trigger guard_invitation before update on public.invitations
  for each row execute function tebos_private.guard_invitation();
create trigger audit after insert or update or delete on public.invitations
  for each row execute function tebos_private.audit_row();

alter table public.invitations enable row level security;
-- The token hash is never readable by clients (column grants below).
create policy admin_read on public.invitations for select to authenticated
  using (tebos_private.has_role(org_id, array['org_admin']));
create policy admin_revoke on public.invitations for update to authenticated
  using (tebos_private.has_role(org_id, array['org_admin']))
  with check (tebos_private.has_role(org_id, array['org_admin']) and status = 'revoked');
grant select (id, org_id, email, role, status, invited_by, accepted_by, created_at, expires_at, accepted_at)
  on public.invitations to authenticated;
grant update (status) on public.invitations to authenticated;
grant all on public.invitations to service_role;

create function tebos_private.hash_token(p_token text) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
$$;

-- Returns the one-time token; it is shown to the admin once and never stored.
create function public.create_invitation(p_org uuid, p_email text, p_role text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_email text := lower(trim(p_email));
begin
  if not tebos_private.has_role(p_org, array['org_admin']) then
    raise exception 'only organisation admins can invite people' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
  end if;
  if exists (
    select 1 from public.memberships m join auth.users u on u.id = m.user_id
    where m.org_id = p_org and lower(u.email) = v_email
  ) then
    raise exception '% is already a member', v_email using errcode = 'P0001', hint = 'TEBOS_ALREADY_MEMBER';
  end if;
  -- an earlier pending invitation to the same address is replaced
  update public.invitations set status = 'revoked' where org_id = p_org and email = v_email and status = 'pending';
  insert into public.invitations (org_id, email, role, token_hash, invited_by)
    values (p_org, v_email, p_role, tebos_private.hash_token(v_token), auth.uid());
  return v_token;
end $$;

-- Accept with the token from the link. The signed-in user's confirmed email
-- must be the invited address.
create function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.invitations;
  v_email text;
  v_confirmed timestamptz;
begin
  if auth.uid() is null then
    raise exception 'sign in to accept an invitation' using errcode = '42501', hint = 'TEBOS_PERMISSION_DENIED';
  end if;
  select * into v_inv from public.invitations where token_hash = tebos_private.hash_token(p_token) for update;
  if v_inv.id is null or v_inv.status <> 'pending' then
    raise exception 'this invitation is not valid' using errcode = 'P0001', hint = 'TEBOS_INVITATION_INVALID';
  end if;
  if v_inv.expires_at <= now() then
    update public.invitations set status = 'expired' where id = v_inv.id;
    return null; -- the expiry is recorded; the caller is told the invitation is no longer valid
  end if;
  select lower(email), email_confirmed_at into v_email, v_confirmed from auth.users where id = auth.uid();
  if v_email is distinct from v_inv.email or v_confirmed is null then
    raise exception 'this invitation was sent to a different, or unconfirmed, email address'
      using errcode = '42501', hint = 'TEBOS_INVITATION_EMAIL';
  end if;
  insert into public.memberships (org_id, user_id, role) values (v_inv.org_id, auth.uid(), v_inv.role)
    on conflict (org_id, user_id) do nothing;
  update public.invitations set status = 'accepted', accepted_by = auth.uid(), accepted_at = now() where id = v_inv.id;
  return v_inv.org_id;
end $$;

revoke execute on function public.create_invitation(uuid, text, text) from public, anon;
revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.create_invitation(uuid, text, text) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;

-- ---------------------------------------------------------------------------
-- An organisation always keeps at least one admin
-- ---------------------------------------------------------------------------

create function tebos_private.keep_an_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'org_admin' and (tg_op = 'DELETE' or new.role <> 'org_admin')
     and exists (select 1 from public.organisations where id = old.org_id)
     and not exists (
       select 1 from public.memberships
       where org_id = old.org_id and role = 'org_admin' and user_id <> old.user_id
     ) then
    raise exception 'an organisation must keep at least one admin'
      using errcode = 'P0001', hint = 'TEBOS_LAST_ADMIN';
  end if;
  return coalesce(new, old);
end $$;

create trigger keep_an_admin before update or delete on public.memberships
  for each row execute function tebos_private.keep_an_admin();
