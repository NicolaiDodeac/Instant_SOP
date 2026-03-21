-- Allow async jobs for speed-up segment (same table as cut).

alter table video_processing_jobs drop constraint if exists video_processing_jobs_kind_check;

alter table video_processing_jobs
  add constraint video_processing_jobs_kind_check
  check (kind in ('cut', 'speed'));
