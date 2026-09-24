-- Team rules: profiles, invitations, and never losing the last admin.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t2;
grant usage on schema t2 to authenticated;
create function t2.expect_error(p_sql text, p_expect text) returns void
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
create function t2.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t2 to authenticated;

select '10000000-0000-0000-0000-00000000000a' as admin, '10000000-0000-0000-0000-00000000000b' as invitee,
       '10000000-0000-0000-0000-00000000000c' as impostor, '10000000-0000-0000-0000-00000000000d' as outsider,
       '10000000-0000-0000-0000-00000000000e' as unconfirmed \gset
insert into auth.users (id, email, email_confirmed_at) values
  (:'admin', 'admin@team.test', now()), (:'invitee', 'new.person@team.test', now()),
  (:'impostor', 'someone.else@team.test', now()), (:'outsider', 'outsider@elsewhere.test', now()),
  (:'unconfirmed', 'pending@team.test', null);

create function t2.as_user(p_id uuid, p_email text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_id::text, false),
         set_config('request.jwt.claims', json_build_object('sub', p_id, 'email', p_email)::text, false)
$$;
grant execute on function t2.as_user(uuid, text) to authenticated;

set role authenticated;
select t2.as_user(:'admin', 'admin@team.test');
select public.create_organisation('Team test', 'team-test') as org \gset

-- ===========================================================================
-- Profiles
-- ===========================================================================
insert into public.profiles (user_id, display_name) values (:'admin', 'Ada Admin');
select t2.ok((select email = 'admin@team.test' from public.profiles where user_id = :'admin'), 'profile email comes from the identity');
select t2.expect_error(format('insert into public.profiles (user_id, display_name) values (%L, %L)', :'outsider', 'Forged'), '42501');
select t2.expect_error(format('update public.profiles set email = %L where user_id = %L', 'fake@x.test', :'admin'), '42501');

select t2.as_user(:'outsider', 'outsider@elsewhere.test');
insert into public.profiles (user_id, display_name) values (:'outsider', 'Olly Outsider');
select t2.ok((select count(*) from public.profiles) = 1, 'strangers cannot read each other''s profiles');

-- ===========================================================================
-- Invitations
-- ===========================================================================
select t2.expect_error(format('select public.create_invitation(%L, %L, %L)', :'org', 'x@team.test', 'viewer'), 'TEBOS_PERMISSION_DENIED');

select t2.as_user(:'admin', 'admin@team.test');
select t2.expect_error(format('select public.create_invitation(%L, %L, %L)', :'org', 'admin@team.test', 'viewer'), 'TEBOS_ALREADY_MEMBER');
select public.create_invitation(:'org', '  New.Person@Team.test ', 'operator') as token \gset
select t2.ok((select count(*) from public.invitations where email = 'new.person@team.test' and status = 'pending') = 1, 'invitation stored with a normalised email');
select t2.expect_error('select token_hash from public.invitations', '42501');
select t2.expect_error(format('update public.invitations set role = %L where org_id = %L', 'org_admin', :'org'), '42501');

-- someone else holding the link cannot use it
select t2.as_user(:'impostor', 'someone.else@team.test');
select t2.expect_error(format('select public.accept_invitation(%L)', :'token'), 'TEBOS_INVITATION_EMAIL');
select t2.expect_error(format('select public.accept_invitation(%L)', 'not-a-real-token'), 'TEBOS_INVITATION_INVALID');

-- the invited person accepts once
select t2.as_user(:'invitee', 'new.person@team.test');
select t2.ok(public.accept_invitation(:'token') = :'org', 'invitation accepted');
select t2.ok((select role = 'operator' from public.memberships where user_id = :'invitee' and org_id = :'org'), 'joined with the invited role');
select t2.expect_error(format('select public.accept_invitation(%L)', :'token'), 'TEBOS_INVITATION_INVALID');
insert into public.profiles (user_id, display_name) values (:'invitee', 'Nia New');
select t2.ok((select count(*) from public.profiles where user_id in (:'admin', :'invitee')) = 2, 'colleagues see each other''s names');

-- an unconfirmed address cannot accept, even with the right token
select t2.as_user(:'admin', 'admin@team.test');
select public.create_invitation(:'org', 'pending@team.test', 'viewer') as token2 \gset
select t2.as_user(:'unconfirmed', 'pending@team.test');
select t2.expect_error(format('select public.accept_invitation(%L)', :'token2'), 'TEBOS_INVITATION_EMAIL');

-- revoking: admins only, and a revoked link is dead
select t2.as_user(:'admin', 'admin@team.test');
update public.invitations set status = 'revoked' where email = 'pending@team.test' and status = 'pending';
select t2.ok((select status = 'revoked' from public.invitations where email = 'pending@team.test'), 'admin revoked the invitation');
reset role;
update auth.users set email_confirmed_at = now() where id = :'unconfirmed';
set role authenticated;
select t2.as_user(:'unconfirmed', 'pending@team.test');
select t2.expect_error(format('select public.accept_invitation(%L)', :'token2'), 'TEBOS_INVITATION_INVALID');

-- expired links are recorded as expired and do nothing
reset role;
select set_config('request.jwt.claim.sub', '', false);
insert into public.invitations (org_id, email, role, token_hash, created_at, expires_at)
  values (:'org', 'late@team.test', 'viewer', tebos_private.hash_token('late-token'), now() - interval '10 days', now() - interval '3 days');
insert into auth.users (id, email, email_confirmed_at) values ('10000000-0000-0000-0000-00000000000f', 'late@team.test', now());
set role authenticated;
select t2.as_user('10000000-0000-0000-0000-00000000000f', 'late@team.test');
select t2.ok(public.accept_invitation('late-token') is null, 'expired invitation grants nothing');
select t2.ok((select count(*) from public.memberships where user_id = '10000000-0000-0000-0000-00000000000f') = 0, 'no membership from an expired link');
reset role;
select t2.ok((select status = 'expired' from public.invitations where email = 'late@team.test'), 'expiry recorded');

-- ===========================================================================
-- Never lose the last admin
-- ===========================================================================
set role authenticated;
select t2.as_user(:'admin', 'admin@team.test');
select t2.expect_error(format('update public.memberships set role = %L where user_id = %L and org_id = %L', 'viewer', :'admin', :'org'), 'TEBOS_LAST_ADMIN');
select t2.expect_error(format('delete from public.memberships where user_id = %L and org_id = %L', :'admin', :'org'), 'TEBOS_LAST_ADMIN');
update public.memberships set role = 'org_admin' where user_id = :'invitee' and org_id = :'org';
update public.memberships set role = 'viewer' where user_id = :'admin' and org_id = :'org';
select t2.ok((select role = 'viewer' from public.memberships where user_id = :'admin'), 'with a second admin, the first can step down');

-- every step was audited
reset role;
select t2.ok((select count(*) from public.audit_events where entity_type = 'invitations') >= 5, 'invitation lifecycle audited');
select 'ok' as team;
