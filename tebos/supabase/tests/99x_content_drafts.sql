\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99x;
grant usage on schema t99x to anon, authenticated;
create function t99x.expect_error(p_sql text, p_expect text) returns void
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
create function t99x.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t99x to anon, authenticated;
grant execute on all functions in schema t99x to anon, authenticated;

-- Marketing drafts: staff draft, a platform admin approves, a person publishes
-- and records where. Text is frozen once sent for review.
select '99a10000-0000-0000-0000-00000000000a' as boss, '99a10000-0000-0000-0000-00000000000b' as rep,
       '99a10000-0000-0000-0000-00000000000c' as rep2, '99a10000-0000-0000-0000-00000000000d' as client \gset
insert into auth.users (id, email, email_confirmed_at) values
  (:'boss', 'boss@drafts.test', now()), (:'rep', 'rep@drafts.test', now()), (:'rep2', 'rep2@drafts.test', now()), (:'client', 'client@drafts.test', now());
insert into public.platform_admins (user_id) values (:'boss');
insert into public.platform_staff (user_id, role) values (:'rep', 'sales'), (:'rep2', 'maintainer');

set role anon;
select t99x.expect_error('select * from public.content_drafts', '42501');
set role authenticated;
select set_config('request.jwt.claim.sub', :'client', false);
select t99x.expect_error(format('insert into public.content_drafts (channel, body) values (%L, %L)', 'linkedin', 'Hello'), '42501');

select set_config('request.jwt.claim.sub', :'rep', false);
insert into public.content_drafts (channel, title, body, author_id) values ('linkedin', 'Founder as middleware', 'Most owners are the middleware in their own business.', :'boss')
  returning id as d1 \gset
select t99x.ok((select author_id = :'rep'::uuid and status = 'draft' from public.content_drafts where id = :'d1'), 'a draft is recorded as whoever wrote it');
select t99x.expect_error(format('insert into public.content_drafts (channel, body, status) values (%L, %L, %L)', 'x', 'Skip review', 'approved'), 'TEBOS_ILLEGAL_TRANSITION');
update public.content_drafts set body = 'Most owners are the middleware in their own business. Here is how to stop.' where id = :'d1';
select t99x.expect_error(format('update public.content_drafts set status = %L, published_url = %L where id = %L', 'published', 'https://linkedin.com/p/1', :'d1'), 'TEBOS_ILLEGAL_TRANSITION');
update public.content_drafts set status = 'in_review' where id = :'d1';
select t99x.expect_error(format('update public.content_drafts set body = %L where id = %L', 'Changed after review', :'d1'), 'TEBOS_INPUT_FROZEN');
-- staff can't approve, not even their own
select t99x.expect_error(format('update public.content_drafts set status = %L where id = %L', 'approved', :'d1'), 'TEBOS_NOT_APPROVER');
-- another staff member can't move someone else's draft
select set_config('request.jwt.claim.sub', :'rep2', false);
update public.content_drafts set status = 'withdrawn' where id = :'d1';
select t99x.ok((select status = 'in_review' from public.content_drafts where id = :'d1'), 'staff move only their own drafts');

-- the admin rejects with a reason; the author revises and resends; the admin approves
select set_config('request.jwt.claim.sub', :'boss', false);
select t99x.expect_error(format('update public.content_drafts set status = %L where id = %L', 'rejected', :'d1'), '23514');
update public.content_drafts set status = 'rejected', review_note = 'Say what the reader should do next' where id = :'d1';
select t99x.ok((select reviewed_by = :'boss'::uuid and reviewed_at is not null from public.content_drafts where id = :'d1'), 'the review is recorded in the reviewer''s name');
select set_config('request.jwt.claim.sub', :'rep', false);
update public.content_drafts set status = 'draft' where id = :'d1';
select t99x.ok((select reviewed_by is null from public.content_drafts where id = :'d1'), 'back to a draft, the old review no longer applies');
update public.content_drafts set body = 'Most owners are the middleware. Take the free self-check to see how much.', status = 'in_review' where id = :'d1';
select set_config('request.jwt.claim.sub', :'boss', false);
update public.content_drafts set status = 'approved', review_note = 'Good' where id = :'d1';
select t99x.expect_error(format('update public.content_drafts set review_note = %L where id = %L', 'rewritten', :'d1'), 'TEBOS_INPUT_FROZEN');

-- published only with where it went live, an https address
select set_config('request.jwt.claim.sub', :'rep', false);
select t99x.expect_error(format('update public.content_drafts set status = %L where id = %L', 'published', :'d1'), '23514');
select t99x.expect_error(format('update public.content_drafts set status = %L, published_url = %L where id = %L', 'published', 'not a link', :'d1'), '23514');
update public.content_drafts set status = 'published', published_url = 'https://www.linkedin.com/posts/tebos-1' where id = :'d1';
select t99x.ok((select published_by = :'rep'::uuid and published_at is not null from public.content_drafts where id = :'d1'), 'publishing is recorded by whoever did it');
select t99x.expect_error(format('update public.content_drafts set status = %L where id = %L', 'withdrawn', :'d1'), 'TEBOS_ILLEGAL_TRANSITION');
select t99x.expect_error(format('delete from public.content_drafts where id = %L', :'d1'), '42501');

-- an admin's own words need no second approver
select set_config('request.jwt.claim.sub', :'boss', false);
insert into public.content_drafts (channel, body) values ('blog', 'Why structure beats hustle.') returning id as d2 \gset
update public.content_drafts set status = 'in_review' where id = :'d2';
update public.content_drafts set status = 'approved' where id = :'d2';
select t99x.ok((select status = 'approved' from public.content_drafts where id = :'d2'), 'an admin approves their own words');
reset role;
select t99x.expect_error(format('delete from public.content_drafts where id = %L', :'d2'), 'TEBOS_EVIDENCE_IMMUTABLE');
select t99x.ok((select count(*) >= 5 from public.audit_events where entity_type = 'content_drafts'), 'drafts are audited');
