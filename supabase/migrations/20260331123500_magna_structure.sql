-- Magna structure: SOP numbers + modules + line/leg/machine hierarchy + machine family stations + SOP attachments.
-- Run as a single migration (or paste into Supabase SQL editor).

-- ---------------------------------------------------------------------------
-- 0) SOP numeric number (for OPL/supervisor communication)
-- ---------------------------------------------------------------------------

create sequence if not exists sop_number_seq;
grant usage, select on sequence sop_number_seq to authenticated;

alter table sops
  add column if not exists sop_number integer;

-- Ensure next number is always > current max (safe to re-run).
select setval(
  'sop_number_seq',
  coalesce((select max(sop_number) from sops), 0) + 1,
  false
);

alter table sops
  alter column sop_number set default nextval('sop_number_seq');

create unique index if not exists sops_sop_number_unique
  on sops (sop_number)
  where sop_number is not null;

-- ---------------------------------------------------------------------------
-- 1) Training modules (topics like Loading reel, Changeover, Cleaning)
-- ---------------------------------------------------------------------------

create table if not exists training_modules (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table training_modules enable row level security;

drop policy if exists "Authenticated users can view training_modules" on training_modules;
create policy "Authenticated users can view training_modules" on training_modules
  for select using (auth.uid() is not null);

drop policy if exists "Editors can manage training_modules" on training_modules;
create policy "Editors can manage training_modules" on training_modules
  for all
  using (exists (select 1 from allowed_editors where user_id = auth.uid()))
  with check (exists (select 1 from allowed_editors where user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 2) Machine families (Stampac, Sensani, TLSW...) + optional supplier
-- ---------------------------------------------------------------------------

create table if not exists machine_families (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  supplier text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table machine_families enable row level security;

drop policy if exists "Authenticated users can view machine_families" on machine_families;
create policy "Authenticated users can view machine_families" on machine_families
  for select using (auth.uid() is not null);

drop policy if exists "Editors can manage machine_families" on machine_families;
create policy "Editors can manage machine_families" on machine_families
  for all
  using (exists (select 1 from allowed_editors where user_id = auth.uid()))
  with check (exists (select 1 from allowed_editors where user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 3) Lines and Legs (Line 3 -> Leg 1/Leg 2)
-- ---------------------------------------------------------------------------

create table if not exists lines (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table lines enable row level security;

drop policy if exists "Authenticated users can view lines" on lines;
create policy "Authenticated users can view lines" on lines
  for select using (auth.uid() is not null);

drop policy if exists "Editors can manage lines" on lines;
create policy "Editors can manage lines" on lines
  for all
  using (exists (select 1 from allowed_editors where user_id = auth.uid()))
  with check (exists (select 1 from allowed_editors where user_id = auth.uid()));

create table if not exists line_legs (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references lines(id) on delete cascade,
  code text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (line_id, code)
);

create index if not exists line_legs_line_id_idx on line_legs(line_id);

alter table line_legs enable row level security;

drop policy if exists "Authenticated users can view line_legs" on line_legs;
create policy "Authenticated users can view line_legs" on line_legs
  for select using (auth.uid() is not null);

drop policy if exists "Editors can manage line_legs" on line_legs;
create policy "Editors can manage line_legs" on line_legs
  for all
  using (exists (select 1 from allowed_editors where user_id = auth.uid()))
  with check (exists (select 1 from allowed_editors where user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 4) Machines (instances on a specific leg), linked to family
-- ---------------------------------------------------------------------------

create table if not exists machines (
  id uuid primary key default gen_random_uuid(),
  line_leg_id uuid not null references line_legs(id) on delete cascade,
  machine_family_id uuid not null references machine_families(id) on delete restrict,
  code text,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists machines_line_leg_id_idx on machines(line_leg_id);
create index if not exists machines_machine_family_id_idx on machines(machine_family_id);
create unique index if not exists machines_leg_name_unique on machines(line_leg_id, name);

alter table machines enable row level security;

drop policy if exists "Authenticated users can view machines" on machines;
create policy "Authenticated users can view machines" on machines
  for select using (auth.uid() is not null);

drop policy if exists "Editors can manage machines" on machines;
create policy "Editors can manage machines" on machines
  for all
  using (exists (select 1 from allowed_editors where user_id = auth.uid()))
  with check (exists (select 1 from allowed_editors where user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 5) Machine family stations (HMI station codes consistent across family)
-- ---------------------------------------------------------------------------

create table if not exists machine_family_stations (
  id uuid primary key default gen_random_uuid(),
  machine_family_id uuid not null references machine_families(id) on delete cascade,
  station_code integer not null,
  name text not null,
  section text not null,
  sort_order integer,
  keywords text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (machine_family_id, station_code)
);

create index if not exists machine_family_stations_family_idx on machine_family_stations(machine_family_id);
create index if not exists machine_family_stations_code_idx on machine_family_stations(machine_family_id, station_code);

alter table machine_family_stations enable row level security;

drop policy if exists "Authenticated users can view machine_family_stations" on machine_family_stations;
create policy "Authenticated users can view machine_family_stations" on machine_family_stations
  for select using (auth.uid() is not null);

drop policy if exists "Editors can manage machine_family_stations" on machine_family_stations;
create policy "Editors can manage machine_family_stations" on machine_family_stations
  for all
  using (exists (select 1 from allowed_editors where user_id = auth.uid()))
  with check (exists (select 1 from allowed_editors where user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 6) SOP attachment tables (reuse standard SOPs + add-ons by scope)
-- ---------------------------------------------------------------------------

create table if not exists sop_training_modules (
  sop_id uuid not null references sops(id) on delete cascade,
  training_module_id uuid not null references training_modules(id) on delete cascade,
  primary key (sop_id, training_module_id)
);

create table if not exists sop_machine_families (
  sop_id uuid not null references sops(id) on delete cascade,
  machine_family_id uuid not null references machine_families(id) on delete cascade,
  primary key (sop_id, machine_family_id)
);

create table if not exists sop_lines (
  sop_id uuid not null references sops(id) on delete cascade,
  line_id uuid not null references lines(id) on delete cascade,
  primary key (sop_id, line_id)
);

create table if not exists sop_line_legs (
  sop_id uuid not null references sops(id) on delete cascade,
  line_leg_id uuid not null references line_legs(id) on delete cascade,
  primary key (sop_id, line_leg_id)
);

create table if not exists sop_machines (
  sop_id uuid not null references sops(id) on delete cascade,
  machine_id uuid not null references machines(id) on delete cascade,
  primary key (sop_id, machine_id)
);

create table if not exists sop_machine_family_stations (
  sop_id uuid not null references sops(id) on delete cascade,
  station_id uuid not null references machine_family_stations(id) on delete cascade,
  primary key (sop_id, station_id)
);

-- Indexes for lookup in each direction
create index if not exists sop_training_modules_module_idx on sop_training_modules(training_module_id);
create index if not exists sop_machine_families_family_idx on sop_machine_families(machine_family_id);
create index if not exists sop_lines_line_idx on sop_lines(line_id);
create index if not exists sop_line_legs_leg_idx on sop_line_legs(line_leg_id);
create index if not exists sop_machines_machine_idx on sop_machines(machine_id);
create index if not exists sop_family_stations_station_idx on sop_machine_family_stations(station_id);

-- Enable RLS and policies for attachment tables (read for all auth, write for editors)
alter table sop_training_modules enable row level security;
alter table sop_machine_families enable row level security;
alter table sop_lines enable row level security;
alter table sop_line_legs enable row level security;
alter table sop_machines enable row level security;
alter table sop_machine_family_stations enable row level security;

-- Select policies
drop policy if exists "Authenticated users can view sop_training_modules" on sop_training_modules;
create policy "Authenticated users can view sop_training_modules" on sop_training_modules
  for select using (auth.uid() is not null);

drop policy if exists "Authenticated users can view sop_machine_families" on sop_machine_families;
create policy "Authenticated users can view sop_machine_families" on sop_machine_families
  for select using (auth.uid() is not null);

drop policy if exists "Authenticated users can view sop_lines" on sop_lines;
create policy "Authenticated users can view sop_lines" on sop_lines
  for select using (auth.uid() is not null);

drop policy if exists "Authenticated users can view sop_line_legs" on sop_line_legs;
create policy "Authenticated users can view sop_line_legs" on sop_line_legs
  for select using (auth.uid() is not null);

drop policy if exists "Authenticated users can view sop_machines" on sop_machines;
create policy "Authenticated users can view sop_machines" on sop_machines
  for select using (auth.uid() is not null);

drop policy if exists "Authenticated users can view sop_machine_family_stations" on sop_machine_family_stations;
create policy "Authenticated users can view sop_machine_family_stations" on sop_machine_family_stations
  for select using (auth.uid() is not null);

-- Manage policies (editors only)
drop policy if exists "Editors can manage sop_training_modules" on sop_training_modules;
create policy "Editors can manage sop_training_modules" on sop_training_modules
  for all
  using (exists (select 1 from allowed_editors where user_id = auth.uid()))
  with check (exists (select 1 from allowed_editors where user_id = auth.uid()));

drop policy if exists "Editors can manage sop_machine_families" on sop_machine_families;
create policy "Editors can manage sop_machine_families" on sop_machine_families
  for all
  using (exists (select 1 from allowed_editors where user_id = auth.uid()))
  with check (exists (select 1 from allowed_editors where user_id = auth.uid()));

drop policy if exists "Editors can manage sop_lines" on sop_lines;
create policy "Editors can manage sop_lines" on sop_lines
  for all
  using (exists (select 1 from allowed_editors where user_id = auth.uid()))
  with check (exists (select 1 from allowed_editors where user_id = auth.uid()));

drop policy if exists "Editors can manage sop_line_legs" on sop_line_legs;
create policy "Editors can manage sop_line_legs" on sop_line_legs
  for all
  using (exists (select 1 from allowed_editors where user_id = auth.uid()))
  with check (exists (select 1 from allowed_editors where user_id = auth.uid()));

drop policy if exists "Editors can manage sop_machines" on sop_machines;
create policy "Editors can manage sop_machines" on sop_machines
  for all
  using (exists (select 1 from allowed_editors where user_id = auth.uid()))
  with check (exists (select 1 from allowed_editors where user_id = auth.uid()));

drop policy if exists "Editors can manage sop_machine_family_stations" on sop_machine_family_stations;
create policy "Editors can manage sop_machine_family_stations" on sop_machine_family_stations
  for all
  using (exists (select 1 from allowed_editors where user_id = auth.uid()))
  with check (exists (select 1 from allowed_editors where user_id = auth.uid()));

