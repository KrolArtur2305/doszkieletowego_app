alter table public.inwestycje
  add column if not exists place_name text,
  add column if not exists location_city text,
  add column if not exists location_country text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

update public.inwestycje
set place_name = lokalizacja
where place_name is null
  and lokalizacja is not null
  and btrim(lokalizacja) <> '';

create index if not exists inwestycje_latitude_longitude_idx
  on public.inwestycje (latitude, longitude)
  where latitude is not null and longitude is not null;
