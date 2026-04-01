-- Seed template for Magna SOP structure.
-- Run AFTER `supabase/migrations/20260331123500_magna_structure.sql`.
--
-- This is a TEMPLATE: it seeds:
-- - Lines: 1C, 2A, 3A, 4A, 5A
-- - Legs: Leg 1 + Leg 2 for each line
-- - Machine families (with supplier labels you provided)
-- - Training modules
-- - Wrapper(Stampac) station codes (from your HMI screenshot)
--
-- TODO (you will fill in next): actual machines per line/leg (instances) with correct families.
--   Search for "TODO: MACHINES" in this file.

begin;

-- ---------------------------------------------------------------------------
-- 1) Lines + legs
-- ---------------------------------------------------------------------------

with ins_lines as (
  insert into lines (code, name, active)
  values
    ('1', 'Line 1', true),
    ('2', 'Line 2', true),
    ('3', 'Line 3', true)
  on conflict (code) do update
    set name = excluded.name,
        active = excluded.active,
        updated_at = now()
  returning id, code
),
ins_legs as (
  insert into line_legs (line_id, code, name, active)
  select l.id, 'LEG_1', 'Leg 1', true from ins_lines l
  union all
  select l.id, 'LEG_2', 'Leg 2', true from ins_lines l
  on conflict (line_id, code) do update
    set name = excluded.name,
        active = excluded.active,
        updated_at = now()
  returning id, line_id, code
)
select 1;

-- ---------------------------------------------------------------------------
-- 2) Machine families (codes are stable identifiers used by the app)
-- ---------------------------------------------------------------------------

insert into machine_families (code, name, supplier, active)
values
  -- Cartoners
  ('CARTONER_SENSANI', 'Cartoner (Sensani)', 'Sensani', true),
  ('CARTONER_BRADMAN_BRISTOL', 'Cartoner (Bradman Bristol)', 'Bradman Bristol', true),

  -- Case packers
  ('CASE_PACKER_BRADMAN_BECCLES', 'Case Packer (Bradman Beccles)', 'Bradman Beccles', true),
  ('CASE_PACKER_WRAPAROUND_BRADMAN', 'Case Packer (Wraparound Bradman)', 'Bradman', true),
  ('CASE_PACKER_TLSW', 'Case Packer (TLSW)', 'TLSW', true),
  ('CASE_PACKER_CAMA', 'Case Packer (Cama)', 'Cama', true),

  -- Conveyance
  ('CELLUVEYOR_CELLUMATION', 'Celluveyor (Cellumation)', 'Cellumation', true),
  ('CHECKWEIGHER_THERMO', 'Checkweigher (Thermo)', 'Thermo', true),
  ('CONVEYOR_VICON', 'Conveyor (Vicon)', 'Vicon', true),
  ('CONVEYOR_NA', 'Conveyor (N/A)', null, true),
  ('INCLINE_CONVEYOR_VICON', 'Incline Conveyor (Vicon)', 'Vicon', true),

  -- Loaders / robotics
  ('LOADER_BRADMAN_BRISTOL', 'Loader (Bradman Bristol)', 'Bradman Bristol', true),
  ('PICK_N_PLACE_STAUBLI', 'Pick n Place (Staubli)', 'Staubli', true),

  -- Pallet / buffer
  ('PALLETISER_MAGNA', 'Palletiser (Magna)', 'Magna', true),
  ('PATERNOSTER_MAGNA', 'Paternoster (Magna)', 'Magna', true),

  -- Printing / marking
  ('PRINTER_LASER_MARKEM_IMAJE', 'Printer Laser (MARKEM-IMAJE LTD)', 'MARKEM-IMAJE LTD', true),
  ('PRINTER_INK_JET_MARKEM_IMAJE', 'Printer Ink Jet (MARKEM-IMAJE LTD)', 'MARKEM-IMAJE LTD', true),
  ('PRINTER_THERMAL_INK_MARKEM_IMAJE', 'Printer Thermal Ink (MARKEM-IMAJE LTD)', 'MARKEM-IMAJE LTD', true),

  -- Other
  ('SERVO_POD_PODMORE', 'Servo Pod (Podmore)', 'Podmore', true),
  ('WRAPPER_STAMPAC', 'Wrapper (Stampac)', 'Stampac', true),
  ('X_RAY_THERMO', 'X-Ray (Thermo)', 'Thermo', true)
on conflict (code) do update
  set name = excluded.name,
      supplier = excluded.supplier,
      active = excluded.active,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- 3) Training modules
-- ---------------------------------------------------------------------------

insert into training_modules (code, name, description, active)
values
  ('LOADING_REEL', 'Loading reel', null, true),
  ('CHANGEOVER', 'Changeover', null, true),
  ('CLEANING', 'Cleaning', null, true),
  ('FAULT_CLEARING', 'Fault clearing / troubleshooting', null, true),
  ('LOADING_MAGAZINES', 'Loading magazines', null, true),
  ('OTHER', 'Other', 'Use this when no module fits; add a better module later.', true)
on conflict (code) do update
  set name = excluded.name,
      description = excluded.description,
      active = excluded.active,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- 4) Wrapper (Stampac) stations from HMI screenshot
-- ---------------------------------------------------------------------------

with stampac as (
  select id from machine_families where code = 'WRAPPER_STAMPAC'
),
ins as (
  insert into machine_family_stations (
    machine_family_id,
    station_code,
    name,
    section,
    sort_order,
    active
  )
  select
    stampac.id,
    v.station_code,
    v.name,
    v.section,
    v.sort_order,
    true
  from stampac
  join (
    values
      (1003, 'HMI', 'HMI', 5),
      (1100, 'Transport', 'Transport', 90),
      (1200, 'Unwinder / reel loading', 'Unwinder', 20),
      (1600, 'Marking / printing', 'Laser', 45),
      (1700, 'Inspection', 'Camera', 40),
      (1800, 'Sealing & cutting', 'Cutting', 70),
      (1900, 'Shaping', 'Shaping', 60),
      (2000, 'Shaping', 'Shaping', 61),
      (2100, 'Infeed', 'Infeed', 10),
      (2200, 'Loading', 'Loading', 50),
      (2250, 'Folding', 'Folding', 55),
      (2300, 'Folding', 'Folding', 56),
      (2400, 'Sealing & cutting', 'Sealing', 65),
      (2600, 'Outfeed', 'Unload unit', 80),
      (2700, 'Outfeed', 'Outfeed', 85),
      (2800, 'Marking / printing', 'Labeler / Printer', 42),
      (3000, 'Waste / foil', 'Foil rest disposal', 95),
      (4400, 'Rack turning', 'Rack turning', 15)
  ) as v(station_code, section, name, sort_order) on true
  on conflict (machine_family_id, station_code) do update
    set name = excluded.name,
        section = excluded.section,
        sort_order = excluded.sort_order,
        active = true,
        updated_at = now()
  returning id
)
select count(*) as upserted_stampac_stations from ins;

-- ---------------------------------------------------------------------------
-- 5) TODO: Machines per line/leg (instances)
-- ---------------------------------------------------------------------------
-- You said both legs are usually very similar.
-- Below we seed machines for Lines 1–3 based on your current notes.
-- You can extend this section for more lines later.
--
-- Line 1: currently only Leg 1 has machines (we still keep Leg 2 seeded empty)
with leg as (
  select ll.id, ll.code as leg_code, ln.code as line_code
  from line_legs ll
  join lines ln on ln.id = ll.line_id
  where ln.code in ('1','2','3')
),
fam as (select id, code from machine_families)
insert into machines (line_leg_id, machine_family_id, code, name, active)
select leg.id, fam.id, null, m.name, true
from leg
join (
  values
    ('1', 'LEG_1', 'WRAPPER_STAMPAC', 'Stampac Wrapper'),
    ('1', 'LEG_1', 'CARTONER_SENSANI', 'Sensani Cartoner'),
    ('1', 'LEG_1', 'CASE_PACKER_WRAPAROUND_BRADMAN', 'Case Packer (Wraparound)')
) as m(line_code, leg_code, family_code, name)
  on m.line_code = leg.line_code and m.leg_code = leg.leg_code
join fam on fam.code = m.family_code
on conflict (line_leg_id, name) do update
  set machine_family_id = excluded.machine_family_id,
      active = excluded.active,
      updated_at = now();

-- Line 2: both legs same set
with leg as (
  select ll.id, ll.code as leg_code, ln.code as line_code
  from line_legs ll
  join lines ln on ln.id = ll.line_id
  where ln.code in ('1','2','3')
),
fam as (select id, code from machine_families)
insert into machines (line_leg_id, machine_family_id, code, name, active)
select leg.id, fam.id, null, m.name, true
from leg
join (
  values
    ('2', 'LEG_1', 'PATERNOSTER_MAGNA', 'Paternoster'),
    ('2', 'LEG_1', 'WRAPPER_STAMPAC', 'Stampac Wrapper'),
    ('2', 'LEG_1', 'CARTONER_BRADMAN_BRISTOL', 'Bradman Bristol Cartoner'),
    ('2', 'LEG_1', 'CHECKWEIGHER_THERMO', 'Checkweigher'),
    ('2', 'LEG_1', 'X_RAY_THERMO', 'X-Ray'),
    ('2', 'LEG_1', 'CASE_PACKER_CAMA', 'Case Packer (Cama)'),
    ('2', 'LEG_1', 'PALLETISER_MAGNA', 'Palletiser'),

    ('2', 'LEG_2', 'PATERNOSTER_MAGNA', 'Paternoster'),
    ('2', 'LEG_2', 'WRAPPER_STAMPAC', 'Stampac Wrapper'),
    ('2', 'LEG_2', 'CARTONER_BRADMAN_BRISTOL', 'Bradman Bristol Cartoner'),
    ('2', 'LEG_2', 'CHECKWEIGHER_THERMO', 'Checkweigher'),
    ('2', 'LEG_2', 'X_RAY_THERMO', 'X-Ray'),
    ('2', 'LEG_2', 'CASE_PACKER_CAMA', 'Case Packer (Cama)'),
    ('2', 'LEG_2', 'PALLETISER_MAGNA', 'Palletiser')
) as m(line_code, leg_code, family_code, name)
  on m.line_code = leg.line_code and m.leg_code = leg.leg_code
join fam on fam.code = m.family_code
on conflict (line_leg_id, name) do update
  set machine_family_id = excluded.machine_family_id,
      active = excluded.active,
      updated_at = now();

-- Line 3: both legs same set
with leg as (
  select ll.id, ll.code as leg_code, ln.code as line_code
  from line_legs ll
  join lines ln on ln.id = ll.line_id
  where ln.code in ('1','2','3')
),
fam as (select id, code from machine_families)
insert into machines (line_leg_id, machine_family_id, code, name, active)
select leg.id, fam.id, null, m.name, true
from leg
join (
  values
    ('3', 'LEG_1', 'PATERNOSTER_MAGNA', 'Paternoster'),
    ('3', 'LEG_1', 'WRAPPER_STAMPAC', 'Stampac Wrapper'),
    ('3', 'LEG_1', 'PICK_N_PLACE_STAUBLI', 'Pick and Place (Staubli)'),
    ('3', 'LEG_1', 'CARTONER_SENSANI', 'Sensani Cartoner'),
    ('3', 'LEG_1', 'X_RAY_THERMO', 'X-Ray'),
    ('3', 'LEG_1', 'CHECKWEIGHER_THERMO', 'Checkweigher'),
    ('3', 'LEG_1', 'CASE_PACKER_TLSW', 'Case Packer (TLSW)'),
    ('3', 'LEG_1', 'PALLETISER_MAGNA', 'Palletiser'),

    ('3', 'LEG_2', 'PATERNOSTER_MAGNA', 'Paternoster'),
    ('3', 'LEG_2', 'WRAPPER_STAMPAC', 'Stampac Wrapper'),
    ('3', 'LEG_2', 'PICK_N_PLACE_STAUBLI', 'Pick and Place (Staubli)'),
    ('3', 'LEG_2', 'CARTONER_SENSANI', 'Sensani Cartoner'),
    ('3', 'LEG_2', 'X_RAY_THERMO', 'X-Ray'),
    ('3', 'LEG_2', 'CHECKWEIGHER_THERMO', 'Checkweigher'),
    ('3', 'LEG_2', 'CASE_PACKER_TLSW', 'Case Packer (TLSW)'),
    ('3', 'LEG_2', 'PALLETISER_MAGNA', 'Palletiser')
) as m(line_code, leg_code, family_code, name)
  on m.line_code = leg.line_code and m.leg_code = leg.leg_code
join fam on fam.code = m.family_code
on conflict (line_leg_id, name) do update
  set machine_family_id = excluded.machine_family_id,
      active = excluded.active,
      updated_at = now();

commit;

