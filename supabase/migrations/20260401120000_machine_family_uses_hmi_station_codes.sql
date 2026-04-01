-- When false, station_code is internal only; operators pick zones by name and URLs use ?stationId=.
-- When true (e.g. Stampac), station_code is the on-screen HMI number and URLs use ?stationCode=.

alter table machine_families
  add column if not exists uses_hmi_station_codes boolean not null default false;

update machine_families
set uses_hmi_station_codes = true
where code = 'WRAPPER_STAMPAC';

update machine_families
set uses_hmi_station_codes = false
where code is distinct from 'WRAPPER_STAMPAC';
