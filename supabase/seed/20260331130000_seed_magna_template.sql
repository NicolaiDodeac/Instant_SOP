-- Seed template for Magna SOP structure.
-- Run AFTER `supabase/migrations/20260331123500_magna_structure.sql`.
--
-- This is a TEMPLATE: it seeds:
-- - Lines 1–9 + one Advents line (code '10'); every line has Leg 1 + Leg 2 (line_legs LEG_1 / LEG_2)
-- - Machine families (with supplier labels you provided) + Denester
-- - Training modules
-- - Station codes / sections: Stampac (HMI screenshot + Faults), Sensani, Bradman cartoner,
--   wraparound / TLSW / Cama case packers, Denester, palletiser, paternoster, servo pod, banders
--
-- TODO (you will fill in next): actual machines per line/leg (instances) with correct families.
--   Search for "TODO: MACHINES" in this file.

begin;

-- ---------------------------------------------------------------------------
-- 1) Lines + legs (each line → Leg 1 + Leg 2; Advents is a single line with two legs)
-- ---------------------------------------------------------------------------

with ins_lines as (
  insert into lines (code, name, active)
  values
    ('1', 'Line 1', true),
    ('2', 'Line 2', true),
    ('3', 'Line 3', true),
    ('4', 'Line 4', true),
    ('5', 'Line 5', true),
    ('6', 'Line 6', true),
    ('7', 'Line 7', true),
    ('8', 'Line 8', true),
    ('9', 'Line 9', true),
    ('10', 'Advents', true)
  on conflict (code) do update
    set name = excluded.name,
        active = excluded.active,
        updated_at = now()
  returning id, code
),
ins_legs as (
  -- Same leg codes/names for every line (including Advents: one line, two legs).
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
  ('X_RAY_THERMO', 'X-Ray (Thermo)', 'Thermo', true),
  ('DENESTER', 'Denester', null, true)
on conflict (code) do update
  set name = excluded.name,
      supplier = excluded.supplier,
      active = excluded.active,
      updated_at = now();

-- Stampac uses on-screen HMI numbers; other families use name-based zones (internal codes only).
-- Requires column from migration `20260401120000_machine_family_uses_hmi_station_codes.sql`.
update machine_families
set uses_hmi_station_codes = (code = 'WRAPPER_STAMPAC');

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
      (4400, 'Rack turning', 'Rack turning', 15),
      (9900, 'Faults', 'Faults', 999)
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
-- 5) Machine family stations — sections / zones (template codes, not HMI IDs)
-- ---------------------------------------------------------------------------

-- Cartoner (Sensani)
with fam as (
  select id from machine_families where code = 'CARTONER_SENSANI'
),
ins as (
  insert into machine_family_stations (
    machine_family_id, station_code, name, section, sort_order, active
  )
  select
    fam.id,
    v.station_code,
    v.name,
    v.section,
    v.sort_order,
    true
  from fam
  join (
    values
      (5010, 'Magazine', 'Magazine', 10),
      (5020, 'Extractor', 'Extractor', 20),
      (5030, 'Lower forming', 'Lower forming', 30),
      (5040, 'Egg insertion', 'Egg insertion', 40),
      (5050, 'Chocolate filling', 'Chocolate filling', 50),
      (5060, 'Upper forming', 'Upper forming', 60),
      (5070, 'Exit conveyor', 'Exit conveyor', 70),
      (5080, 'Standup conveyor', 'Standup conveyor', 80),
      (5090, 'Indexer conveyor', 'Indexer conveyor', 90),
      (5100, 'Robot 1 & erector', 'Robot 1 & erector', 100),
      (5110, 'Vision system (sweet & outfeed)', 'Vision system (sweet & outfeed)', 110),
      (5120, 'Sweet conveyor', 'Sweet conveyor', 120),
      (5130, 'HMI (control panel)', 'HMI (control panel)', 900),
      (5140, 'Faults', 'Faults', 999)
  ) as v(station_code, name, section, sort_order) on true
  on conflict (machine_family_id, station_code) do update
    set name = excluded.name,
        section = excluded.section,
        sort_order = excluded.sort_order,
        active = true,
        updated_at = now()
  returning id
)
select count(*) as upserted_cartoner_sensani_stations from ins;

-- Cartoner (Bradman Bristol)
with fam as (
  select id from machine_families where code = 'CARTONER_BRADMAN_BRISTOL'
),
ins as (
  insert into machine_family_stations (
    machine_family_id, station_code, name, section, sort_order, active
  )
  select fam.id, v.station_code, v.name, v.section, v.sort_order, true
  from fam
  join (
    values
      (6010, 'Infeed conveyor', 'Infeed conveyor', 10),
      (6020, 'Magazine', 'Magazine', 20),
      (6030, 'Extractor', 'Extractor', 30),
      (6040, 'Pushers', 'Pushers', 40),
      (6050, 'Forming', 'Forming', 50),
      (6060, 'Outfeed', 'Outfeed', 60),
      (6070, 'Barcode', 'Barcode', 70),
      (6080, 'HMI (control panel)', 'HMI (control panel)', 900),
      (6090, 'Faults', 'Faults', 999)
  ) as v(station_code, name, section, sort_order) on true
  on conflict (machine_family_id, station_code) do update
    set name = excluded.name,
        section = excluded.section,
        sort_order = excluded.sort_order,
        active = true,
        updated_at = now()
  returning id
)
select count(*) as upserted_cartoner_bradman_stations from ins;

-- Case packer (Wraparound Bradman)
with fam as (
  select id from machine_families where code = 'CASE_PACKER_WRAPAROUND_BRADMAN'
),
ins as (
  insert into machine_family_stations (
    machine_family_id, station_code, name, section, sort_order, active
  )
  select fam.id, v.station_code, v.name, v.section, v.sort_order, true
  from fam
  join (
    values
      (7010, 'Infeed', 'Infeed', 10),
      (7020, 'Trains', 'Trains', 20),
      (7030, 'Collator table', 'Collator table', 30),
      (7040, 'Robot 1', 'Robot 1', 40),
      (7050, 'Tray erector', 'Tray erector', 50),
      (7060, 'Magazine', 'Magazine', 60),
      (7070, 'Indexer', 'Indexer', 70),
      (7080, 'Wraparound (forming)', 'Wraparound (forming)', 80),
      (7090, 'Final forming', 'Final forming', 90),
      (7100, 'Exit conveyor', 'Exit conveyor', 100),
      (7110, 'Barcode', 'Barcode', 110),
      (7120, 'HMI (control panel)', 'HMI (control panel)', 900),
      (7130, 'Faults', 'Faults', 999)
  ) as v(station_code, name, section, sort_order) on true
  on conflict (machine_family_id, station_code) do update
    set name = excluded.name,
        section = excluded.section,
        sort_order = excluded.sort_order,
        active = true,
        updated_at = now()
  returning id
)
select count(*) as upserted_case_wraparound_stations from ins;

-- Case packer (TLSW)
with fam as (
  select id from machine_families where code = 'CASE_PACKER_TLSW'
),
ins as (
  insert into machine_family_stations (
    machine_family_id, station_code, name, section, sort_order, active
  )
  select fam.id, v.station_code, v.name, v.section, v.sort_order, true
  from fam
  join (
    values
      (8010, 'Infeed', 'Infeed', 10),
      (8020, 'Collation area', 'Collation area', 20),
      (8030, 'Lid erector', 'Lid erector', 30),
      (8040, 'Lid retrieval', 'Lid retrieval', 40),
      (8050, 'Product transfer', 'Product transfer', 50),
      (8060, 'Magazine', 'Magazine', 60),
      (8070, 'Tray erector', 'Tray erector', 70),
      (8080, 'Loading area', 'Loading area', 80),
      (8090, 'Exit conveyor', 'Exit conveyor', 90),
      (8100, 'Vision', 'Vision', 100),
      (8110, 'Barcode', 'Barcode', 110),
      (8115, 'Banders', 'Banders', 115),
      (8120, 'HMI (control panel)', 'HMI (control panel)', 900),
      (8130, 'Faults', 'Faults', 999)
  ) as v(station_code, name, section, sort_order) on true
  on conflict (machine_family_id, station_code) do update
    set name = excluded.name,
        section = excluded.section,
        sort_order = excluded.sort_order,
        active = true,
        updated_at = now()
  returning id
)
select count(*) as upserted_case_tlsw_stations from ins;

-- Case packer (Cama)
with fam as (
  select id from machine_families where code = 'CASE_PACKER_CAMA'
),
ins as (
  insert into machine_family_stations (
    machine_family_id, station_code, name, section, sort_order, active
  )
  select fam.id, v.station_code, v.name, v.section, v.sort_order, true
  from fam
  join (
    values
      (9010, 'Magazine', 'Magazine', 10),
      (9020, 'Deviation area', 'Deviation area', 20),
      (9030, 'Transfer', 'Transfer', 30),
      (9040, 'Station 1 (tray retrieved)', 'Station 1 (tray retrieved)', 40),
      (9050, 'Station 2 (loading)', 'Station 2 (loading)', 50),
      (9060, 'Station 3 & 4 (forming)', 'Station 3 & 4 (forming)', 60),
      (9070, 'Ejection zone', 'Ejection zone', 70),
      (9080, 'HMI (control panel)', 'HMI (control panel)', 900),
      (9090, 'Faults', 'Faults', 999)
  ) as v(station_code, name, section, sort_order) on true
  on conflict (machine_family_id, station_code) do update
    set name = excluded.name,
        section = excluded.section,
        sort_order = excluded.sort_order,
        active = true,
        updated_at = now()
  returning id
)
select count(*) as upserted_case_cama_stations from ins;

-- Denester
with fam as (
  select id from machine_families where code = 'DENESTER'
),
ins as (
  insert into machine_family_stations (
    machine_family_id, station_code, name, section, sort_order, active
  )
  select fam.id, v.station_code, v.name, v.section, v.sort_order, true
  from fam
  join (
    values
      (10010, 'Magazine', 'Magazine', 10),
      (10020, 'Extractor', 'Extractor', 20),
      (10030, 'Denester lanes', 'Denester lanes', 30),
      (10040, 'Gating system', 'Gating system', 40),
      (10050, 'HMI (control panel)', 'HMI (control panel)', 900),
      (10060, 'Faults', 'Faults', 999)
  ) as v(station_code, name, section, sort_order) on true
  on conflict (machine_family_id, station_code) do update
    set name = excluded.name,
        section = excluded.section,
        sort_order = excluded.sort_order,
        active = true,
        updated_at = now()
  returning id
)
select count(*) as upserted_denester_stations from ins;

-- Palletiser (Magna)
with fam as (
  select id from machine_families where code = 'PALLETISER_MAGNA'
),
ins as (
  insert into machine_family_stations (
    machine_family_id, station_code, name, section, sort_order, active
  )
  select fam.id, v.station_code, v.name, v.section, v.sort_order, true
  from fam
  join (
    values
      (11010, 'Keymas', 'Keymas', 10),
      (11020, 'Infeed conveyor', 'Infeed conveyor', 20),
      (11030, 'Robot', 'Robot', 30),
      (11040, 'De-stacker', 'De-stacker', 40),
      (11050, 'Lift', 'Lift', 50),
      (11060, 'Conveyor track', 'Conveyor track', 60),
      (11070, 'HMI (control panel)', 'HMI (control panel)', 900),
      (11080, 'Faults', 'Faults', 999)
  ) as v(station_code, name, section, sort_order) on true
  on conflict (machine_family_id, station_code) do update
    set name = excluded.name,
        section = excluded.section,
        sort_order = excluded.sort_order,
        active = true,
        updated_at = now()
  returning id
)
select count(*) as upserted_palletiser_stations from ins;

-- Paternoster (Magna)
with fam as (
  select id from machine_families where code = 'PATERNOSTER_MAGNA'
),
ins as (
  insert into machine_family_stations (
    machine_family_id, station_code, name, section, sort_order, active
  )
  select fam.id, v.station_code, v.name, v.section, v.sort_order, true
  from fam
  join (
    values
      (12010, 'P&P (from process)', 'P&P (from process)', 10),
      (12020, 'Towers (side A & B)', 'Towers (side A & B)', 20),
      (12030, 'Mould loader', 'Mould loader', 30),
      (12040, 'Mould reject', 'Mould reject', 40),
      (12050, 'HMI (control panel)', 'HMI (control panel)', 900),
      (12060, 'Faults', 'Faults', 999)
  ) as v(station_code, name, section, sort_order) on true
  on conflict (machine_family_id, station_code) do update
    set name = excluded.name,
        section = excluded.section,
        sort_order = excluded.sort_order,
        active = true,
        updated_at = now()
  returning id
)
select count(*) as upserted_paternoster_stations from ins;

-- Servo pod (Podmore)
with fam as (
  select id from machine_families where code = 'SERVO_POD_PODMORE'
),
ins as (
  insert into machine_family_stations (
    machine_family_id, station_code, name, section, sort_order, active
  )
  select fam.id, v.station_code, v.name, v.section, v.sort_order, true
  from fam
  join (
    values
      (13010, 'Hopper', 'Hopper', 10),
      (13020, 'Rollers and sensors', 'Rollers and sensors', 20),
      (13030, 'Reject points', 'Reject points', 30),
      (13040, 'HMI (control panel)', 'HMI (control panel)', 900),
      (13050, 'Faults', 'Faults', 999)
  ) as v(station_code, name, section, sort_order) on true
  on conflict (machine_family_id, station_code) do update
    set name = excluded.name,
        section = excluded.section,
        sort_order = excluded.sort_order,
        active = true,
        updated_at = now()
  returning id
)
select count(*) as upserted_servopod_stations from ins;

-- ---------------------------------------------------------------------------
-- 6) TODO: Machines per line/leg (instances)
-- ---------------------------------------------------------------------------
-- You said both legs are usually very similar.
-- Below we seed machines for line codes '1'–'3' only (lines '4'–'10' have legs but no machines yet).
-- Add more `values (...)` blocks per line when you have the layout.
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

