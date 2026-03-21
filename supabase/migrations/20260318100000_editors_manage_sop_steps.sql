-- Allow editors to insert/update/delete SOP steps.
-- Viewing steps is already allowed for any authenticated user (see editors_and_public_access).

drop policy if exists "Editors can manage sop_steps" on sop_steps;

create policy "Editors can manage sop_steps" on sop_steps
  for all
  using (
    exists (select 1 from allowed_editors where user_id = auth.uid())
  )
  with check (
    exists (select 1 from allowed_editors where user_id = auth.uid())
  );

