-- Operating-system blueprints: laid down as proposals, by the business's own
-- operators only, never over what the business already stated; a proposal is
-- confirmed forward (stated, observed) and never goes back.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t99u;
grant usage on schema t99u to anon, authenticated;
create function t99u.expect_error(p_sql text, p_expect text) returns void
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
create function t99u.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t99u to anon, authenticated;

select '99800000-0000-0000-0000-00000000000a' as admin, '99800000-0000-0000-0000-00000000000b' as viewer,
       '99800000-0000-0000-0000-00000000000c' as outsider \gset
insert into auth.users (id, email, email_confirmed_at) values
  (:'admin', 'admin@blueprint.test', now()), (:'viewer', 'viewer@blueprint.test', now()), (:'outsider', 'outsider@blueprint.test', now());
insert into public.platform_admins (user_id) values (:'admin');

set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
select public.create_organisation('Blueprint test', 'blueprint-test') as org \gset
insert into public.memberships (org_id, user_id, role) values (:'org', :'viewer', 'viewer');
insert into public.businesses (org_id, name) values (:'org', 'Plumbing Co') returning id as biz \gset
-- the owner already told TEBOS about one of the pieces
insert into public.board_components (org_id, business_id, name, kind) values (:'org', :'biz', 'Quote templates', 'document');
reset role;

select '{"key":"trades-construction","version":1,
  "pieces":[{"name":"Job management app","kind":"software","owner_role":"Office manager","description":"Jobs and schedules."},
            {"name":"Quote templates","kind":"document","owner_role":"Estimator","description":"Standard prices."}],
  "flows":[{"name":"Enquiry to booked job","starts_when":"A customer asks for a quote","done_when":"The job is booked","owner_role":"Office manager",
            "steps":[{"position":1,"name":"Price from the quote templates","performer":"staff","performer_role":"Estimator","piece":"Quote templates","decision_rule":"Standard jobs use the template."},
                     {"position":2,"name":"Book the job","performer":"automation","performer_role":"Job management app","piece":"Job management app","decision_rule":"Next free slot."}]}]}' as bp \gset

-- Only the business's operators and admins can lay one down
set role authenticated;
select set_config('request.jwt.claim.sub', :'viewer', false);
select t99u.expect_error(format('select public.apply_blueprint(%L, %L::jsonb)', :'biz', :'bp'), '42501');
select set_config('request.jwt.claim.sub', :'outsider', false);
select t99u.expect_error(format('select public.apply_blueprint(%L, %L::jsonb)', :'biz', :'bp'), 'TEBOS_PERMISSION_DENIED');
reset role;
set role anon;
select t99u.expect_error(format('select public.apply_blueprint(%L, %L::jsonb)', :'biz', :'bp'), '42501');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
select t99u.expect_error(format('select public.apply_blueprint(%L, %L::jsonb)', :'biz', '{"key":"x","version":1,"pieces":[],"flows":[]}'), 'TEBOS_VALIDATION');
select public.apply_blueprint(:'biz', :'bp') as result \gset
select t99u.ok((:'result'::jsonb) = '{"blueprint":"trades-construction@1","pieces":1,"flows":1,"steps":2}'::jsonb, 'laid down one new piece, one flow and two steps');
reset role;

select t99u.ok((select basis = 'stated' and from_blueprint is null from public.board_components where business_id = :'biz' and name = 'Quote templates'),
  'what the owner stated is left exactly as it was');
select t99u.ok((select basis = 'proposed' and from_blueprint = 'trades-construction@1' from public.board_components where business_id = :'biz' and name = 'Job management app'),
  'a new piece is proposed and names its blueprint');
select t99u.ok((select bool_and(basis = 'proposed' and from_blueprint = 'trades-construction@1') from public.board_steps where business_id = :'biz'), 'steps are proposed');
select t99u.ok((select component_id is not null from public.board_steps where business_id = :'biz' and position = 2), 'the automated step runs on its piece');
select t99u.ok((select count(*) >= 3 from public.audit_events where org_id = :'org' and entity_type in ('board_components', 'board_flows', 'board_steps')), 'every piece is on the audit trail');

-- Applying again adds nothing
set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
select t99u.ok((public.apply_blueprint(:'biz', :'bp') ->> 'flows')::int = 0, 'applying twice adds nothing');

-- A proposal is confirmed forward, never back
update public.board_components set basis = 'stated' where business_id = :'biz' and name = 'Job management app';
select t99u.expect_error(format('update public.board_components set basis = %L where business_id = %L and name = %L', 'proposed', :'biz', 'Job management app'), 'TEBOS_ILLEGAL_TRANSITION');
select t99u.expect_error(format('update public.board_components set from_blueprint = null where business_id = %L and name = %L', :'biz', 'Job management app'), 'TEBOS_SERVER_ONLY');
select t99u.expect_error(format('update public.board_steps set basis = %L where business_id = %L and position = 1', 'observed', :'biz'), 'TEBOS_EVIDENCE_REQUIRED');
select t99u.expect_error(format('insert into public.board_components (org_id, business_id, name, kind, basis) values (%L, %L, %L, %L, %L)',
  :'org', :'biz', 'Made up', 'software', 'proposed'), 'TEBOS_VALIDATION');
update public.board_flows set basis = 'stated' where business_id = :'biz';
select t99u.expect_error(format('update public.board_flows set basis = %L where business_id = %L', 'proposed', :'biz'), 'TEBOS_ILLEGAL_TRANSITION');
reset role;
