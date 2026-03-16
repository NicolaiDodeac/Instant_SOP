-- Editors can update only their own SOPs (owner = auth.uid()); that's already
-- covered by "Users can manage annotations of their own sops".
-- Only super users can update any SOP's annotations.

drop policy if exists "Editors can manage step_annotations" on step_annotations;

create policy "Super users can manage any step_annotations" on step_annotations
  for all using (
    exists (select 1 from super_users where user_id = auth.uid())
  );
