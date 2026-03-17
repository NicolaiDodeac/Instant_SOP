-- Add thumbnail_path to sop_steps for step video thumbnails
alter table sop_steps
  add column if not exists thumbnail_path text;
