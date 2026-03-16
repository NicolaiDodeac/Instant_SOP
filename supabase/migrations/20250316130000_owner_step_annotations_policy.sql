-- 1) SOP owners can manage step_annotations for their own SOPs.
drop policy if exists "Users can manage annotations of their own sops" on step_annotations;
create policy "Users can manage annotations of their own sops" on step_annotations
  for all using (
    exists (
      select 1 from sop_steps st
      join sops s on s.id = st.sop_id
      where st.id = step_annotations.step_id and s.owner = auth.uid()
    )
  );

-- 2) Editors may only change annotations on SOPs they own (no extra policy).
-- Super users may change any (policy in 20250316000000_editors_step_annotations.sql).
-- Drop the broad editors policy if it was added earlier, so editors cannot change other users' SOPs.
drop policy if exists "Editors can manage step_annotations" on step_annotations;
