-- Editors may only update their own SOPs (owner = auth.uid()); super users may update any.
-- sop_steps: replace blanket editor policy with owner-based + super user (owner policy may be missing on migration-only DBs).

drop policy if exists "Editors can update sops" on sops;

create policy "Editors can update own sops" on sops
  for update using (
    owner = auth.uid()
    and exists (select 1 from allowed_editors where user_id = auth.uid())
  )
  with check (
    owner = auth.uid()
    and exists (select 1 from allowed_editors where user_id = auth.uid())
  );

create policy "Super users can update any sop" on sops
  for update using (
    exists (select 1 from super_users where user_id = auth.uid())
  )
  with check (
    exists (select 1 from super_users where user_id = auth.uid())
  );

drop policy if exists "Editors can manage sop_steps" on sop_steps;

drop policy if exists "Users can manage steps of their own sops" on sop_steps;

create policy "Users can manage steps of their own sops" on sop_steps
  for all using (
    exists (
      select 1 from sops s
      where s.id = sop_steps.sop_id and s.owner = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from sops s
      where s.id = sop_steps.sop_id and s.owner = auth.uid()
    )
  );

create policy "Super users can manage any sop_steps" on sop_steps
  for all using (
    exists (select 1 from super_users where user_id = auth.uid())
  )
  with check (
    exists (select 1 from super_users where user_id = auth.uid())
  );
