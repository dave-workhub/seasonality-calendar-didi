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

-- Prevents a re-run of a seed/insert script from silently duplicating rows
-- (paired with "on conflict do nothing" on inserts).
create unique index if not exists calendar_events_no_dupes
  on calendar_events (city_slug, start_date, title);

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

-- ── Seed: school calendars for CASA cities (2026), from official ministry sources ──
insert into calendar_events (city_slug, start_date, end_date, category, title, source_url) values
  -- Colombia, Calendario A (Bogotá, Cali, Pereira, Bucaramanga) — MEN Circular 043 de 2025
  ('bogota', '2026-06-22', '2026-07-05', 'school_break', 'Vacaciones de mitad de año', 'https://www.mineducacion.gov.co/portal/micrositios-preescolar-basica-y-media/Matriculas/426215:Calendario-Escolar-2026'),
  ('bogota', '2026-07-06', null, 'back_to_school', 'Regreso a clases', 'https://www.mineducacion.gov.co/portal/micrositios-preescolar-basica-y-media/Matriculas/426215:Calendario-Escolar-2026'),
  ('bogota', '2026-10-05', '2026-10-11', 'school_break', 'Semana de receso estudiantil', 'https://www.mineducacion.gov.co/portal/micrositios-preescolar-basica-y-media/Matriculas/426215:Calendario-Escolar-2026'),

  ('cali', '2026-06-22', '2026-07-05', 'school_break', 'Vacaciones de mitad de año', 'https://www.mineducacion.gov.co/portal/micrositios-preescolar-basica-y-media/Matriculas/426215:Calendario-Escolar-2026'),
  ('cali', '2026-07-06', null, 'back_to_school', 'Regreso a clases', 'https://www.mineducacion.gov.co/portal/micrositios-preescolar-basica-y-media/Matriculas/426215:Calendario-Escolar-2026'),
  ('cali', '2026-10-05', '2026-10-11', 'school_break', 'Semana de receso estudiantil', 'https://www.mineducacion.gov.co/portal/micrositios-preescolar-basica-y-media/Matriculas/426215:Calendario-Escolar-2026'),

  ('pereira', '2026-06-22', '2026-07-05', 'school_break', 'Vacaciones de mitad de año', 'https://www.mineducacion.gov.co/portal/micrositios-preescolar-basica-y-media/Matriculas/426215:Calendario-Escolar-2026'),
  ('pereira', '2026-07-06', null, 'back_to_school', 'Regreso a clases', 'https://www.mineducacion.gov.co/portal/micrositios-preescolar-basica-y-media/Matriculas/426215:Calendario-Escolar-2026'),
  ('pereira', '2026-10-05', '2026-10-11', 'school_break', 'Semana de receso estudiantil', 'https://www.mineducacion.gov.co/portal/micrositios-preescolar-basica-y-media/Matriculas/426215:Calendario-Escolar-2026'),

  ('bucaramanga', '2026-06-22', '2026-07-05', 'school_break', 'Vacaciones de mitad de año', 'https://www.mineducacion.gov.co/portal/micrositios-preescolar-basica-y-media/Matriculas/426215:Calendario-Escolar-2026'),
  ('bucaramanga', '2026-07-06', null, 'back_to_school', 'Regreso a clases', 'https://www.mineducacion.gov.co/portal/micrositios-preescolar-basica-y-media/Matriculas/426215:Calendario-Escolar-2026'),
  ('bucaramanga', '2026-10-05', '2026-10-11', 'school_break', 'Semana de receso estudiantil', 'https://www.mineducacion.gov.co/portal/micrositios-preescolar-basica-y-media/Matriculas/426215:Calendario-Escolar-2026'),

  -- Perú (Lima) — cronograma oficial Minedu 2026
  ('lima', '2026-05-18', '2026-05-22', 'school_break', 'Semana de gestión (receso)', 'https://larepublica.pe/sociedad/2026/05/06/ni-junio-ni-julio-estas-son-las-fechas-de-las-primeras-vacaciones-escolares-en-2026-segun-el-calendario-oficial-del-minedu-210618'),
  ('lima', '2026-07-27', '2026-08-07', 'school_break', 'Vacaciones de medio año', 'https://larepublica.pe/sociedad/2026/07/09/vacaciones-de-mitad-de-ano-en-peru-2026-estas-son-las-fechas-para-colegios-publicos-y-privados-segun-el-calendario-oficial-de-minedu-225063'),
  ('lima', '2026-08-10', null, 'back_to_school', 'Regreso a clases', 'https://larepublica.pe/sociedad/2026/07/09/vacaciones-de-mitad-de-ano-en-peru-2026-estas-son-las-fechas-para-colegios-publicos-y-privados-segun-el-calendario-oficial-de-minedu-225063'),
  ('lima', '2026-10-12', '2026-10-16', 'school_break', 'Semana de gestión (receso)', 'https://larepublica.pe/sociedad/2026/07/09/vacaciones-de-mitad-de-ano-en-peru-2026-estas-son-las-fechas-para-colegios-publicos-y-privados-segun-el-calendario-oficial-de-minedu-225063'),

  -- Chile (Valparaíso, Región Metropolitana, Concepción) — Mineduc, bloque "Centro" (incluye Valparaíso y Biobío)
  ('valparaiso', '2026-06-22', '2026-07-03', 'school_break', 'Vacaciones de invierno', 'https://www.mineduc.cl/ministerio-de-educacion-oficializa-el-calendario-escolar-2026/'),
  ('valparaiso', '2026-07-06', null, 'back_to_school', 'Regreso a clases', 'https://www.mineduc.cl/ministerio-de-educacion-oficializa-el-calendario-escolar-2026/'),

  ('region-metropolitana', '2026-06-22', '2026-07-03', 'school_break', 'Vacaciones de invierno', 'https://www.mineduc.cl/ministerio-de-educacion-oficializa-el-calendario-escolar-2026/'),
  ('region-metropolitana', '2026-07-06', null, 'back_to_school', 'Regreso a clases', 'https://www.mineduc.cl/ministerio-de-educacion-oficializa-el-calendario-escolar-2026/'),

  ('concepcion', '2026-06-22', '2026-07-03', 'school_break', 'Vacaciones de invierno', 'https://www.mineduc.cl/ministerio-de-educacion-oficializa-el-calendario-escolar-2026/'),
  ('concepcion', '2026-07-06', null, 'back_to_school', 'Regreso a clases', 'https://www.mineduc.cl/ministerio-de-educacion-oficializa-el-calendario-escolar-2026/'),

  -- Costa Rica (San José) — MEP calendario escolar 2026
  ('san-jose', '2026-02-23', null, 'back_to_school', 'Inicio de lecciones', 'https://www.mep.go.cr/noticias/mep-presenta-calendario-escolar-2026'),
  ('san-jose', '2026-03-29', '2026-04-05', 'school_break', 'Semana Santa', 'https://www.mep.go.cr/noticias/mep-presenta-calendario-escolar-2026'),
  ('san-jose', '2026-07-06', '2026-07-17', 'school_break', 'Vacaciones de medio periodo', 'https://www.mep.go.cr/noticias/mep-presenta-calendario-escolar-2026'),
  ('san-jose', '2026-07-20', null, 'back_to_school', 'Regreso a clases', 'https://www.mep.go.cr/noticias/mep-presenta-calendario-escolar-2026'),

  -- Ecuador (Quito) — régimen Sierra, año lectivo 2025-2026 / 2026-2027
  ('quito', '2026-06-26', '2026-08-31', 'school_break', 'Vacaciones estudiantiles (régimen Sierra)', 'https://www.primicias.ec/sociedad/vacaciones-escolares-sierra-ecuador-examenes-docentes-124237/'),
  ('quito', '2026-09-01', null, 'back_to_school', 'Regreso a clases (año lectivo 2026-2027)', 'https://www.metroecuador.com.ec/noticias/2026/06/21/educacion-confirma-la-fecha-de-inicio-de-clases-para-el-ano-lectivo-2026-2027-en-la-sierra-y-amazonia/')
on conflict do nothing;

-- ── Seed: concerts/events for the remaining CASA cities (2026) ──
insert into calendar_events (city_slug, start_date, end_date, category, title) values
  -- Cali (CO)
  ('cali', '2026-03-21', null, 'other_event', 'J Balvin – Estadio Pascual Guerrero'),
  ('cali', '2026-04-25', null, 'other_event', 'Grupo Firme "La Última Peda" – Estadio Pascual Guerrero'),
  ('cali', '2026-08-22', null, 'other_event', 'Ryan Castro – Estadio Pascual Guerrero'),
  ('cali', '2026-09-11', null, 'other_event', 'Caifanes – Arena Cañaveralejo'),
  ('cali', '2026-10-31', null, 'other_event', 'Bunbury – Arena Cañaveralejo'),
  ('cali', '2026-11-21', null, 'other_event', 'Carlos Vives – Arena Cañaveralejo'),

  -- Bucaramanga (CO)
  ('bucaramanga', '2026-08-29', null, 'other_event', 'Ryan Castro – Estadio José Américo Montanini'),
  ('bucaramanga', '2026-10-16', null, 'other_event', 'Carlos Vives "Tour al Sol" – CENFER'),

  -- Pereira (CO)
  ('pereira', '2026-08-15', '2026-08-30', 'other_event', 'Fiestas de la Cosecha'),
  ('pereira', '2026-08-14', null, 'other_event', 'Candlelight: Hans Zimmer & Rock Classics – Teatro Santiago Londoño'),
  ('pereira', '2026-09-26', null, 'other_event', 'Candlelight: Tributo a Bad Bunny – Teatro Santiago Londoño'),
  ('pereira', '2026-11-06', null, 'other_event', 'Carlos Vives "Tour al Sol" – Expofuturo'),
  ('pereira', '2026-12-20', null, 'other_event', 'Candlelight: Christmas Classics – Teatro Santiago Londoño'),

  -- Región Metropolitana / Santiago (CL)
  ('region-metropolitana', '2026-07-24', '2026-07-29', 'other_event', 'Rosalía LUX Tour (4 shows) – Movistar Arena'),
  ('region-metropolitana', '2026-10-02', null, 'other_event', 'ZAYN – Movistar Arena'),
  ('region-metropolitana', '2026-10-09', null, 'other_event', 'Trueno – Movistar Arena'),
  ('region-metropolitana', '2026-10-14', null, 'other_event', 'BTS – Estadio Nacional'),
  ('region-metropolitana', '2026-10-31', '2026-11-01', 'other_event', 'Iron Maiden – Estadio Nacional'),
  ('region-metropolitana', '2026-11-21', null, 'other_event', 'Babasónicos – Movistar Arena'),
  ('region-metropolitana', '2026-12-03', null, 'other_event', 'Babymetal – Movistar Arena'),
  ('region-metropolitana', '2026-12-08', null, 'other_event', 'Deep Purple – Movistar Arena'),

  -- Concepción (CL)
  ('concepcion', '2026-02-07', null, 'other_event', 'Chayanne – Estadio Ester Roa Rebolledo'),

  -- San José (CR)
  ('san-jose', '2026-03-18', null, 'other_event', 'Tyler, The Creator – Parque Viva'),
  ('san-jose', '2026-03-25', null, 'other_event', 'The Killers – Parque Viva'),
  ('san-jose', '2026-03-27', null, 'other_event', 'Ricardo Montaner – Parque Viva'),
  ('san-jose', '2026-04-29', null, 'other_event', 'Laura Pausini – Estadio Nacional'),
  ('san-jose', '2026-05-30', null, 'other_event', 'Ed Sheeran LOOP Tour – Estadio Nacional'),
  ('san-jose', '2026-08-14', '2026-08-15', 'other_event', 'Ricardo Arjona – Estadio Nacional'),
  ('san-jose', '2026-08-21', null, 'other_event', 'Romeo Santos & Prince Royce – Estadio Nacional'),
  ('san-jose', '2026-10-08', null, 'other_event', 'Iron Maiden – Estadio Nacional'),
  ('san-jose', '2026-11-18', null, 'other_event', 'Eros Ramazzotti – Estadio Nacional'),
  ('san-jose', '2026-11-27', null, 'other_event', 'Martin Garrix – Parque Viva'),

  -- Quito (EC)
  ('quito', '2026-01-23', null, 'other_event', 'Santiago Cruz – Coliseo Rumiñahui'),
  ('quito', '2026-02-19', null, 'other_event', 'Alejandro Sanz – Estadio Atahualpa'),
  ('quito', '2026-05-21', null, 'other_event', 'Ricardo Montaner – Coliseo Rumiñahui'),
  ('quito', '2026-05-23', null, 'other_event', 'Ed Sheeran LOOP Tour – Estadio Atahualpa'),
  ('quito', '2026-07-31', null, 'other_event', 'Festival Llacta Flow (Beele) – Coliseo Rumiñahui'),
  ('quito', '2026-08-06', null, 'other_event', 'Ricardo Arjona – Estadio Atahualpa'),
  ('quito', '2026-09-22', null, 'other_event', 'Carlos Vives – Coliseo Rumiñahui'),
  ('quito', '2026-09-23', null, 'other_event', 'TINI – Coliseo Rumiñahui'),
  ('quito', '2026-10-09', null, 'other_event', 'Grupo Frontera – Coliseo Rumiñahui'),
  ('quito', '2026-10-14', null, 'other_event', 'Iron Maiden – Estadio Atahualpa'),
  ('quito', '2026-11-15', null, 'other_event', 'Cypress Hill – Coliseo Rumiñahui')
on conflict do nothing;

-- Halloween was miscategorized as other_event when first seeded — it belongs in
-- high_demand_celebration alongside Mother's/Father's Day etc.
update calendar_events set category = 'high_demand_celebration'
  where category = 'other_event' and title ilike 'Halloween%';

-- ── Seed: High Demand Celebrations (non-holiday days with a demand spike) ──
-- Dates verified per country for 2026; Colombia's "Amor y Amistad" is NOT
-- Feb 14 like the rest of the region — it's the 3rd Saturday of September.
insert into calendar_events (city_slug, start_date, end_date, category, title) values
  -- Colombia (Bogotá, Cali, Pereira, Bucaramanga, Barranquilla)
  ('bogota', '2026-05-10', null, 'high_demand_celebration', 'Día de la Madre'),
  ('bogota', '2026-06-21', null, 'high_demand_celebration', 'Día del Padre'),
  ('bogota', '2026-09-19', null, 'high_demand_celebration', 'Día del Amor y la Amistad'),
  ('bogota', '2026-10-31', null, 'high_demand_celebration', 'Halloween'),

  ('cali', '2026-05-10', null, 'high_demand_celebration', 'Día de la Madre'),
  ('cali', '2026-06-21', null, 'high_demand_celebration', 'Día del Padre'),
  ('cali', '2026-09-19', null, 'high_demand_celebration', 'Día del Amor y la Amistad'),
  ('cali', '2026-10-31', null, 'high_demand_celebration', 'Halloween'),

  ('pereira', '2026-05-10', null, 'high_demand_celebration', 'Día de la Madre'),
  ('pereira', '2026-06-21', null, 'high_demand_celebration', 'Día del Padre'),
  ('pereira', '2026-09-19', null, 'high_demand_celebration', 'Día del Amor y la Amistad'),
  ('pereira', '2026-10-31', null, 'high_demand_celebration', 'Halloween'),

  ('bucaramanga', '2026-05-10', null, 'high_demand_celebration', 'Día de la Madre'),
  ('bucaramanga', '2026-06-21', null, 'high_demand_celebration', 'Día del Padre'),
  ('bucaramanga', '2026-09-19', null, 'high_demand_celebration', 'Día del Amor y la Amistad'),
  ('bucaramanga', '2026-10-31', null, 'high_demand_celebration', 'Halloween'),

  ('barranquilla', '2026-05-10', null, 'high_demand_celebration', 'Día de la Madre'),
  ('barranquilla', '2026-06-21', null, 'high_demand_celebration', 'Día del Padre'),
  ('barranquilla', '2026-09-19', null, 'high_demand_celebration', 'Día del Amor y la Amistad'),
  ('barranquilla', '2026-10-31', null, 'high_demand_celebration', 'Halloween'),

  -- Chile (Valparaíso, Región Metropolitana, Concepción)
  ('valparaiso', '2026-02-14', null, 'high_demand_celebration', 'San Valentín'),
  ('valparaiso', '2026-05-10', null, 'high_demand_celebration', 'Día de la Madre'),
  ('valparaiso', '2026-06-21', null, 'high_demand_celebration', 'Día del Padre'),
  ('valparaiso', '2026-10-31', null, 'high_demand_celebration', 'Halloween'),

  ('region-metropolitana', '2026-02-14', null, 'high_demand_celebration', 'San Valentín'),
  ('region-metropolitana', '2026-05-10', null, 'high_demand_celebration', 'Día de la Madre'),
  ('region-metropolitana', '2026-06-21', null, 'high_demand_celebration', 'Día del Padre'),
  ('region-metropolitana', '2026-10-31', null, 'high_demand_celebration', 'Halloween'),

  ('concepcion', '2026-02-14', null, 'high_demand_celebration', 'San Valentín'),
  ('concepcion', '2026-05-10', null, 'high_demand_celebration', 'Día de la Madre'),
  ('concepcion', '2026-06-21', null, 'high_demand_celebration', 'Día del Padre'),
  ('concepcion', '2026-10-31', null, 'high_demand_celebration', 'Halloween'),

  -- Perú (Lima)
  ('lima', '2026-02-14', null, 'high_demand_celebration', 'San Valentín'),
  ('lima', '2026-05-10', null, 'high_demand_celebration', 'Día de la Madre'),
  ('lima', '2026-06-21', null, 'high_demand_celebration', 'Día del Padre'),
  ('lima', '2026-10-31', null, 'high_demand_celebration', 'Halloween'),

  -- Costa Rica (San José) — Día de la Madre es el 15 de agosto, fecha fija
  ('san-jose', '2026-02-14', null, 'high_demand_celebration', 'San Valentín'),
  ('san-jose', '2026-06-21', null, 'high_demand_celebration', 'Día del Padre'),
  ('san-jose', '2026-08-15', null, 'high_demand_celebration', 'Día de la Madre'),
  ('san-jose', '2026-10-31', null, 'high_demand_celebration', 'Halloween'),

  -- Ecuador (Quito)
  ('quito', '2026-02-14', null, 'high_demand_celebration', 'San Valentín'),
  ('quito', '2026-05-10', null, 'high_demand_celebration', 'Día de la Madre'),
  ('quito', '2026-06-21', null, 'high_demand_celebration', 'Día del Padre'),
  ('quito', '2026-10-31', null, 'high_demand_celebration', 'Halloween'),

  -- Hermosillo (MX, Indigo) — mismas fechas que Saltillo/Mérida (fuente del equipo)
  ('hermosillo', '2026-02-14', null, 'high_demand_celebration', 'Valentines Day'),
  ('hermosillo', '2026-05-10', null, 'high_demand_celebration', 'Mothers Day'),
  ('hermosillo', '2026-06-15', null, 'high_demand_celebration', 'Fathers Day')
on conflict do nothing;

-- ══════════════════════════════════════════════════════════════════
-- City manager editing: auth, per-city permissions, holiday overrides
-- ══════════════════════════════════════════════════════════════════

-- ── Profiles ──
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create or replace function is_admin() returns boolean
language sql security definer stable as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;

drop policy if exists "read own or admin reads all profiles" on profiles;
create policy "read own or admin reads all profiles" on profiles
  for select using (auth.uid() = id or is_admin());

-- Auto-create a profile row on signup; jacostamurcia@gmail.com is admin from day one.
create or replace function handle_new_user() returns trigger
language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, is_admin)
  values (new.id, new.email, new.email = 'jacostamurcia@gmail.com');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── City edit permissions ──
create table if not exists city_permissions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  city_slug text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id),
  unique (user_id, city_slug)
);

alter table city_permissions enable row level security;

drop policy if exists "read own requests or admin reads all" on city_permissions;
create policy "read own requests or admin reads all" on city_permissions
  for select using (auth.uid() = user_id or is_admin());

drop policy if exists "request access to a city" on city_permissions;
create policy "request access to a city" on city_permissions
  for insert with check (auth.uid() = user_id and status = 'pending');

drop policy if exists "admin decides requests" on city_permissions;
create policy "admin decides requests" on city_permissions
  for update using (is_admin()) with check (is_admin());

drop policy if exists "admin deletes requests" on city_permissions;
create policy "admin deletes requests" on city_permissions
  for delete using (is_admin());

-- Helper: does the current user have approved edit access to a given city?
create or replace function can_edit_city(target_city text) returns boolean
language sql security definer stable as $$
  select is_admin() or exists (
    select 1 from city_permissions
    where user_id = auth.uid() and city_slug = target_city and status = 'approved'
  );
$$;

-- ── Holiday overrides (hide a wrong live holiday, or rename/add a local one) ──
create table if not exists holiday_overrides (
  id bigint generated always as identity primary key,
  city_slug text not null,
  override_date date not null,
  hidden boolean not null default false,
  custom_name text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (city_slug, override_date)
);

alter table holiday_overrides enable row level security;

drop policy if exists "public read holiday_overrides" on holiday_overrides;
create policy "public read holiday_overrides" on holiday_overrides for select using (true);

drop policy if exists "editors write holiday_overrides" on holiday_overrides;
create policy "editors write holiday_overrides" on holiday_overrides
  for all using (can_edit_city(city_slug)) with check (can_edit_city(city_slug));

-- ── calendar_events: allow approved city editors / admin to write ──
drop policy if exists "editors write calendar_events" on calendar_events;
create policy "editors write calendar_events" on calendar_events
  for all using (can_edit_city(city_slug)) with check (can_edit_city(city_slug));

-- A rejected request can be re-submitted (flip status back to pending) by
-- the same user; the client does this via an upsert instead of a new insert
-- since (user_id, city_slug) is unique.
drop policy if exists "user re-requests after rejection" on city_permissions;
create policy "user re-requests after rejection" on city_permissions
  for update using (auth.uid() = user_id and status = 'rejected')
  with check (auth.uid() = user_id and status = 'pending');

-- ══════════════════════════════════════════════════════════════════
-- Rain — Open-Meteo forecast synced daily by /api/cron/sync-weather,
-- graded against actuals the following day.
-- ══════════════════════════════════════════════════════════════════

create table if not exists rain_daily (
  id bigint generated always as identity primary key,
  city_slug text not null,
  date date not null,
  forecast_precip_mm numeric,
  forecast_pop numeric, -- probability of precipitation, 0-100
  actual_precip_mm numeric,
  updated_at timestamptz not null default now(),
  unique (city_slug, date)
);

alter table rain_daily enable row level security;

drop policy if exists "public read rain_daily" on rain_daily;
create policy "public read rain_daily" on rain_daily for select using (true);

-- No public write policy: only the cron job (via the service_role key, which
-- bypasses RLS) writes to this table.
