'use client';

import { useEffect, useState } from 'react';
import type { HourlyPoint, HourlyWeatherResponse } from './api/weather-hourly/route';

const REFRESH_MS = 15 * 60 * 1000; // Open-Meteo's model updates roughly hourly; no need to poll faster than this

// Coarse WMO weather-code -> emoji mapping, grouped into the buckets that
// actually matter for "why is demand doing this": clear, cloudy, fog,
// drizzle, rain, thunderstorm. (Snow codes exist in the WMO table but never
// apply to these 5 cities, so they're lumped into the rain bucket instead of
// getting their own case.)
function weatherEmoji(code: number | null): string {
  if (code === null) return '—';
  if (code === 0) return '☀️';
  if (code <= 2) return '🌤️';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫️';
  if (code >= 51 && code <= 57) return '🌦️';
  if (code >= 61 && code <= 82) return '🌧️';
  if (code >= 95) return '⛈️';
  return '☁️';
}

function formatHourLabel(iso: string): string {
  // iso is a naive city-local datetime string like "2026-08-25T14:00" --
  // parse the hour directly out of the string rather than through Date()
  // (which would reinterpret it in the viewer's own timezone).
  const hour = Number(iso.slice(11, 13));
  const suffix = hour < 12 ? 'AM' : 'PM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${suffix}`;
}

function formatDayLabel(iso: string): string {
  const [, m, d] = iso.split(/[-T]/);
  return `${Number(m)}/${Number(d)}`;
}

export default function HourlyWeatherPanel({
  citySlug,
  cityName,
  authHeaders,
}: {
  citySlug: string;
  cityName: string;
  authHeaders: Record<string, string> | undefined;
}) {
  const [hours, setHours] = useState<HourlyPoint[]>([]);
  const [nowTime, setNowTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/weather-hourly?city=${citySlug}`, { headers: authHeaders });
        const data: HourlyWeatherResponse & { error?: string } = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? 'Failed to load weather');
          return;
        }
        setHours(data.hours);
        setNowTime(data.nowTime);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load weather');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [citySlug, authHeaders]);

  // Show the whole current day, 00:00 through 23:00 -- "today" as defined by
  // Open-Meteo's own city-local current_weather.time, not the viewer's date.
  const today = nowTime ? nowTime.slice(0, 10) : hours[0]?.time.slice(0, 10);
  const visible = today ? hours.filter((h) => h.time.slice(0, 10) === today) : [];

  // Auto-scroll the current hour into view on load/refresh -- with all 24
  // hours listed, the current one would otherwise be scrolled off below the
  // fold most of the day.
  const [nowRowEl, setNowRowEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    nowRowEl?.scrollIntoView({ block: 'center' });
  }, [nowRowEl, nowTime]);

  return (
    <div className="w-[220px] shrink-0 border border-neutral-200 rounded-md overflow-hidden flex flex-col max-h-[80vh]">
      <div className="px-3 py-2 border-b border-neutral-200 bg-neutral-50/60">
        <p className="text-xs font-semibold text-neutral-900">{cityName} weather</p>
        <p className="text-[10px] text-neutral-400">{today ? formatDayLabel(today + 'T00:00') : ''} — Hour-by-hour, live feed</p>
      </div>

      {loading && hours.length === 0 && <p className="text-xs text-neutral-400 px-3 py-3">Loading…</p>}
      {error && <p className="text-xs text-red-600 px-3 py-3">{error}</p>}

      {visible.length > 0 && (
        <div className="overflow-y-auto flex-1">
          {visible.map((h) => {
            const isNow = h.time === nowTime;
            const rain = (h.precipMm ?? 0) >= 0.5 || (h.precipProb ?? 0) >= 50;
            return (
              <div
                key={h.time}
                ref={isNow ? setNowRowEl : undefined}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs border-b border-neutral-50 ${
                  isNow ? 'bg-[#F9D0B8]/40 font-medium' : ''
                }`}
              >
                <span className="w-11 shrink-0 text-neutral-500">{formatHourLabel(h.time)}</span>
                <span className="w-5 shrink-0 text-center">{weatherEmoji(h.weatherCode)}</span>
                <span className="w-9 shrink-0 text-neutral-700">{h.tempC !== null ? `${Math.round(h.tempC)}°` : '—'}</span>
                <span className={`flex-1 text-right ${rain ? 'text-[#883607]' : 'text-neutral-400'}`}>
                  {h.precipProb !== null ? `${h.precipProb}%` : '—'}
                  {h.precipMm !== null && h.precipMm > 0 ? ` (${h.precipMm.toFixed(1)}mm)` : ''}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
