-- Editors may only change annotations on SOPs they own (handled by
-- "Users can manage annotations of their own sops"). Super users may change any
-- ("Super users can manage any step_annotations").
-- Remove the broad "Editors can manage step_annotations" if it exists.
drop policy if exists "Editors can manage step_annotations" on step_annotations;
