-- Business reviews: only TEBOS's server links a finding to the analysis run
-- that produced it, or supersedes findings by run.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists t5;
grant usage on schema t5 to authenticated;
create function t5.expect_error(p_sql text, p_expect text) returns void
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
create function t5.ok(p_cond boolean, p_what text) returns void
language plpgsql as $$ begin if not coalesce(p_cond, false) then raise exception 'assertion failed: %', p_what; end if; end $$;
grant execute on all functions in schema t5 to authenticated;

select '60000000-0000-0000-0000-00000000000a' as admin \gset
insert into auth.users (id, email, email_confirmed_at) values (:'admin', 'admin@review.test', now());

set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
select public.create_organisation('Review test', 'review-test') as org \gset
insert into public.businesses (org_id, name) values (:'org', 'Agency') returning id as biz \gset
insert into public.sources (org_id, business_id, source_type, uri) values (:'org', :'biz', 'user_statement', null) returning id as src \gset
insert into public.evidence (org_id, business_id, source_id, state, fact) values (:'org', :'biz', :'src', 'user_supplied', 'Finance works from memory')
  returning id as ev \gset
reset role;

-- The server records a review run and a finding linked to it.
select set_config('request.jwt.claim.sub', '', false);
select set_config('tebos.actor_type', 'agent', false), set_config('tebos.actor_id', 'intelligence-worker:sql', false);
insert into public.agent_runs (org_id, business_id, agent_role, purpose, input_context)
  values (:'org', :'biz', 'business_intelligence', 'Business review', '{"kind": "business_review"}') returning id as run \gset
begin;
set constraints all deferred;
insert into public.findings (org_id, business_id, title, statement, category, confidence, status, analysis_run_id)
  values (:'org', :'biz', 'No finance checklist', 'Finance has no checklist', 'gap', 0.5, 'active', :'run') returning id as f \gset
insert into public.finding_evidence (org_id, business_id, finding_id, evidence_id) values (:'org', :'biz', :'f', :'ev');
commit;

-- A client can neither forge the link nor supersede by run …
set role authenticated;
select set_config('request.jwt.claim.sub', :'admin', false);
select t5.expect_error(format('update public.findings set analysis_run_id = null where id = %L', :'f'), 'TEBOS_SERVER_ONLY');
select t5.expect_error(format('update public.findings set status = %L, superseded_by_run = %L where id = %L', 'superseded', :'run', :'f'), 'TEBOS_SERVER_ONLY');
select t5.expect_error(format('insert into public.findings (org_id, business_id, title, statement, category, confidence, analysis_run_id)
  values (%L, %L, %L, %L, %L, 0.5, %L)', :'org', :'biz', 'Forged', 'Forged', 'gap', :'run'), 'TEBOS_SERVER_ONLY');
-- … and superseded still needs a successor of some kind.
select t5.expect_error(format('update public.findings set status = %L where id = %L', 'superseded', :'f'), '23514');
-- Ordinary edits still work.
update public.findings set title = 'No finance checklist (seen)' where id = :'f';
reset role;

-- The server supersedes a review's findings by the later run.
select set_config('request.jwt.claim.sub', '', false);
insert into public.agent_runs (org_id, business_id, agent_role, purpose, input_context)
  values (:'org', :'biz', 'business_intelligence', 'Business review', '{"kind": "business_review"}') returning id as run2 \gset
update public.findings set status = 'superseded', superseded_by_run = :'run2' where id = :'f';
select t5.ok((select status = 'superseded' and superseded_by_run = :'run2' from public.findings where id = :'f'), 'server supersedes by run');
