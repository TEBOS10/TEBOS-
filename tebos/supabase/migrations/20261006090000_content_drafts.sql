-- Marketing and PR drafts, approved before anything is published (tier 2).
--
-- TEBOS's staff draft posts, articles, press releases and newsletters here.
-- Nothing is ever published by TEBOS: a person publishes it on the channel
-- and records where. The rules:
--
--   * A draft is edited only while it's a draft. Sent for review, its text is
--     frozen; to change it, pull it back to a draft (which needs review again).
--   * Only a platform admin approves or rejects, and a rejection says why.
--     Staff can't approve their own drafts; an admin's own words need no
--     second approver.
--   * "Published" is recorded only for an approved draft, by staff, with the
--     https address where it went live. It's never inferred or invented.

create table public.content_drafts (
  id            uuid primary key default gen_random_uuid(),
  channel       text not null check (channel in ('linkedin', 'instagram', 'facebook', 'x', 'tiktok', 'blog', 'press_release', 'newsletter')),
  title         text check (title is null or length(btrim(title)) between 1 and 200),
  body          text not null check (length(btrim(body)) between 1 and 20000),
  status        text not null default 'draft' check (status in ('draft', 'in_review', 'approved', 'rejected', 'published', 'withdrawn')),
  author_id     uuid not null references auth.users (id),
  reviewed_by   uuid references auth.users (id),
  reviewed_at   timestamptz,
  review_note   text check (review_note is null or length(review_note) <= 2000),
  published_url text check (published_url is null or (published_url ~ '^https://[^[:space:]]+$' and length(published_url) <= 500)),
  published_at  timestamptz,
  published_by  uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (status not in ('approved', 'rejected', 'published') or (reviewed_by is not null and reviewed_at is not null)),
  check ((status = 'published') = (published_url is not null and published_at is not null and published_by is not null)),
  check (status <> 'rejected' or coalesce(length(btrim(review_note)), 0) > 0)
);
create index content_drafts_status_idx on public.content_drafts (status, updated_at desc);

create function tebos_private.guard_content_draft() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_admin boolean := tebos_private.is_platform_admin();
begin
  if tg_op = 'DELETE' then
    raise exception 'drafts are kept: withdraw one instead' using errcode = '42501', hint = 'TEBOS_EVIDENCE_IMMUTABLE';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.reviewed_by is not null or new.published_url is not null then
      raise exception 'a new draft starts as a draft' using errcode = 'P0001', hint = 'TEBOS_ILLEGAL_TRANSITION';
    end if;
    if tebos_private.is_client() then
      new.author_id := auth.uid();
    end if;
    return new;
  end if;

  new.updated_at := now();
  if (new.author_id, new.created_at) is distinct from (old.author_id, old.created_at) then
    raise exception 'who wrote a draft never changes' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  -- the words change only while it's a draft
  if old.status <> 'draft' and (new.channel, new.title, new.body) is distinct from (old.channel, old.title, old.body) then
    raise exception 'pull it back to a draft to change it' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;

  if new.status is distinct from old.status then
    if not (
         (old.status = 'draft' and new.status in ('in_review', 'withdrawn'))
      or (old.status = 'in_review' and new.status in ('approved', 'rejected', 'draft', 'withdrawn'))
      or (old.status = 'rejected' and new.status in ('draft', 'withdrawn'))
      or (old.status = 'approved' and new.status in ('published', 'withdrawn'))) then
      raise exception 'a draft cannot go from % to %', old.status, new.status using errcode = 'P0001', hint = 'TEBOS_ILLEGAL_TRANSITION';
    end if;
    if tebos_private.is_client() then
      if new.status in ('approved', 'rejected') then
        if not v_admin then
          raise exception 'a platform admin approves what TEBOS publishes' using errcode = '42501', hint = 'TEBOS_NOT_APPROVER';
        end if;
        new.reviewed_by := auth.uid();
        new.reviewed_at := now();
      end if;
      if new.status = 'published' then
        new.published_by := auth.uid();
        new.published_at := now();
      end if;
    end if;
    -- back to a draft: the old review no longer applies
    if new.status = 'draft' then
      new.reviewed_by := null;
      new.reviewed_at := null;
    end if;
  elsif tebos_private.is_client()
        and (new.reviewed_by, new.reviewed_at, new.published_by, new.published_at, new.published_url)
            is distinct from (old.reviewed_by, old.reviewed_at, old.published_by, old.published_at, old.published_url) then
    raise exception 'reviews and publishing are recorded with a status change' using errcode = '42501', hint = 'TEBOS_SERVER_ONLY';
  end if;
  if old.status in ('approved', 'rejected', 'published') and new.review_note is distinct from old.review_note and new.status <> 'draft' then
    raise exception 'a decided review can''t be edited' using errcode = 'P0001', hint = 'TEBOS_INPUT_FROZEN';
  end if;
  return new;
end $$;

create trigger guard before insert or update or delete on public.content_drafts
  for each row execute function tebos_private.guard_content_draft();
create trigger audit after insert or update or delete on public.content_drafts
  for each row execute function tebos_private.audit_row();

alter table public.content_drafts enable row level security;
revoke all on public.content_drafts from anon, authenticated;
create policy staff_read on public.content_drafts for select to authenticated
  using (tebos_private.is_staff(array['sales', 'maintainer']));
create policy staff_write on public.content_drafts for insert to authenticated
  with check (tebos_private.is_staff(array['sales', 'maintainer']));
-- staff move their own drafts; admins review and can act on any
create policy staff_update on public.content_drafts for update to authenticated
  using (tebos_private.is_platform_admin() or (tebos_private.is_staff(array['sales', 'maintainer']) and author_id = auth.uid()))
  with check (tebos_private.is_platform_admin() or (tebos_private.is_staff(array['sales', 'maintainer']) and author_id = auth.uid()));
grant select, insert on public.content_drafts to authenticated;
grant update (channel, title, body, status, review_note, published_url) on public.content_drafts to authenticated;
grant all on public.content_drafts to service_role;
