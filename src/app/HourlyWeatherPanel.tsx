'use client';

import { useEffect, useState } from 'react';
import type { HourlyPoint, HourlyWeatherResponse } from './api/weather-hourly/route';

// Rolling window shown around "now": a few hours of recent context plus the
// rest of the day ahead -- this is meant to answer "is the demand spike I'm
// seeing right now caused by rain?", not to browse the whole 2-day fetch.
const HOURS_BEFORE_NOW = 3;
const HOURS_AFTER_NOW = 20;

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

  const nowIndex = nowTime ? hours.findIndex((h) => h.time === nowTime) : -1;
  const windowStart = nowIndex >= 0 ? Math.max(0, nowIndex - HOURS_BEFORE_NOW) : 0;
  const windowEnd = nowIndex >= 0 ? nowIndex + HOURS_AFTER_NOW + 1 : hours.length;
  const visible = hours.slice(windowStart, windowEnd);

  return (
    <div className="w-[220px] shrink-0 border border-neutral-200 rounded-md overflow-hidden flex flex-col max-h-[80vh]">
      <div className="px-3 py-2 border-b border-neutral-200 bg-neutral-50/60">
        <p className="text-xs font-semibold text-neutral-900">{cityName} weather</p>
        <p className="text-[10px] text-neutral-400">Hourly, live from Open-Meteo</p>
      </div>

      {loading && hours.length === 0 && <p className="text-xs text-neutral-400 px-3 py-3">Loading…</p>}
      {error && <p className="text-xs text-red-600 px-3 py-3">{error}</p>}

      {visible.length > 0 && (
        <div className="overflow-y-auto flex-1">
          {visible.map((h, i) => {
            const isNow = h.time === nowTime;
            const prevDay = i > 0 ? formatDayLabel(visible[i - 1].time) : null;
            const day = formatDayLabel(h.time);
            const showDayDivider = i === 0 || day !== prevDay;
            const rain = (h.precipMm ?? 0) >= 0.5 || (h.precipProb ?? 0) >= 50;
            return (
              <div key={h.time}>
                {showDayDivider && (
                  <div className="px-3 py-1 bg-neutral-50 text-[9px] text-neutral-400 font-medium sticky top-0">{day}</div>
                )}
                <div
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
