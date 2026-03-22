-- Rollback: removes sops.last_edited_by (reverses 20260324100000_sops_last_edited_by.sql).
--
-- When to apply
--   Run this migration (or paste the same SQL in the Supabase SQL editor) when you want
--   the database to match an app version that does not use last_edited_by — for example
--   you tested on a feature branch but decided to stay on main without this feature.
--
-- Branching / ordering
--   • If this file exists in the repo next to 20260324100000, a full migration run
--     (e.g. fresh project) will apply ADD then DROP, so the column will not exist.
--     That matches “main without the feature” only if your deployed code also omits
--     last_edited_by. Do not deploy the feature branch’s app code after both have run.
--   • To keep testing the feature locally, apply migrations only up to 20260324100000,
--     or omit this file from the branch until you are reverting the DB.
--
-- Safe order on an existing DB that already has last_edited_by: applying this migration
-- drops the column; deploy code that does not SELECT that column.

alter table sops drop column if exists last_edited_by;
