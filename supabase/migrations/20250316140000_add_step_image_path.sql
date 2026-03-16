-- Add optional image_path to sop_steps (screenshots/photos per step)
alter table sop_steps add column if not exists image_path text;
