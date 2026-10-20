-- The media library: one place where BAME's staff keep the images the website uses (player photos now; other
-- sections through TEBOS change requests). Files sit in a public bucket so the site can show them, under a folder
-- per uploader; every file has a record saying what it is for and that the uploader may publish it.

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid())
$$;
revoke all on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-media', 'site-media', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do nothing;

create table public.media_assets (
  id                 uuid primary key default gen_random_uuid(),
  storage_path       text not null unique check (storage_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$'),
  title              text not null check (length(btrim(title)) between 1 and 120),
  section            text not null default 'other'
                       check (section in ('player', 'gallery', 'event', 'partner', 'hero', 'other')),
  player_id          uuid references public.players (id) on delete set null,
  -- the uploader confirms BAME may publish the image, with the consent of anyone in it; no record exists without it
  publish_permission boolean not null check (publish_permission),
  uploaded_by        uuid not null default auth.uid() references auth.users (id),
  created_at         timestamptz not null default now()
);
create index media_assets_player_idx on public.media_assets (player_id);

alter table public.media_assets enable row level security;
revoke all on public.media_assets from anon, authenticated;
grant select, delete on public.media_assets to authenticated;
grant insert (storage_path, title, section, player_id, publish_permission) on public.media_assets to authenticated;
grant update (title, section, player_id) on public.media_assets to authenticated;

create policy "staff read media" on public.media_assets for select to authenticated using (public.is_staff());
create policy "staff add own media" on public.media_assets for insert to authenticated
  with check (public.is_staff() and uploaded_by = auth.uid() and split_part(storage_path, '/', 1) = auth.uid()::text);
create policy "uploader or admin edits media" on public.media_assets for update to authenticated
  using (uploaded_by = auth.uid() or public.is_staff_admin())
  with check (uploaded_by = auth.uid() or public.is_staff_admin());
create policy "uploader or admin removes media" on public.media_assets for delete to authenticated
  using (uploaded_by = auth.uid() or public.is_staff_admin());

-- files: staff upload only into their own folder; the uploader or an admin removes them. Reading is by public URL.
create policy "staff upload site media" on storage.objects for insert to authenticated
  with check (bucket_id = 'site-media' and public.is_staff() and (storage.foldername(name))[1] = auth.uid()::text);
create policy "staff list site media" on storage.objects for select to authenticated
  using (bucket_id = 'site-media' and public.is_staff());
create policy "uploader or admin deletes site media" on storage.objects for delete to authenticated
  using (bucket_id = 'site-media' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff_admin()));
