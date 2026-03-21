-- Async video processing (cut, future: speed). Jobs are created by API; worker updates status.

create table if not exists video_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  sop_id uuid references sops(id) on delete cascade not null,
  step_id uuid references sop_steps(id) on delete cascade not null,
  kind text not null check (kind in ('cut')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  payload jsonb not null default '{}',
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_video_jobs_user on video_processing_jobs(user_id);
create index if not exists idx_video_jobs_step on video_processing_jobs(step_id);
create index if not exists idx_video_jobs_status on video_processing_jobs(status);

alter table video_processing_jobs enable row level security;

-- Users can read only their own jobs (API also validates)
create policy "Users read own video jobs" on video_processing_jobs
  for select using (user_id = auth.uid());
