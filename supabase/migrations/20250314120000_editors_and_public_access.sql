-- Editors and domain-based access (magna.co.uk)
-- Run this migration after enabling Google OAuth in Supabase.
--
-- To add editors: in Supabase SQL Editor or Table Editor (use service role if RLS blocks),
--   insert into allowed_editors (user_id) values ('<user-uuid>');
-- Get user UUID from Authentication -> Users in Supabase dashboard after they sign in once.

-- Table: only these users can create SOPs and publish
create table if not exists allowed_editors (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table allowed_editors enable row level security;

-- Users can only see whether they themselves are an editor (for UI)
create policy "Users can read own editor status" on allowed_editors
  for select using (auth.uid() = user_id);

-- Drop existing sops policies so we can replace with new logic
drop policy if exists "Users can view their own sops" on sops;
drop policy if exists "Users can insert their own sops" on sops;
drop policy if exists "Users can update their own sops" on sops;
drop policy if exists "Users can delete their own sops" on sops;
drop policy if exists "Anyone can view published sops" on sops;

-- Any authenticated user (magna.co.uk via Google) can view all SOPs
create policy "Authenticated users can view all sops" on sops
  for select using (auth.uid() is not null);

-- Only editors can create SOPs
create policy "Editors can insert sops" on sops
  for insert with check (
    exists (select 1 from allowed_editors where user_id = auth.uid())
  );

-- Only editors can update/delete (e.g. publish); owner check for "own" is implied by app
create policy "Editors can update sops" on sops
  for update using (
    exists (select 1 from allowed_editors where user_id = auth.uid())
  );

create policy "Editors can delete sops" on sops
  for delete using (
    exists (select 1 from allowed_editors where user_id = auth.uid())
  );

-- sop_steps: any authenticated user can view all steps
drop policy if exists "Anyone can view steps of published sops" on sop_steps;
create policy "Authenticated users can view all steps" on sop_steps
  for select using (auth.uid() is not null);

-- step_annotations: any authenticated user can view all annotations
drop policy if exists "Anyone can view annotations of published sops" on step_annotations;
create policy "Authenticated users can view all annotations" on step_annotations
  for select using (auth.uid() is not null);
