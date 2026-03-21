-- Videos are stored in Cloudflare R2. Remove legacy Supabase Storage policies for sop-videos.
--
-- Supabase blocks direct DELETE on storage.objects / storage.buckets from SQL (see storage.protect_delete).
-- After this migration runs, delete the bucket in the Dashboard if it still exists:
--   Storage → sop-videos → bucket menu → Delete bucket
-- (or empty the bucket first, then delete.)

drop policy if exists "Users can upload their own videos" on storage.objects;
drop policy if exists "Users can view their own videos" on storage.objects;
drop policy if exists "Users can delete their own videos" on storage.objects;
