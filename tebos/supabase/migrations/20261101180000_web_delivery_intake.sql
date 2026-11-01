-- The Web Delivery Division, milestone 4 (founder, 1 Nov 2026: "do it all"; docs/web-delivery/, ADR 0012): the client
-- fills in their website brief from their own account, and TEBOS's maintainers work from one queue across every
-- client, so nothing waits on the founder. Additive only.
--
-- The rules (mirrored in src/domain/web-delivery.ts):
--   * One brief per project. The client's admin or operator writes it while it's a draft; once submitted it's fixed
--     until a maintainer reopens it with a reason.
--   * A brief is submitted only with what TEBOS needs to start: the business, who it's for, the visitor's first action,
--     how success is measured, at least one page, a visual direction, and the client's confirmations that they hold
--     the rights to what they send and that the data the site collects has a stated purpose.
--   * No personal contact details or secrets in the brief: contact runs through the client's TEBOS account.
--   * The work queue lists, oldest first: the clients' open requests, submitted briefs awaiting scope, tasks due or
--     late, and late projects. Maintainers see all of it; nobody else sees any of it.

create table public.web_intakes (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null unique,
  org_id        uuid not null,
  answers       jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object' and length(answers::text) <= 20000),
  status        text not null default 'draft' check (status in ('draft', 'submitted')),
  submitted_by  uuid references auth.users (id),
  submitted_at  timestamptz,
  reopen_reason text check (reopen_reason is null or length(reopen_reason) <= 1000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (project_id, org_id) references public.web_projects (id, org_id),
  check ((status = 'submitted') = (submitted_at is not null)),
  check (not tebos_private.looks_secret(answers::text) and not tebos_private.looks_personal(answers::text))
);

-- what a brief still lacks before it can be submitted; empty means complete
create function tebos_private.web_intake_missing(p_answers jsonb) returns text[]
language sql immutable set search_path = '' as $$
  select array_remove(array[
    case when length(trim(coalesce(p_answers ->> 'business_name', ''))) < 2 then 'business_name' end,
    case when length(trim(coalesce(p_answers ->> 'audience', ''))) < 10 then 'audience' end,
    case when length(trim(coalesce(p_answers ->> 'first_action', ''))) < 5 then 'first_action' end,
    case when length(trim(coalesce(p_answers ->> 'success_measure', ''))) < 5 then 'success_measure' end,
    case when jsonb_typeof(p_answers -> 'pages') is distinct from 'array' or jsonb_array_length(p_answers -> 'pages') < 1 then 'pages' end,
    case when coalesce(p_answers ->> 'visual_direction', '') not in ('cinematic_3d', 'luxury_editorial', 'corporate', 'minimal', 'bold',
      'product_led', 'data_rich', 'tebos_recommends') then 'visual_direction' end,
    case when (p_answers -> 'confirmations' ->> 'rights') is distinct from 'true' then 'confirm_rights' end,
    case when (p_answers -> 'confirmations' ->> 'privacy') is distinct from 'true' then 'confirm_privacy' end
  ], null)
$$;

create function tebos_private.guard_web_intake() returns trigger
language plpgsql set search_path = '' as $$
declare v_staff boolean := tebos_private.is_staff(array['maintainer']);
begin
  if tg_op = 'DELETE' then
    raise exception 'a brief is kept' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  if tg_op = 'UPDATE' and (new.project_id, new.org_id) is distinct from (old.project_id, old.org_id) then
    raise exception 'a brief stays on its project' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  if tg_op = 'INSERT' then
    new.status := 'draft'; new.submitted_by := null; new.submitted_at := null; new.reopen_reason := null;
    return new;
  end if;
  if old.status = 'submitted' then
    -- only a maintainer reopens a submitted brief, with a reason; nothing else about it changes
    if new.status = 'draft' and v_staff and length(trim(coalesce(new.reopen_reason, ''))) >= 10 and new.answers = old.answers then
      new.submitted_at := null; new.submitted_by := null;
      return new;
    end if;
    raise exception 'a submitted brief is fixed; TEBOS reopens it if something must change' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  if v_staff and not tebos_private.has_role(new.org_id, array['org_admin', 'operator']) then
    raise exception 'the client writes their own brief' using errcode = 'P0001', hint = 'TEBOS_PERMISSION_DENIED';
  end if;
  if new.status = 'submitted' then
    if cardinality(tebos_private.web_intake_missing(new.answers)) > 0 then
      raise exception 'the brief still needs: %', array_to_string(tebos_private.web_intake_missing(new.answers), ', ')
        using errcode = 'P0001', hint = 'TEBOS_VALIDATION';
    end if;
    new.submitted_at := now();
    new.submitted_by := auth.uid();
  end if;
  return new;
end $$;

create trigger guard_web_intake before insert or update or delete on public.web_intakes
  for each row execute function tebos_private.guard_web_intake();
create trigger touch before update on public.web_intakes
  for each row execute function tebos_private.touch_updated_at();
create trigger audit after insert or update or delete on public.web_intakes
  for each row execute function tebos_private.audit_row();

alter table public.web_intakes enable row level security;
create policy read on public.web_intakes for select to authenticated
  using (tebos_private.is_staff(array['maintainer']) or tebos_private.is_member(org_id));
create policy client_insert on public.web_intakes for insert to authenticated
  with check (tebos_private.has_role(org_id, array['org_admin', 'operator']));
create policy client_or_maintainer_update on public.web_intakes for update to authenticated
  using (tebos_private.has_role(org_id, array['org_admin', 'operator']) or tebos_private.is_staff(array['maintainer']))
  with check (tebos_private.has_role(org_id, array['org_admin', 'operator']) or tebos_private.is_staff(array['maintainer']));
grant select, insert on public.web_intakes to authenticated;
grant update (answers, status, reopen_reason) on public.web_intakes to authenticated;
grant all on public.web_intakes to service_role;

-- ---------------------------------------------------------------------------
-- The maintainers' work queue across every client
-- ---------------------------------------------------------------------------
create function public.web_work_queue()
returns table (kind text, project_id uuid, ref text, project_name text, org_name text, maintainer_id uuid, item_id uuid,
               title text, since timestamptz, due_on date)
language sql stable security definer set search_path = '' as $$
  select * from (
    select 'request'::text, p.id, p.ref, p.name, o.name, p.maintainer_id, c.id, c.title, c.created_at, null::date
      from public.change_requests c join public.web_projects p on p.id = c.web_project_id join public.organisations o on o.id = p.org_id
     where c.status in ('received', 'in_progress')
    union all
    select 'brief', p.id, p.ref, p.name, o.name, p.maintainer_id, i.id, 'Brief submitted: write the scope', i.submitted_at, null
      from public.web_intakes i join public.web_projects p on p.id = i.project_id join public.organisations o on o.id = p.org_id
     where i.status = 'submitted' and p.status in ('lead', 'intake')
       and not exists (select 1 from public.web_scope_revisions r where r.project_id = p.id)
    union all
    select 'task', p.id, p.ref, p.name, o.name, coalesce(t.assigned_to, p.maintainer_id), t.id, t.title, t.created_at, t.due_on
      from public.web_tasks t join public.web_projects p on p.id = t.project_id join public.organisations o on o.id = p.org_id
     where t.status in ('todo', 'in_progress', 'review', 'blocked') and t.due_on <= tebos_private.sa_today()
       and p.status not in ('closed', 'cancelled')
    union all
    select 'late', p.id, p.ref, p.name, o.name, p.maintainer_id, p.id, 'Past its delivery date', p.updated_at, p.deadline_on
      from public.web_projects p join public.organisations o on o.id = p.org_id
     where p.status in ('build', 'qa', 'qa_failed', 'blocked_technical') and p.clock_paused_on is null
       and p.deadline_on < tebos_private.sa_today()
  ) q (kind, project_id, ref, project_name, org_name, maintainer_id, item_id, title, since, due_on)
  where tebos_private.is_staff(array['maintainer'])
  order by coalesce(q.due_on::timestamptz, q.since), q.since
$$;
revoke all on function public.web_work_queue() from public, anon;
grant execute on function public.web_work_queue() to authenticated, service_role;
