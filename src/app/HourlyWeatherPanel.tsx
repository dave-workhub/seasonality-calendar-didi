'use client';

import { useEffect, useRef, useState } from 'react';
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

// Today's date as YYYY-MM-DD in the viewer's local timezone (a good enough
// approximation for the "is this today?" check; city-local time is confirmed
// via nowTime from the server response).
function localTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function HourlyWeatherPanel({
  citySlug,
  cityName,
  authHeaders,
  selectedDate,
  onResetToLive,
}: {
  citySlug: string;
  cityName: string;
  authHeaders: Record<string, string> | undefined;
  // YYYY-MM-DD of the day to show; undefined = live today (original behavior)
  selectedDate?: string;
  // Called when the user clicks "Today" to reset the panel back to live
  onResetToLive?: () => void;
}) {
  const [hours, setHours] = useState<HourlyPoint[]>([]);
  const [nowTime, setNowTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Per-date response cache so historical days are only fetched once per session.
  // Keyed by "citySlug:YYYY-MM-DD". Cleared when citySlug changes.
  const cache = useRef<Map<string, HourlyWeatherResponse>>(new Map());
  const cachedCityRef = useRef(citySlug);
  if (cachedCityRef.current !== citySlug) {
    cache.current.clear();
    cachedCityRef.current = citySlug;
  }

  useEffect(() => {
    let cancelled = false;
    const today = localTodayStr();
    // Live mode: no selectedDate, or the selected date is today
    const isLive = !selectedDate || selectedDate === today;
    // Past: selected date is before today (use cache, no polling)
    const isPast = !!selectedDate && selectedDate < today;
    const cacheKey = `${citySlug}:${selectedDate ?? 'live'}`;

    async function load() {
      // Return cached data immediately for past dates (they never change)
      if (isPast) {
        const cached = cache.current.get(cacheKey);
        if (cached) {
          setHours(cached.hours);
          setNowTime(cached.nowTime);
          setError(null);
          setLoading(false);
          return;
        }
      }

      setLoading(true);
      try {
        const url = isLive
          ? `/api/weather-hourly?city=${citySlug}`
          : `/api/weather-hourly?city=${citySlug}&date=${selectedDate}`;
        const res = await fetch(url, { headers: authHeaders });
        const data: HourlyWeatherResponse & { error?: string } = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? 'Failed to load weather');
          setLoading(false);
          return;
        }
        if (isPast) {
          cache.current.set(cacheKey, { hours: data.hours, nowTime: data.nowTime });
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

    // Only poll for live or future forecast data; past data never changes
    let interval: ReturnType<typeof setInterval> | undefined;
    if (isLive || (!isPast && selectedDate)) {
      interval = setInterval(load, REFRESH_MS);
    }

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [citySlug, selectedDate, authHeaders]);

  const today = localTodayStr();
  const isLive = !selectedDate || selectedDate === today;
  const isPast = !!selectedDate && selectedDate < today;

  // Live mode: API returns 3 days, filter to today by nowTime's date prefix.
  // Dated mode: API already returns just that day's 24 hours.
  const displayDate = isLive
    ? (nowTime ? nowTime.slice(0, 10) : hours[0]?.time.slice(0, 10))
    : selectedDate;
  const visible = isLive
    ? hours.filter((h) => h.time.slice(0, 10) === displayDate)
    : hours;

  const modeLabel = isLive
    ? 'Hour-by-hour, live feed'
    : isPast
    ? 'Historical actuals'
    : hours.length === 0 && !loading
    ? 'Outside 16-day forecast window'
    : '14-day forecast';

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
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-neutral-900">{cityName} weather</p>
          {!isLive && onResetToLive && (
            <button
              onClick={onResetToLive}
              className="text-[10px] text-[#FD9153] hover:underline leading-none"
            >
              Today
            </button>
          )}
        </div>
        <p className="text-[10px] text-neutral-400">
          {displayDate ? formatDayLabel(displayDate + 'T00:00') : ''} — {modeLabel}
        </p>
      </div>

      {loading && hours.length === 0 && <p className="text-xs text-neutral-400 px-3 py-3">Loading…</p>}
      {error && <p className="text-xs text-red-600 px-3 py-3">{error}</p>}
      {!loading && !error && visible.length === 0 && (
        <p className="text-xs text-neutral-400 px-3 py-3">No data available for this date.</p>
      )}

      {visible.length > 0 && (
        <div className="overflow-y-auto flex-1">
          {visible.map((h) => {
            // "Now" highlight only makes sense when viewing today's live feed
            const isNow = isLive && h.time === nowTime;
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
