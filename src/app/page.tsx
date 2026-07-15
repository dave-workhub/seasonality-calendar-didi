'use client';

import { useEffect, useMemo, useState } from 'react';
import { CLUSTERS, findCity } from '@/lib/cities';
import { isoWeek, getPaycheckDates, getBonusDates, HolidayEntry } from '@/lib/holidays';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const DAY_HEADERS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'];

const STORAGE_KEY = 'seasonality-calendar-selection';

type Category = 'official_holiday' | 'high_demand_celebration' | 'school_break' | 'back_to_school' | 'other_event';

const CATEGORY_META: Record<Category, { label: string; dot: string; cell: string }> = {
  official_holiday: { label: 'Official Holidays', dot: 'bg-[#FD7C41]', cell: 'bg-[#FD7C41] text-white font-bold' },
  high_demand_celebration: { label: 'High Demand Celebrations', dot: 'bg-emerald-500', cell: 'bg-emerald-500 text-white' },
  school_break: { label: 'School Break', dot: 'bg-amber-400', cell: 'bg-amber-400 text-black' },
  back_to_school: { label: 'Back to School', dot: 'bg-violet-500', cell: 'bg-violet-500 text-white' },
  other_event: { label: 'Other Events (Fairs, Concerts, Sports, etc.)', dot: 'bg-blue-600', cell: 'bg-blue-600 text-white' },
};

interface CalendarEvent {
  start_date: string;
  end_date: string | null;
  category: Category;
  title: string;
  source_url: string | null;
}

interface DayInfo {
  date: Date;
  isToday: boolean;
  holidayName: string | null;
  categories: { category: Category; title: string }[];
  isPaycheck: boolean;
  bonusName: string | null;
}

function dateKey(d: Date) {
  return `${d.getMonth()}-${d.getDate()}`;
}

function readPersistedSelection(): { cluster: string; city: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { cluster: string; city: string };
    return findCity(saved.city) ? saved : null;
  } catch {
    return null;
  }
}

export default function Home() {
  const [clusterSlug, setClusterSlug] = useState<string>(() => readPersistedSelection()?.cluster ?? 'casa');
  const [citySlug, setCitySlug] = useState<string>(() => readPersistedSelection()?.city ?? 'bogota');
  const [year, setYear] = useState<number>(2026);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [holidays, setHolidays] = useState<HolidayEntry[]>([]);
  const [holidaySource, setHolidaySource] = useState<'nager.date' | 'algorithmic-fallback' | null>(null);
  const [loading, setLoading] = useState(false);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  // Persist selection so it's remembered on the next visit.
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ cluster: clusterSlug, city: citySlug }));
  }, [clusterSlug, citySlug]);

  const resolved = findCity(citySlug);

  useEffect(() => {
    if (!findCity(citySlug)) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-param-change pattern
    setLoading(true);
    fetch(`/api/calendar-events?city=${citySlug}&year=${year}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setEvents(data.events ?? []);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [citySlug, year]);

  useEffect(() => {
    const city = findCity(citySlug);
    if (!city) return;
    let cancelled = false;
    fetch(`/api/holidays?country=${city.city.country}&year=${year}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setHolidays(data.holidays ?? []);
        setHolidaySource(data.source ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setHolidays([]);
          setHolidaySource(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [citySlug, year]);

  const dayMap = useMemo(() => {
    if (!resolved) return new Map<string, DayInfo>();
    const { city } = resolved;
    const holidaySet = new Set(holidays.map((h) => `${h.month}-${h.day}`));
    const paycheckSet = getPaycheckDates(year, holidaySet);
    const bonusDates = getBonusDates(city.country, year, holidaySet);
    const bonusMap = new Map(bonusDates.map((b) => [`${b.month}-${b.day}`, b.name]));

    const map = new Map<string, DayInfo>();
    const today = new Date();
    const ensure = (d: Date): DayInfo => {
      const k = dateKey(d);
      let info = map.get(k);
      if (!info) {
        info = {
          date: d,
          isToday:
            d.getFullYear() === today.getFullYear() &&
            d.getMonth() === today.getMonth() &&
            d.getDate() === today.getDate(),
          holidayName: null,
          categories: [],
          isPaycheck: paycheckSet.has(k),
          bonusName: bonusMap.get(k) ?? null,
        };
        map.set(k, info);
      }
      return info;
    };

    // Seed every day of the year so plain paycheck/bonus days (no holiday or event) still show up.
    for (const cursor = new Date(year, 0, 1); cursor.getFullYear() === year; cursor.setDate(cursor.getDate() + 1)) {
      ensure(new Date(cursor));
    }

    for (const h of holidays) {
      const d = new Date(year, h.month, h.day);
      const info = ensure(d);
      info.holidayName = h.name;
    }

    for (const ev of events) {
      const start = new Date(ev.start_date + 'T00:00:00');
      const end = ev.end_date ? new Date(ev.end_date + 'T00:00:00') : start;
      const cursor = new Date(start);
      while (cursor <= end) {
        if (cursor.getFullYear() === year) {
          const info = ensure(new Date(cursor));
          info.categories.push({ category: ev.category, title: ev.title });
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    return map;
  }, [resolved, year, events, holidays]);

  if (!resolved) return null;
  const { city, cluster } = resolved;

  return (
    <div className="w-full min-h-screen bg-white text-neutral-900">
    <div className="max-w-[1400px] mx-auto px-6 py-8">
      <h1 className="text-center text-2xl font-extrabold text-neutral-900 mb-6">
        Calendario de {city.name} ({cluster.name}) con festivos
      </h1>

      <div className="flex flex-wrap items-center justify-center gap-4 mb-6">
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          Cluster
          <select
            className="border border-neutral-300 rounded-md px-3 py-1.5 text-sm font-medium"
            value={clusterSlug}
            onChange={(e) => {
              const newCluster = CLUSTERS.find((c) => c.slug === e.target.value)!;
              setClusterSlug(newCluster.slug);
              setCitySlug(newCluster.cities[0].slug);
            }}
          >
            {CLUSTERS.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm text-neutral-600">
          Ciudad
          <select
            className="border border-neutral-300 rounded-md px-3 py-1.5 text-sm font-medium"
            value={citySlug}
            onChange={(e) => setCitySlug(e.target.value)}
          >
            {CLUSTERS.find((c) => c.slug === clusterSlug)!.cities.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-3">
          <button
            className="border border-neutral-300 rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:border-[#FD7C41] hover:text-[#FD7C41]"
            onClick={() => setYear((y) => y - 1)}
          >
            ‹ {year - 1}
          </button>
          <span className="text-2xl font-extrabold text-neutral-900">{year}</span>
          <button
            className="border border-neutral-300 rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:border-[#FD7C41] hover:text-[#FD7C41]"
            onClick={() => setYear((y) => y + 1)}
          >
            {year + 1} ›
          </button>
        </div>
        {loading && <span className="text-xs text-neutral-400">Cargando eventos…</span>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6">
        {MONTH_NAMES.map((mn, m) => (
          <MonthGrid key={m} year={year} month={m} monthName={mn} dayMap={dayMap} onHover={setTooltip} />
        ))}
      </div>

      <div className="flex flex-wrap justify-center gap-6 mt-6 text-xs text-neutral-500">
        <span>💰 Paycheck</span>
        <span>🎁 Bono</span>
        {(Object.keys(CATEGORY_META) as Category[]).map((cat) => (
          <span key={cat} className="flex items-center gap-1.5">
            <i className={`inline-block w-2.5 h-2.5 rounded-sm ${CATEGORY_META[cat].dot}`} />
            {CATEGORY_META[cat].label}
          </span>
        ))}
      </div>

      {holidaySource && (
        <div className="text-center text-[11px] text-neutral-400 mt-2">
          {holidaySource === 'nager.date' ? (
            <>Festivos en vivo vía <a href="https://date.nager.at" target="_blank" rel="noopener noreferrer" className="underline hover:text-[#FD7C41]">Nager.Date</a> (API pública, sin autenticación)</>
          ) : (
            <>⚠ Nager.Date no respondió — mostrando estimación algorítmica local</>
          )}
        </div>
      )}

      {tooltip && (
        <div
          className="fixed z-50 bg-neutral-900/90 text-white text-xs px-3 py-1.5 rounded-md pointer-events-none whitespace-nowrap shadow-lg"
          style={{ left: tooltip.x + 14, top: tooltip.y - 36 }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
    </div>
  );
}

function MonthGrid({
  year,
  month,
  monthName,
  dayMap,
  onHover,
}: {
  year: number;
  month: number;
  monthName: string;
  dayMap: Map<string, DayInfo>;
  onHover: (t: { x: number; y: number; text: string } | null) => void;
}) {
  const firstDow = new Date(year, month, 1).getDay();
  const offset = firstDow === 0 ? 6 : firstDow - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const w = cells.slice(i, i + 7);
    while (w.length < 7) w.push(null);
    weeks.push(w);
  }

  return (
    <div>
      <div className="text-center text-sm font-bold text-neutral-900 mb-1.5">{monthName}</div>
      <div className="grid grid-cols-7 gap-[2px] mb-1">
        {DAY_HEADERS.map((h, i) => (
          <div key={h} className={`text-center text-[10px] font-semibold pb-1 ${i === 6 ? 'text-[#FD7C41]' : 'text-neutral-400'}`}>
            {h}
          </div>
        ))}
      </div>
      {weeks.map((wk, wi) => (
        <div key={wi} className="grid grid-cols-7 gap-[2px] mb-[2px] rounded-sm hover:bg-[#FD7C41]/10 transition-colors">
          {wk.map((dt, di) => {
            if (!dt) return <div key={di} className="min-h-[22px]" />;
            const info = dayMap.get(dateKey(dt));
            const isSun = dt.getDay() === 0;
            const primaryCategory = info?.categories[0]?.category;
            const cellClasses = [
              'flex flex-col items-center justify-center rounded-sm min-h-[22px] py-0.5 text-[11.5px] leading-tight cursor-default',
              info?.holidayName ? 'bg-[#FD7C41] text-white font-bold rounded' : '',
              !info?.holidayName && primaryCategory ? CATEGORY_META[primaryCategory].cell + ' rounded' : '',
              !info?.holidayName && !primaryCategory && isSun ? 'text-[#FD7C41]' : '',
              !info?.holidayName && !primaryCategory && !isSun ? 'text-neutral-800' : '',
              info?.isToday ? 'outline outline-2 outline-neutral-900 -outline-offset-2 rounded' : '',
            ].join(' ');

            const tipParts = [`W${isoWeek(dt)}`];
            if (info?.holidayName) tipParts.push(info.holidayName);
            if (info?.isPaycheck) tipParts.push('💰 Paycheck');
            if (info?.bonusName) tipParts.push('🎁 ' + info.bonusName);
            for (const c of info?.categories ?? []) tipParts.push(c.title);
            const tipText = tipParts.join(' · ');

            const emojis = (info?.isPaycheck ? '💰' : '') + (info?.bonusName ? '🎁' : '');

            return (
              <div
                key={di}
                className={cellClasses}
                onMouseMove={(e) => onHover({ x: e.clientX, y: e.clientY, text: tipText })}
                onMouseLeave={() => onHover(null)}
              >
                <span>{dt.getDate()}</span>
                {emojis && <span className="text-[9px] leading-none">{emojis}</span>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
