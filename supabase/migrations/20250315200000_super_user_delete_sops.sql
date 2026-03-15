-- Super users can delete any SOP; editors can delete only their own.
--
-- To add a super user (run in Supabase SQL Editor with sufficient privileges):
--   insert into super_users (user_id) values ('<user-uuid>');
-- Get user UUID from Authentication -> Users in Supabase dashboard.

-- Table: users in this set can delete any SOP
create table if not exists super_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table super_users enable row level security;

-- Users can only see whether they themselves are a super user (for UI/API)
create policy "Users can read own super user status" on super_users
  for select using (auth.uid() = user_id);

-- Replace the single "Editors can delete sops" policy with two policies:
-- 1) Super users can delete any SOP
-- 2) Editors can delete only SOPs they own
drop policy if exists "Editors can delete sops" on sops;

create policy "Super users can delete any sop" on sops
  for delete using (
    exists (select 1 from super_users where user_id = auth.uid())
  );

create policy "Editors can delete own sops" on sops
  for delete using (
    owner = auth.uid()
    and exists (select 1 from allowed_editors where user_id = auth.uid())
  );
