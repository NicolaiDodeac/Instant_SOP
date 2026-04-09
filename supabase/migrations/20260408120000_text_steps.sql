-- Add text steps (slide-like) to SOP steps.
-- A "text" step is a template page with title + bullet points and simple layout controls.

alter table sop_steps
  add column if not exists kind text not null default 'media'
    check (kind in ('media', 'text'));

alter table sop_steps
  add column if not exists text_payload jsonb;

-- Backfill: any existing rows stay as 'media' by default.

