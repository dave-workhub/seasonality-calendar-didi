import { NextRequest, NextResponse } from 'next/server';
import { findCity } from '@/lib/cities';
import { getAuthorizedDidilabsEmail } from '@/lib/serverAuth';

/**
 * Live hourly weather — Open-Meteo forecast API (open-meteo.com), free and
 * keyless, same provider as the daily rain_daily sync. Unlike that sync,
 * nothing here is persisted: this is a plain passthrough fetched fresh on
 * every request so the panel always reflects Open-Meteo's latest model run.
 *
 * Returns yesterday + today + tomorrow's hourly data (city-local time, via
 * timezone=auto) so the UI can show a rolling window of recent-past-through-
 * next-24h hours around "now", not just whatever's left of today.
 */

interface OpenMeteoHourly {
  time: string[];
  temperature_2m: number[];
  precipitation: number[];
  precipitation_probability: number[];
  weathercode: number[];
}

export interface HourlyPoint {
  time: string; // ISO, city-local (no offset) per Open-Meteo's timezone=auto
  tempC: number | null;
  precipMm: number | null;
  precipProb: number | null;
  weatherCode: number | null;
}

export interface HourlyWeatherResponse {
  hours: HourlyPoint[];
  // Open-Meteo's own "now" for this city, city-local, same naive format as
  // each hour's `time` -- lets the UI find "the current hour" by string
  // match instead of needing a timezone library to convert the viewer's own
  // clock into the city's local time.
  nowTime: string | null;
}

export async function GET(req: NextRequest) {
  const citySlug = req.nextUrl.searchParams.get('city');
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
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&hourly=temperature_2m,precipitation,precipitation_probability,weathercode` +
        `&current_weather=true&timezone=auto&past_days=1&forecast_days=2`
    );
    if (!res.ok) {
      return NextResponse.json({ error: `Open-Meteo returned ${res.status}` }, { status: 502 });
    }
    const data: { hourly: OpenMeteoHourly; current_weather?: { time: string } } = await res.json();
    const hours: HourlyPoint[] = data.hourly.time.map((time, i) => ({
      time,
      tempC: data.hourly.temperature_2m[i] ?? null,
      precipMm: data.hourly.precipitation[i] ?? null,
      precipProb: data.hourly.precipitation_probability?.[i] ?? null,
      weatherCode: data.hourly.weathercode?.[i] ?? null,
    }));
    const response: HourlyWeatherResponse = { hours, nowTime: data.current_weather?.time ?? null };
    return NextResponse.json(response);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'fetch failed' }, { status: 502 });
  }
}
