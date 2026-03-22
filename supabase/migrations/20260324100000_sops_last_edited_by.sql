-- Track who last saved an SOP (owner sync, or super user editing someone else's SOP).
alter table sops add column if not exists last_edited_by uuid references auth.users(id) on delete set null;

update sops set last_edited_by = owner where last_edited_by is null;

comment on column sops.last_edited_by is 'Auth user who last saved this SOP row (sync/publish); differs from owner when a super user edits.';
