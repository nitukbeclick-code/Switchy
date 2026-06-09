-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║  חוסך — Storage setup for community media (images / voice / video)       ║
-- ║  Run after schema.sql. Creates a public bucket and scoped RLS so each     ║
-- ║  user can only upload/delete under their own uid folder.                  ║
-- ╚════════════════════════════════════════════════════════════════════════╝

-- Public bucket (you can also create it in Dashboard → Storage). Public = anyone
-- can READ the files; writing is still gated by the policies below.
insert into storage.buckets (id, name, public)
values ('community-media', 'community-media', true)
on conflict (id) do nothing;

-- Anyone (incl. anon) can read media — the community feed is public.
drop policy if exists "community_media_read" on storage.objects;
create policy "community_media_read" on storage.objects
  for select using (bucket_id = 'community-media');

-- Authenticated users may upload only into a folder named after their own uid,
-- e.g.  community-media/<auth.uid()>/<filename>
drop policy if exists "community_media_insert_own" on storage.objects;
create policy "community_media_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'community-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ...and delete only their own files.
drop policy if exists "community_media_delete_own" on storage.objects;
create policy "community_media_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'community-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Flow from Flutter:
--   1. Upload bytes to  community-media/<uid>/<uuid>.<ext>  via supabase.storage.
--   2. Take the public URL and store it in community_posts.media_url
--      (with media_type = image | video | audio).
-- This keeps the heavy bytes out of Postgres and the table lean.
