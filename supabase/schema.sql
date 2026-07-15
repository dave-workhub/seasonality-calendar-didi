-- Seasonality Calendar — schema
-- Run this once in the Supabase project's SQL Editor (Phase 1).

create table if not exists calendar_events (
  id bigint generated always as identity primary key,
  city_slug text not null,
  start_date date not null,
  end_date date, -- null for single-day events; set for ranges (e.g. School Break)
  category text not null check (category in (
    'official_holiday',
    'high_demand_celebration',
    'school_break',
    'back_to_school',
    'other_event'
  )),
  title text not null,
  source_url text,
  -- 'manual' (curated by hand, e.g. concerts) vs 'api-football' (synced weekly
  -- by /api/cron/sync-sports) — lets the sync job safely replace only the
  -- rows it owns without touching manually curated events.
  source text not null default 'manual',
  created_at timestamptz not null default now()
);

create index if not exists calendar_events_city_idx on calendar_events (city_slug, start_date);
create index if not exists calendar_events_source_idx on calendar_events (source);

-- Read-only public access (this is non-sensitive scheduling data).
alter table calendar_events enable row level security;
drop policy if exists "public read calendar_events" on calendar_events;
create policy "public read calendar_events" on calendar_events for select using (true);

-- Phase 4 placeholders — populate manually until an automated source is confirmed per data owner.
create table if not exists budget_weekly (
  id bigint generated always as identity primary key,
  city_slug text not null,
  iso_year int not null,
  iso_week int not null,
  budget_amount numeric,
  actual_burn numeric,
  currency text default 'USD',
  updated_at timestamptz not null default now(),
  unique (city_slug, iso_year, iso_week)
);
alter table budget_weekly enable row level security;
drop policy if exists "public read budget_weekly" on budget_weekly;
create policy "public read budget_weekly" on budget_weekly for select using (true);

create table if not exists demand_weekly (
  id bigint generated always as identity primary key,
  city_slug text not null,
  iso_year int not null,
  iso_week int not null,
  demand_index numeric, -- e.g. trips or orders, whatever unit the source uses
  yoy_change_pct numeric,
  updated_at timestamptz not null default now(),
  unique (city_slug, iso_year, iso_week)
);
alter table demand_weekly enable row level security;
drop policy if exists "public read demand_weekly" on demand_weekly;
create policy "public read demand_weekly" on demand_weekly for select using (true);

-- ── Seed: curated events we already know about (2026) ──
insert into calendar_events (city_slug, start_date, end_date, category, title) values
  -- Saltillo (MX) — from the team's official Seasonality Calendar reference
  ('saltillo', '2026-02-14', null, 'high_demand_celebration', 'Valentines Day'),
  ('saltillo', '2026-03-28', '2026-04-05', 'school_break', 'Holy Week Break'),
  ('saltillo', '2026-04-06', null, 'back_to_school', 'Back to School'),
  ('saltillo', '2026-04-25', null, 'other_event', 'Chayanne Concert'),
  ('saltillo', '2026-05-10', null, 'high_demand_celebration', 'Mothers Day'),
  ('saltillo', '2026-05-15', null, 'high_demand_celebration', 'Teachers Day'),
  ('saltillo', '2026-06-11', null, 'other_event', 'World Cup starts'),
  ('saltillo', '2026-06-15', null, 'high_demand_celebration', 'Fathers Day'),
  ('saltillo', '2026-07-16', '2026-08-25', 'school_break', 'School Break'),
  ('saltillo', '2026-08-26', null, 'back_to_school', 'Back to School'),
  ('saltillo', '2026-10-31', null, 'other_event', 'Halloween Weekend'),

  -- Mérida (MX)
  ('merida', '2026-02-05', null, 'other_event', 'Eladio Carrion Concert'),
  ('merida', '2026-02-07', '2026-02-17', 'other_event', 'Merida Festival'),
  ('merida', '2026-02-14', null, 'high_demand_celebration', 'Valentines Day'),
  ('merida', '2026-02-24', null, 'other_event', 'Shakira Concert'),
  ('merida', '2026-03-28', '2026-04-05', 'school_break', 'Holy Week Break'),
  ('merida', '2026-04-06', null, 'back_to_school', 'Back to School'),
  ('merida', '2026-05-10', null, 'high_demand_celebration', 'Mothers Day'),
  ('merida', '2026-05-27', null, 'other_event', 'Grupo Frontera Concert'),
  ('merida', '2026-06-11', null, 'other_event', 'World Cup starts'),
  ('merida', '2026-06-15', null, 'high_demand_celebration', 'Fathers Day'),
  ('merida', '2026-07-16', '2026-08-25', 'school_break', 'School Break'),
  ('merida', '2026-08-26', null, 'back_to_school', 'Back to School'),
  ('merida', '2026-10-31', null, 'other_event', 'Halloween Weekend'),

  -- Hermosillo (MX) — no city-specific concerts/festivals known yet; only the shared MX dates
  ('hermosillo', '2026-06-11', null, 'other_event', 'World Cup starts'),
  ('hermosillo', '2026-10-31', null, 'other_event', 'Halloween Weekend'),

  -- Bogotá (CO) — concerts carried over from the original calendario-festivos.html
  ('bogota', '2026-02-10', null, 'other_event', 'My Chemical Romance – Vive Claro'),
  ('bogota', '2026-03-20', '2026-03-22', 'other_event', 'Festival Estéreo Picnic – Parque Simón Bolívar'),
  ('bogota', '2026-04-26', null, 'other_event', 'Dream Theater – Movistar Arena'),
  ('bogota', '2026-04-27', null, 'other_event', 'Megadeth – Movistar Arena'),
  ('bogota', '2026-05-02', null, 'other_event', 'Korn – Coliseo MedPlus'),
  ('bogota', '2026-05-07', null, 'other_event', 'Mon Laferte Femme Fatale Tour – Movistar Arena'),
  ('bogota', '2026-05-28', '2026-05-30', 'other_event', 'Soda Stereo Ecos – Movistar Arena'),
  ('bogota', '2026-07-16', null, 'other_event', 'Rosalía LUX Tour – Movistar Arena'),
  ('bogota', '2026-07-18', null, 'other_event', 'Rosalía LUX Tour – Movistar Arena'),
  ('bogota', '2026-10-10', '2026-10-12', 'other_event', 'Rock al Parque 30 años – Parque Simón Bolívar'),
  ('bogota', '2026-12-04', '2026-12-06', 'other_event', 'Karol G Tropitour'),

  -- Lima (PE)
  ('lima', '2026-03-04', null, 'other_event', 'Miguel Bosé Importante Tour – Arena 1'),
  ('lima', '2026-03-23', null, 'other_event', 'The Killers – Costa 21'),
  ('lima', '2026-04-20', null, 'other_event', 'Dream Theater – Costa 21'),
  ('lima', '2026-04-23', null, 'other_event', 'Megadeth – Costa 21'),
  ('lima', '2026-05-20', null, 'other_event', 'Ed Sheeran LOOP Tour – Estadio Nacional'),
  ('lima', '2026-05-22', '2026-05-24', 'other_event', 'Soda Stereo Ecos – Arena 1'),
  ('lima', '2026-06-26', null, 'other_event', 'Ricardo Arjona – Estadio Nacional'),
  ('lima', '2026-09-11', null, 'other_event', 'Romeo Santos & Prince Royce – Estadio Nacional'),
  ('lima', '2026-09-27', null, 'other_event', '5 Seconds of Summer – Costa 21'),
  ('lima', '2026-10-17', null, 'other_event', 'Iron Maiden – Estadio Nacional'),
  ('lima', '2026-11-24', null, 'other_event', 'Eros Ramazzotti – Arena 1'),
  ('lima', '2026-12-02', null, 'other_event', 'Chayanne Bailemos Otra Vez Tour – Estadio Nacional'),

  -- Valparaíso (CL)
  ('valparaiso', '2026-01-09', null, 'other_event', 'VAM 2026 Festival – Trotamundos'),
  ('valparaiso', '2026-05-02', null, 'other_event', 'Star Wars Sinfónico – Teatro Municipal'),
  ('valparaiso', '2026-06-06', null, 'other_event', 'Inti Illimani – Trotamundos'),
  ('valparaiso', '2026-06-27', null, 'other_event', 'Princesa Alba – Teatro Mauri SCD'),
  ('valparaiso', '2026-07-18', null, 'other_event', 'Electrodomésticos – Teatro Municipal'),
  ('valparaiso', '2026-07-25', null, 'other_event', 'Bersuit Vergarabat – Trotamundos'),
  ('valparaiso', '2026-08-30', null, 'other_event', 'THY ANTICHRIST – El Huevo')
on conflict do nothing;
