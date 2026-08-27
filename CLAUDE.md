# Seasonality Calendar — project context

Personal fork of a private DiDi-internal tool (`juan-david-code/seasonality-calendar`),
rebuilt substantially on the owner's own infra. No DiDi internal seed data was ever
copied over — only the schema structure. `README.md` documents the *original*
DiDi-internal setup instructions (in Spanish) and is now historical/stale in places —
this file is the accurate, current picture.

## Infra (all on personal accounts)
- **GitHub**: `davidm948/seasonality-calendar` (private).
- **Supabase**: Postgres backend. Schema lives in `supabase/schema.sql` — that file is
  the source of truth for fresh installs; a few migrations were applied by hand
  directly in the Supabase SQL Editor and are documented as commented-out blocks at
  the point in the file they apply to (search for "Migration for an already-running
  database"). Apply those manually if you're setting up a fresh DB.
- **Vercel**: auto-deploys on push to `main` at `https://seasonality-calendar-tau.vercel.app`.
- Dev server: `npm install && npm run dev` (needs `.env.local` — see `.env.local.example`
  or ask the owner for the Supabase URL/keys).

## Access model
Viewing the app at all requires signing in with Google, **restricted to `@didi-labs.com`
accounts** (plus one hardcoded personal-email admin fallback — see `ADMIN_FALLBACK_EMAIL`
in `CalendarApp.tsx` and `serverAuth.ts`). This is enforced server-side (email domain
check on every gated route/RLS policy), not just via Google's `hd` OAuth hint, which is
only a UI nicety.

Within the app, any user with **at least one approved city** can edit **any** city's
calendar events/holidays — this was deliberately loosened from the original "own
city only" model via the `can_edit_city()` Postgres function, since it's a small
trusted team. See the "Country / Indigo edit scope" section below.

## Cities
5 cities total, trimmed down from the original DiDi CASA+Indigo list:
`cartagena`, `medellin` (Colombia — CO), `saltillo`, `hermosillo`, `merida` (Mexico — MX).
Defined in `src/lib/cities.ts` (`ALL_CITIES`, `COUNTRIES` grouping, lat/lon per city,
`currencyForCity()`). "**Indigo**" is the DiDi-internal portfolio name for this
specific 5-city group — used as a UI label (the "Edit Indigo" bulk-edit button), not
a technical term.

## Features
1. **Holidays** — live from Nager.Date API (free, keyless), falls back to a local
   algorithmic estimate if that's down. Per-city overrides (hide/rename/add local
   holidays) via `holiday_overrides` table, edited through the Holidays panel
   (`EditPanel.tsx`).
2. **Rain + extreme heat daily badges** — `rain_daily` table, synced daily via Vercel
   Cron (`/api/cron/sync-weather`) from Open-Meteo (free, keyless): 14-day forecast +
   prior-day actual. Thresholds: rain ≥5mm, heat ≥35°C shown as 💧/🔥 badges on the
   month grid, actuals take priority over forecast once known.
3. **Live hourly weather panel** — `HourlyWeatherPanel.tsx`, toggled via "Weather:
   on/off" in the toolbar, rendered to the **left** of the calendar grid. Separate
   from the daily badges above: this is a live, unpersisted passthrough
   (`/api/weather-hourly`) to Open-Meteo's forecast API, showing the *whole current
   day* (00:00–23:00, city-local) hour-by-hour with temp/precip%/precip-mm/weather
   emoji, auto-scrolled to the current hour, refreshing every 15 min. Built so an
   admin can eyeball whether a demand spike correlates with rain. "Now"/"today" are
   both derived from Open-Meteo's own `current_weather.time` (exact string match
   against the hourly array) rather than the viewer's browser clock, since
   Open-Meteo already returns everything in the city's own local time
   (`timezone=auto`) — don't reintroduce timezone-conversion logic here.
4. **Curated calendar events** (`calendar_events` table) — concerts/festivals/school
   breaks/etc, `source='manual'` (vs `'api-football'`, reserved for a sports-sync job
   that was investigated and shelved — see README's Fase 2 notes). Unique index on
   `(city_slug, start_date, title)` prevents duplicate-insert bugs.
   - **Country / Indigo edit scope**: the toolbar has 3 mutually-exclusive edit-scope
     buttons — `Edit {city}`, `Edit {country}` (both cities sharing the selected
     city's country), `Edit Indigo` (all 5 cities). Adding a new event in
     Country/Indigo scope writes one row per city in that group, tagged with a shared
     `batch_id` (uuid, only set when >1 city) so the whole group can be found and
     deleted together later via the "Delete batch" button — even from a narrower
     scope than it was created in. Editing/deleting a *single* event always only
     touches that one city's row regardless of active scope. See `DayEventModal.tsx`.
5. **Weekly B-burn (driver) / C-burn (passenger) tracking** — `weekly_burn` table +
   `src/app/BurnSidebar.tsx`, the biggest/most complex feature. Publicly viewable
   (no sign-in) via "Burn: on/off"; writes are admin-only via RLS. Import paths:
   manual CSV, raw-CSV (3 files: b burn/c burn/gmv, computed client-side), or a
   **combined XLSX workbook** (one tab per city, matched by name — the newest/easiest
   path). `b_locked`/`c_locked` flags let an admin manually override a value and
   have all import paths skip it thereafter (`upsertRespectingLocks()` helper).

## Brand color
Primary palette is DiDi's official orange ("Atomic Tangerine", PMS 1575C):
primary `#FD9153`, hover `#FC5E03`, light tint `#F9D0B8`, dark text-on-tint `#883607`
(this replaced an earlier forest-green scheme). Used consistently across all
components — match these exact hex values rather than introducing new shades.

## Known gotchas
- CSV/XLSX parsing must handle quoted fields with embedded commas (currency values
  like `"$ 31,615,191"`) and percent/currency symbol stripping.
- Google Sheets headers use underscores (`b_burn`), the app's normalization strips
  both spaces AND underscores (`normalizeHeader()`) — don't regress this.
- Date parsing: always construct dates from manual y/m/d components, never
  `new Date("2025-12-29")` — that parses as UTC and silently shifts a day in
  negative-UTC-offset timezones (Colombia/Mexico), corrupting ISO week boundaries.
- Card-sizing layout math (`CalendarApp.tsx`'s sizing `useLayoutEffect`): measure
  width from the unpadded flex row (`contentAreaRef`), not a padded container
  (overstates available space) and not the grid itself (which no longer shrinks to
  fit). Any new sidebar/panel needs its own `*_RESERVED` width constant subtracted
  from `availableWidth` here, same pattern as `BURN_SIDEBAR_RESERVED` and
  `WEATHER_PANEL_RESERVED`.
- Browser session/cache: after any Supabase key or major asset change, a hard
  refresh/incognito may be needed to see it.

## Possible follow-ups (mentioned, not built)
- A way to jump to a *specific past day's* hourly weather from the calendar (would
  need Open-Meteo's archive API for historical hours, not just the forecast API used
  by the live panel) — for checking an already-past demand spike, not just today's
  live conditions.
