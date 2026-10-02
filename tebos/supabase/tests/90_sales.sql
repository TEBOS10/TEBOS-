-- The sales team: staff join by invitation bound to their email, only as
-- staff; leads from sales belong to whoever added them; nobody can pass a
-- website enquiry off as their own, or take someone else's lead.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t9;
grant usage on schema t9 to anon, authenticated;
create function t9.expect_error(p_sql text, p_expect text) returns void
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
create function t9.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t9 to anon, authenticated;

select '90000000-0000-0000-0000-00000000000a' as admin, '90000000-0000-0000-0000-00000000000b' as rep,
       '90000000-0000-0000-0000-00000000000c' as rep2, '90000000-0000-0000-0000-00000000000d' as stranger,
       '90000000-0000-0000-0000-00000000000e' as unconfirmed \gset
insert into auth.users (id, email, email_confirmed_at) values
  (:'admin', 'boss@tebos.test', now()), (:'rep', 'rep@tebos.test', now()), (:'rep2', 'rep2@tebos.test', now()),
  (:'stranger', 'someone@elsewhere.test', now()), (:'unconfirmed', 'late@tebos.test', null);
insert into public.platform_admins (user_id) values (:'admin');

-- ---------------------------------------------------------------------------
-- Staff invitations
-- ---------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', :'stranger', false);
select t9.expect_error($$select public.create_staff_invitation('x@tebos.test', 'sales')$$, 'TEBOS_PERMISSION_DENIED');
select t9.ok((select count(*) = 0 from public.staff_invitations), 'strangers see no staff invitations');
select t9.ok((select count(*) = 0 from public.staff_directory()), 'strangers see no staff directory');

select set_config('request.jwt.claim.sub', :'admin', false);
select public.create_staff_invitation(' Rep@TEBOS.test ', 'sales') as tok_rep \gset
select public.create_staff_invitation('rep2@tebos.test', 'sales') as tok_rep2 \gset
select public.create_staff_invitation('late@tebos.test', 'sales') as tok_late \gset
select t9.expect_error($$select public.create_staff_invitation('x@tebos.test', 'owner')$$, '23514');
select t9.ok((select count(*) = 3 from public.staff_invitations where status = 'pending'), 'admin sees pending invitations');
select t9.expect_error('select token_hash from public.staff_invitations', '42501');
-- inviting again replaces the earlier link
select public.create_staff_invitation('rep2@tebos.test', 'sales') as tok_rep2b \gset
select t9.ok((select count(*) = 1 from public.staff_invitations where email = 'rep2@tebos.test' and status = 'pending'), 'one pending link per person and role');
select t9.ok((select status = 'revoked' from public.staff_invitations where email = 'rep2@tebos.test' order by created_at, status limit 1), 'the old link is revoked');
-- an invitation cannot be rewritten, only revoked
select t9.expect_error($$update public.staff_invitations set email = 'me@evil.test' where email = 'late@tebos.test'$$, '42501');
select t9.expect_error($$update public.staff_invitations set status = 'accepted' where email = 'late@tebos.test'$$, '42501');

-- the public page shows only role and address, and only for a live link
set role anon;
select t9.ok((select role = 'sales' and email = 'rep@tebos.test' from public.staff_invitation_for_token(:'tok_rep')), 'the link shows its role and address');
select t9.ok((select count(*) = 0 from public.staff_invitation_for_token('nope')), 'an unknown link shows nothing');
select t9.ok((select count(*) = 0 from public.staff_invitation_for_token(:'tok_rep2')), 'a replaced link shows nothing');
select t9.expect_error(format('select public.accept_staff_invitation(%L)', :'tok_rep'), '42501');
select t9.expect_error('select * from public.staff_invitations', '42501');
set role authenticated;

-- only the invited, confirmed address can accept
select set_config('request.jwt.claim.sub', :'stranger', false);
select t9.expect_error(format('select public.accept_staff_invitation(%L)', :'tok_rep'), 'TEBOS_INVITATION_EMAIL');
select set_config('request.jwt.claim.sub', :'unconfirmed', false);
select t9.expect_error(format('select public.accept_staff_invitation(%L)', :'tok_late'), 'TEBOS_INVITATION_EMAIL');
select set_config('request.jwt.claim.sub', :'rep2', false);
select t9.expect_error(format('select public.accept_staff_invitation(%L)', :'tok_rep2'), 'TEBOS_INVITATION_INVALID');
select t9.ok((select public.accept_staff_invitation(:'tok_rep2b') = 'sales'), 'rep2 accepts the current link');
select set_config('request.jwt.claim.sub', :'rep', false);
select t9.ok((select public.accept_staff_invitation(:'tok_rep') = 'sales'), 'rep accepts');
select t9.expect_error(format('select public.accept_staff_invitation(%L)', :'tok_rep'), 'TEBOS_INVITATION_INVALID');
select t9.ok((select count(*) = 1 from public.platform_staff where user_id = :'rep' and role = 'sales'), 'rep is sales staff');
select t9.ok(not exists (select 1 from public.memberships where user_id = :'rep'), 'and a member of no organisation');
-- staff can't invite, and can't give themselves more roles
select t9.expect_error($$select public.create_staff_invitation('friend@tebos.test', 'sales')$$, 'TEBOS_PERMISSION_DENIED');
select t9.expect_error(format('insert into public.platform_staff (user_id, role) values (%L, %L)', :'rep', 'maintainer'), '42501');
select t9.ok((select count(*) = 0 from public.staff_invitations), 'staff do not see invitations');
-- staff see each other's names
select t9.ok((select count(*) = 3 from public.staff_directory() where user_id in (:'admin', :'rep', :'rep2')), 'staff see the directory (admin and two reps)');
select t9.ok((select 'admin' = any (roles) from public.staff_directory() where user_id = :'admin'), 'admins are marked');

select set_config('request.jwt.claim.sub', :'admin', false);
select t9.expect_error($$select public.create_staff_invitation('rep@tebos.test', 'sales')$$, 'TEBOS_ALREADY_MEMBER');
update public.staff_invitations set status = 'revoked' where email = 'late@tebos.test';
select t9.ok((select status = 'revoked' from public.staff_invitations where email = 'late@tebos.test'), 'admin revokes');
reset role;
select t9.ok((select count(*) >= 2 from public.audit_events where entity_type = 'staff_invitations'), 'invitations are audited');

-- ---------------------------------------------------------------------------
-- Leads from sales
-- ---------------------------------------------------------------------------
-- the public can't pass anything off as a sales lead
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select t9.expect_error(format('insert into public.enquiries (plan, name, business, email, source, added_by) values (%L, %L, %L, %L, %L, %L)',
  'starter', 'Eve', 'Eve Co', 'eve@eve.test', 'sales', :'rep'), '42501');
insert into public.enquiries (plan, name, business, email) values ('starter', 'Web', 'Web Co', 'web@webco.test');
reset role;
select t9.ok((select source = 'website' and added_by is null from public.enquiries where email = 'web@webco.test'), 'a public enquiry is from the website');

-- a signed-in non-staff person's enquiry is from the website too
set role authenticated;
select set_config('request.jwt.claim.sub', :'stranger', false);
insert into public.enquiries (plan, name, business, email) values ('growth', 'Str', 'Str Co', 'str@strco.test');
-- sales' leads are theirs
select set_config('request.jwt.claim.sub', :'rep', false);
insert into public.enquiries (plan, name, business, email, website, message)
  values ('growth', 'Lerato', 'Lerato Studio', 'lerato@leratostudio.test', 'https://leratostudio.test', 'Met at the Joburg founders breakfast');
reset role;
select t9.ok((select source = 'website' and added_by is null from public.enquiries where email = 'str@strco.test'), 'a non-staff enquiry is from the website');
select t9.ok((select source = 'sales' and added_by = :'rep' from public.enquiries where email = 'lerato@leratostudio.test'), 'a sales lead belongs to its rep');
select t9.expect_error(format('insert into public.enquiries (plan, name, business, email, source) values (%L, %L, %L, %L, %L)',
  'starter', 'x', 'x', 'x@x.test', 'sales'), '23514');

-- the server opens opportunities with the source and owner
select set_config('tebos.actor_type', 'agent', false), set_config('tebos.actor_id', 'pipeline-worker:sql', false);
insert into public.opportunities (enquiry_id, plan, contact_name, business, email, source, owner_id)
  select id, plan, name, business, email, source, added_by from public.enquiries where email = 'lerato@leratostudio.test' returning id as lead \gset
insert into public.opportunities (enquiry_id, plan, contact_name, business, email, source)
  select id, plan, name, business, email, source from public.enquiries where email = 'web@webco.test' returning id as web \gset
select t9.expect_error(format('update public.opportunities set owner_id = %L where id = %L', :'stranger', :'web'), 'TEBOS_VALIDATION');
update public.opportunities set status = 'screened', screened_at = now(), screening = '{"flags": []}' where id in (:'lead', :'web');

set role authenticated;
select set_config('request.jwt.claim.sub', :'rep2', false);
-- source is the server's, and nobody takes someone else's lead
select t9.expect_error(format('update public.opportunities set source = %L where id = %L', 'sales', :'web'), '42501');
select t9.expect_error(format('update public.opportunities set owner_id = %L where id = %L', :'rep2', :'lead'), 'TEBOS_PERMISSION_DENIED');
select t9.expect_error(format('update public.opportunities set owner_id = %L where id = %L', :'rep', :'web'), 'TEBOS_PERMISSION_DENIED');
-- an unowned lead can be taken, by yourself for yourself
update public.opportunities set owner_id = :'rep2' where id = :'web';
select t9.ok((select owner_id = :'rep2' from public.opportunities where id = :'web'), 'rep2 takes the unowned website lead');
select set_config('request.jwt.claim.sub', :'rep', false);
select t9.expect_error(format('update public.opportunities set owner_id = null where id = %L', :'web'), 'TEBOS_PERMISSION_DENIED');
-- a platform admin reassigns, but only to sales staff
select set_config('request.jwt.claim.sub', :'admin', false);
select t9.expect_error(format('update public.opportunities set owner_id = %L where id = %L', :'stranger', :'web'), 'TEBOS_VALIDATION');
update public.opportunities set owner_id = :'rep' where id = :'web';
reset role;
select t9.ok((select owner_id = :'rep' from public.opportunities where id = :'web'), 'admin reassigned the lead');
select t9.ok((select count(*) >= 2 from public.audit_events where entity_type = 'opportunities' and entity_id = :'web'), 'ownership changes are audited');

-- ---------------------------------------------------------------------------
-- The playbook: staff read it, admins edit it, nobody else sees it
-- ---------------------------------------------------------------------------
select t9.ok((select count(*) >= 8 from public.sales_playbook), 'the playbook is seeded');
select t9.ok(not exists (select 1 from public.sales_playbook where body ~ 'R[0-9]'), 'prices are never typed into the playbook');
set role anon;
select t9.expect_error('select * from public.sales_playbook', '42501');
set role authenticated;
select set_config('request.jwt.claim.sub', :'stranger', false);
select t9.ok((select count(*) = 0 from public.sales_playbook), 'a non-staff account sees no playbook');
select set_config('request.jwt.claim.sub', :'rep', false);
select t9.ok((select count(*) >= 8 from public.sales_playbook), 'sales reads the playbook');
update public.sales_playbook set body = 'Promise them 10x revenue' where key = 'rules';
select t9.ok((select body <> 'Promise them 10x revenue' from public.sales_playbook where key = 'rules'), 'sales cannot rewrite the playbook');
select set_config('request.jwt.claim.sub', :'admin', false);
update public.sales_playbook set body = body || E'\n\n- **Log every call.**' where key = 'rules';
reset role;
select t9.ok((select updated_by = :'admin' and body like '%Log every call%' from public.sales_playbook where key = 'rules'), 'an admin edits it, in their name');
select t9.ok((select count(*) >= 1 from public.audit_events where entity_type = 'sales_playbook'), 'playbook edits are audited');
