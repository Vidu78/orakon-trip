-- Orakon Trip schema (Supabase-ready). Safe to run repeatedly.

create table if not exists trips (
  id           text primary key,
  start        jsonb        not null,
  "end"        jsonb        not null,
  route        jsonb        not null default '[]'::jsonb,
  battery_est  integer      not null default 100,
  status       text         not null default 'running',
  created_at   timestamptz  not null default now(),
  updated_at   timestamptz  not null default now()
);

-- Real road distance/duration from OSRM (nullable; absent when routing failed).
alter table trips add column if not exists route_km  integer;
alter table trips add column if not exists route_min integer;

create table if not exists devices (
  id            text primary key,
  type          text        not null,
  capabilities  jsonb       not null default '[]'::jsonb,
  registered_at timestamptz not null default now()
);

-- Append-only audit / event log. Rows are never updated or deleted.
create table if not exists events (
  id         text primary key,
  trip_id    text        not null,
  type       text        not null,
  device_id  text,
  payload    jsonb       not null default '{}'::jsonb,
  ts         timestamptz not null default now()
);

create index if not exists events_trip_id_ts_idx on events (trip_id, ts);
