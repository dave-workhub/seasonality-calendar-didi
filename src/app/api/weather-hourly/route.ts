import { NextRequest, NextResponse } from 'next/server';
import { findCity } from '@/lib/cities';
import { getAuthorizedDidilabsEmail } from '@/lib/serverAuth';

/**
 * Live hourly weather — Open-Meteo forecast API (open-meteo.com), free and
 * keyless, same provider as the daily rain_daily sync. Unlike that sync,
 * nothing here is persisted: this is a plain passthrough fetched fresh on
 * every request so the panel always reflects Open-Meteo's latest model run.
 *
 * Without a `date` param: returns yesterday + today + tomorrow's hourly data
 * (city-local time, via timezone=auto) so the UI can show a rolling window
 * around "now".
 *
 * With a `date` param (YYYY-MM-DD): returns just that day's 24 hours.
 *   - Within last 92 days or next 16 days: uses the forecast API (includes
 *     precipitation_probability for recent past too).
 *   - More than 92 days ago: uses the archive API (no precipitation_probability
 *     since that's a forecast-only field; precipProb is null in the response).
 *   - More than 16 days in the future: returns empty hours (outside window).
 */

interface OpenMeteoHourly {
  time: string[];
  temperature_2m: number[];
  precipitation: number[];
  precipitation_probability?: number[]; // not present in archive API response
  weathercode: number[];
}

export interface HourlyPoint {
  time: string; // ISO, city-local (no offset) per Open-Meteo's timezone=auto
  tempC: number | null;
  precipMm: number | null;
  precipProb: number | null; // null for archive (historical) data
  weatherCode: number | null;
}

export interface HourlyWeatherResponse {
  hours: HourlyPoint[];
  // Open-Meteo's own "now" for this city, city-local, same naive format as
  // each hour's `time` -- lets the UI find "the current hour" by string
  // match instead of needing a timezone library to convert the viewer's own
  // clock into the city's local time. Null for historical/far-future dates.
  nowTime: string | null;
}

function parseHourly(data: { hourly: OpenMeteoHourly }): HourlyPoint[] {
  return data.hourly.time.map((time, i) => ({
    time,
    tempC: data.hourly.temperature_2m[i] ?? null,
    precipMm: data.hourly.precipitation[i] ?? null,
    precipProb: data.hourly.precipitation_probability?.[i] ?? null,
    weatherCode: data.hourly.weathercode?.[i] ?? null,
  }));
}

// Days from date A to date B (positive = B is in the future relative to A).
// Uses Date.UTC to avoid locale-timezone pitfalls with "YYYY-MM-DD" strings.
function dateDiffDays(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

export async function GET(req: NextRequest) {
  const citySlug = req.nextUrl.searchParams.get('city');
  const requestDate = req.nextUrl.searchParams.get('date'); // YYYY-MM-DD, optional
  const resolved = citySlug ? findCity(citySlug) : null;
  if (!resolved) {
    return NextResponse.json({ error: 'unknown city' }, { status: 400 });
  }

  const authorizedEmail = await getAuthorizedDidilabsEmail(req);
  if (!authorizedEmail) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }

  const { lat, lon } = resolved.city;

  try {
    // No date: existing live behavior (yesterday + today + tomorrow)
    if (!requestDate) {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
          `&hourly=temperature_2m,precipitation,precipitation_probability,weathercode` +
          `&current_weather=true&timezone=auto&past_days=1&forecast_days=2`
      );
      if (!res.ok) {
        return NextResponse.json({ error: `Open-Meteo returned ${res.status}` }, { status: 502 });
      }
      const data: { hourly: OpenMeteoHourly; current_weather?: { time: string } } = await res.json();
      const hours = parseHourly(data);
      const response: HourlyWeatherResponse = { hours, nowTime: data.current_weather?.time ?? null };
      return NextResponse.json(response);
    }

    // Date provided — determine which API covers this date
    const todayStr = new Date().toISOString().slice(0, 10); // UTC, good enough approximation
    const diffDays = dateDiffDays(todayStr, requestDate); // positive = future

    // Beyond the 16-day forecast horizon
    if (diffDays > 16) {
      const response: HourlyWeatherResponse = { hours: [], nowTime: null };
      return NextResponse.json(response);
    }

    // Within the forecast API's range (past_days 0–92, forecast_days 1–16)
    if (diffDays >= -92) {
      const pastDays = Math.max(0, -diffDays);
      const forecastDays = Math.max(1, diffDays + 1);
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
          `&hourly=temperature_2m,precipitation,precipitation_probability,weathercode` +
          `&current_weather=true&timezone=auto&past_days=${pastDays}&forecast_days=${forecastDays}`
      );
      if (!res.ok) {
        return NextResponse.json({ error: `Open-Meteo returned ${res.status}` }, { status: 502 });
      }
      const data: { hourly: OpenMeteoHourly; current_weather?: { time: string } } = await res.json();
      const allHours = parseHourly(data);
      const hours = allHours.filter((h) => h.time.slice(0, 10) === requestDate);
      const response: HourlyWeatherResponse = {
        hours,
        nowTime: data.current_weather?.time ?? null,
      };
      return NextResponse.json(response);
    }

    // Historical: archive API (precipitation_probability not available)
    const res = await fetch(
      `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
        `&start_date=${requestDate}&end_date=${requestDate}` +
        `&hourly=temperature_2m,precipitation,weathercode&timezone=auto`
    );
    if (!res.ok) {
      return NextResponse.json({ error: `Open-Meteo archive returned ${res.status}` }, { status: 502 });
    }
    const data: { hourly: OpenMeteoHourly } = await res.json();
    const hours = parseHourly(data);
    const response: HourlyWeatherResponse = { hours, nowTime: null };
    return NextResponse.json(response);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'fetch failed' }, { status: 502 });
  }
}
