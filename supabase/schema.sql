-- AR SOP Builder Database Schema
-- Run this in your Supabase SQL editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- SOPs table
create table if not exists sops (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  owner uuid references auth.users(id) on delete cascade not null,
  published boolean default false,
  share_slug text unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- SOP Steps table
create table if not exists sop_steps (
  id uuid primary key default gen_random_uuid(),
  sop_id uuid references sops(id) on delete cascade not null,
  idx int not null,
  title text not null,
  instructions text,
  video_path text,   -- storage path in sop-videos bucket
  duration_ms int,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Step Annotations table
create table if not exists step_annotations (
  id uuid primary key default gen_random_uuid(),
  step_id uuid references sop_steps(id) on delete cascade not null,
  t_start_ms int not null,
  t_end_ms int not null,
  kind text not null check (kind in ('arrow','label')),
  x float8 not null check (x >= 0 and x <= 1),  -- normalized [0..1]
  y float8 not null check (y >= 0 and y <= 1),  -- normalized [0..1]
  angle float8,  -- for arrows (degrees)
  text text,     -- for labels
  style jsonb,   -- { color, fontSize, strokeWidth }
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable Row Level Security
alter table sops enable row level security;
alter table sop_steps enable row level security;
alter table step_annotations enable row level security;

-- RLS Policies for sops
create policy "Users can view their own sops" on sops
  for select using (owner = auth.uid());

create policy "Users can insert their own sops" on sops
  for insert with check (owner = auth.uid());

create policy "Users can update their own sops" on sops
  for update using (owner = auth.uid());

create policy "Users can delete their own sops" on sops
  for delete using (owner = auth.uid());

create policy "Anyone can view published sops" on sops
  for select using (published = true);

-- RLS Policies for sop_steps
create policy "Users can manage steps of their own sops" on sop_steps
  for all using (
    exists (
      select 1 from sops s
      where s.id = sop_steps.sop_id and s.owner = auth.uid()
    )
  );

create policy "Anyone can view steps of published sops" on sop_steps
  for select using (
    exists (
      select 1 from sops s
      where s.id = sop_steps.sop_id and s.published = true
    )
  );

-- RLS Policies for step_annotations
create policy "Users can manage annotations of their own sops" on step_annotations
  for all using (
    exists (
      select 1 from sop_steps st
      join sops s on s.id = st.sop_id
      where st.id = step_annotations.step_id and s.owner = auth.uid()
    )
  );

create policy "Anyone can view annotations of published sops" on step_annotations
  for select using (
    exists (
      select 1 from sop_steps st
      join sops s on s.id = st.sop_id
      where st.id = step_annotations.step_id and s.published = true
    )
  );

-- Indexes for performance
create index if not exists idx_sops_owner on sops(owner);
create index if not exists idx_sops_share_slug on sops(share_slug);
create index if not exists idx_sop_steps_sop_id on sop_steps(sop_id);
create index if not exists idx_step_annotations_step_id on step_annotations(step_id);

-- Create storage bucket for videos
insert into storage.buckets (id, name, public)
values ('sop-videos', 'sop-videos', false)
on conflict (id) do nothing;

-- Storage policies for sop-videos bucket
create policy "Users can upload their own videos" on storage.objects
  for insert with check (
    bucket_id = 'sop-videos' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can view their own videos" on storage.objects
  for select using (
    bucket_id = 'sop-videos' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete their own videos" on storage.objects
  for delete using (
    bucket_id = 'sop-videos' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Function to update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Triggers for updated_at
create trigger update_sops_updated_at before update on sops
  for each row execute function update_updated_at_column();

create trigger update_sop_steps_updated_at before update on sop_steps
  for each row execute function update_updated_at_column();

create trigger update_step_annotations_updated_at before update on step_annotations
  for each row execute function update_updated_at_column();
