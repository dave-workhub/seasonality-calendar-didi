'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { CLUSTERS, findCity } from '@/lib/cities';
import { isoWeek, getPaycheckDates, getBonusDates, HolidayEntry } from '@/lib/holidays';
import { supabase } from '@/lib/supabaseClient';
import AuthModal from './AuthModal';
import EditPanel from './EditPanel';
import AdminPanel from './AdminPanel';

export interface Profile {
  id: string;
  email: string;
  is_admin: boolean;
}

export type CityAccess = 'loading' | 'signed-out' | 'none' | 'pending' | 'approved' | 'admin';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const DAY_HEADERS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'];

const STORAGE_KEY = 'seasonality-calendar-selection';

export type Category = 'official_holiday' | 'high_demand_celebration' | 'school_break' | 'back_to_school' | 'other_event';

export const EDITABLE_CATEGORIES: Category[] = [
  'high_demand_celebration',
  'school_break',
  'back_to_school',
  'other_event',
];

// Muted palette — same hues as the DiDi orange accent, dialed back so a
// month full of markers doesn't read as visual noise.
const CATEGORY_META: Record<Category, { label: string; dot: string; cell: string }> = {
  official_holiday: { label: 'Official Holidays', dot: 'bg-[#F4A97C]', cell: 'bg-[#F4A97C] text-[#7A3A12] font-semibold' },
  high_demand_celebration: { label: 'High Demand Celebrations', dot: 'bg-[#A9CBAE]', cell: 'bg-[#A9CBAE] text-[#33502F]' },
  school_break: { label: 'School Break', dot: 'bg-[#EBD08A]', cell: 'bg-[#EBD08A] text-[#5C4A16]' },
  back_to_school: { label: 'Back to School', dot: 'bg-[#7FC4C0]', cell: 'bg-[#7FC4C0] text-[#0F3E3B]' },
  other_event: { label: 'Other Events (Fairs, Concerts, Sports, etc.)', dot: 'bg-[#A9C0D8]', cell: 'bg-[#A9C0D8] text-[#2C4562]' },
};

export interface CalendarEvent {
  id: number;
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

export default function CalendarApp() {
  const [clusterSlug, setClusterSlug] = useState<string>(() => readPersistedSelection()?.cluster ?? 'casa');
  const [citySlug, setCitySlug] = useState<string>(() => readPersistedSelection()?.city ?? 'bogota');
  const [year, setYear] = useState<number>(2026);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [holidays, setHolidays] = useState<HolidayEntry[]>([]);
  const [holidaySource, setHolidaySource] = useState<'nager.date' | 'algorithmic-fallback' | null>(null);
  const [loading, setLoading] = useState(false);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const refreshData = () => setDataVersion((v) => v + 1);

  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [cityAccess, setCityAccess] = useState<CityAccess>('signed-out');
  const [showAuth, setShowAuth] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  // Track auth session.
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Load the signed-in user's profile (admin flag).
  useEffect(() => {
    if (!supabase || !session) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset derived state when the session goes away
      setProfile(null);
      return;
    }
    let cancelled = false;
    supabase
      .from('profiles')
      .select('id, email, is_admin')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        if (!cancelled) setProfile(data as Profile | null);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  // Resolve this user's edit access to the currently selected city.
  useEffect(() => {
    if (!supabase) return;
    if (!session) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset derived state when the session goes away
      setCityAccess('signed-out');
      return;
    }
    if (!profile) {
      setCityAccess('loading');
      return;
    }
    if (profile.is_admin) {
      setCityAccess('admin');
      return;
    }
    let cancelled = false;
    setCityAccess('loading');
    supabase
      .from('city_permissions')
      .select('status')
      .eq('user_id', session.user.id)
      .eq('city_slug', citySlug)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setCityAccess(data ? (data.status as CityAccess) : 'none');
      });
    return () => {
      cancelled = true;
    };
  }, [session, profile, citySlug, dataVersion]);

  const headerRef = useRef<HTMLDivElement>(null);
  const gridWrapRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(6);
  const [cardSize, setCardSize] = useState<number | null>(null);

  // Size each month card so the whole grid — square cards included — always
  // fits the viewport without scrolling, at any window size.
  useLayoutEffect(() => {
    const GAP = 12; // matches gap-3

    function recompute() {
      const width = window.innerWidth;
      const c = width < 640 ? 2 : width < 1024 ? 3 : width < 1280 ? 4 : 6;
      const rows = Math.ceil(12 / c);

      const availableWidth = gridWrapRef.current?.clientWidth ?? width;
      const headerBottom = headerRef.current?.getBoundingClientRect().bottom ?? 0;
      const legendHeight = legendRef.current?.getBoundingClientRect().height ?? 40;
      const breathingRoom = 72; // grid-wrap py-6 (48) + legend's mt-3 (12) + safety buffer
      const availableHeight = window.innerHeight - headerBottom - legendHeight - breathingRoom;

      const byWidth = (availableWidth - GAP * (c - 1)) / c;
      const byHeight = (availableHeight - GAP * (rows - 1)) / rows;

      setCols(c);
      setCardSize(Math.max(70, Math.floor(Math.min(byWidth, byHeight))));
    }

    recompute();
    window.addEventListener('resize', recompute);
    // Backstop for size changes a window 'resize' event wouldn't fire for
    // (e.g. web-font metrics loading in and nudging the header's height).
    const ro = new ResizeObserver(recompute);
    ro.observe(document.body);
    return () => {
      window.removeEventListener('resize', recompute);
      ro.disconnect();
    };
  }, []);

  // Keep the tooltip fully on-screen even when hovering a day near the viewport edge.
  useLayoutEffect(() => {
    if (!tooltip || !tooltipRef.current) return;
    const el = tooltipRef.current;
    const rect = el.getBoundingClientRect();
    const margin = 8;

    let left = tooltip.x + 14;
    if (left + rect.width > window.innerWidth - margin) {
      left = tooltip.x - rect.width - 14; // flip to the left of the cursor
    }
    left = Math.max(margin, Math.min(left, window.innerWidth - rect.width - margin));

    let top = tooltip.y - 36;
    top = Math.max(margin, Math.min(top, window.innerHeight - rect.height - margin));

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [tooltip]);

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
  }, [citySlug, year, dataVersion]);

  useEffect(() => {
    const city = findCity(citySlug);
    if (!city) return;
    let cancelled = false;
    fetch(`/api/holidays?country=${city.city.country}&year=${year}&city=${citySlug}`)
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
  }, [citySlug, year, dataVersion]);

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

  async function requestCityAccess() {
    if (!supabase || !session) return;
    setCityAccess('loading');
    await supabase.from('city_permissions').insert({ user_id: session.user.id, city_slug: citySlug });
    refreshData();
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setShowEdit(false);
    setShowAdmin(false);
  }

  if (!resolved) return null;

  return (
    <>
    <div className="w-full min-h-screen bg-white text-neutral-900 flex flex-col">
    <div ref={headerRef} className="max-w-[1500px] mx-auto w-full px-8 lg:px-14 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-xl text-neutral-900 [font-family:var(--font-jakarta)] tracking-tight">
          DiDi <span className="text-[#FD7C41]">Marketplace</span> Context Calendar
        </h1>

        <div className="flex items-center gap-2">
          <select
            className="appearance-none cursor-pointer text-xs font-medium px-3 py-1.5 rounded-md border border-neutral-200 bg-neutral-50 text-neutral-600 hover:border-neutral-300 focus:outline-none focus:border-[#FD7C41] transition-colors"
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

          <select
            className="appearance-none cursor-pointer text-xs font-medium px-3 py-1.5 rounded-md border border-neutral-200 bg-neutral-50 text-neutral-600 hover:border-neutral-300 focus:outline-none focus:border-[#FD7C41] transition-colors"
            value={citySlug}
            onChange={(e) => setCitySlug(e.target.value)}
          >
            {CLUSTERS.find((c) => c.slug === clusterSlug)!.cities.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1.5 border border-neutral-200 rounded-md px-1.5 py-1">
            <button
              aria-label="Año anterior"
              className="w-5 h-5 flex items-center justify-center rounded text-neutral-400 hover:text-[#FD7C41] transition-colors"
              onClick={() => setYear((y) => y - 1)}
            >
              ‹
            </button>
            <span className="text-sm font-bold text-neutral-900 tabular-nums w-10 text-center">{year}</span>
            <button
              aria-label="Año siguiente"
              className="w-5 h-5 flex items-center justify-center rounded text-neutral-400 hover:text-[#FD7C41] transition-colors"
              onClick={() => setYear((y) => y + 1)}
            >
              ›
            </button>
          </div>

          <span className={`text-[10px] text-neutral-400 transition-opacity w-16 ${loading ? 'opacity-100' : 'opacity-0'}`}>
            Cargando…
          </span>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 mb-2 text-xs">
        {profile?.is_admin && (
          <button
            onClick={() => setShowAdmin(true)}
            className="px-2.5 py-1 rounded-md border border-neutral-200 text-neutral-600 hover:border-[#FD7C41] hover:text-[#FD7C41] transition-colors"
          >
            Admin
          </button>
        )}

        {cityAccess === 'admin' || cityAccess === 'approved' ? (
          <button
            onClick={() => setShowEdit(true)}
            className="px-2.5 py-1 rounded-md bg-[#FD7C41] text-white font-medium hover:bg-[#e86d34] transition-colors"
          >
            Editar {resolved!.city.name}
          </button>
        ) : cityAccess === 'pending' ? (
          <span className="px-2.5 py-1 rounded-md bg-neutral-100 text-neutral-400">Solicitud pendiente</span>
        ) : cityAccess === 'none' ? (
          <button
            onClick={requestCityAccess}
            className="px-2.5 py-1 rounded-md border border-neutral-200 text-neutral-600 hover:border-[#FD7C41] hover:text-[#FD7C41] transition-colors"
          >
            Solicitar acceso a {resolved!.city.name}
          </button>
        ) : null}

        {session ? (
          <span className="flex items-center gap-1.5 text-neutral-400">
            {session.user.email}
            <button onClick={signOut} className="underline hover:text-[#FD7C41]">
              Salir
            </button>
          </span>
        ) : (
          <button onClick={() => setShowAuth(true)} className="px-2.5 py-1 rounded-md border border-neutral-200 text-neutral-600 hover:border-[#FD7C41] hover:text-[#FD7C41] transition-colors">
            Iniciar sesión
          </button>
        )}
      </div>
    </div>

    <div className="flex-1 flex flex-col justify-center">
    <div className="max-w-[1500px] mx-auto w-full px-8 lg:px-14 py-6">
      <div ref={gridWrapRef}
        className="grid justify-center gap-3"
        style={{ gridTemplateColumns: `repeat(${cols}, ${cardSize ?? 100}px)` }}
      >
        {MONTH_NAMES.map((mn, m) => (
          <MonthGrid key={m} year={year} month={m} monthName={mn} dayMap={dayMap} onHover={setTooltip} size={cardSize ?? 100} />
        ))}
      </div>

      <div ref={legendRef} className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 mt-3 px-4 py-2 border border-neutral-200 rounded-md bg-neutral-50/60 text-[11px] text-neutral-500">
        <span>💰 Paycheck</span>
        <span>🎁 Bono</span>
        {(Object.keys(CATEGORY_META) as Category[]).map((cat) => (
          <span key={cat} className="flex items-center gap-1.5">
            <i className={`inline-block w-2.5 h-2.5 rounded-sm ${CATEGORY_META[cat].dot}`} />
            {CATEGORY_META[cat].label}
          </span>
        ))}
      </div>

      {holidaySource === 'algorithmic-fallback' && (
        <div className="text-center text-[11px] text-neutral-400 mt-2">
          ⚠ Festivos no disponibles en este momento — mostrando estimación local
        </div>
      )}

      {tooltip && (
        <div
          ref={tooltipRef}
          className="fixed z-50 bg-neutral-900/90 text-white text-xs px-3 py-1.5 rounded-md pointer-events-none whitespace-nowrap shadow-lg"
          style={{ left: tooltip.x + 14, top: tooltip.y - 36 }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
    </div>
    </div>

    {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}

    {showEdit && resolved && (
      <EditPanel
        citySlug={citySlug}
        cityName={resolved.city.name}
        year={year}
        events={events}
        holidays={holidays}
        onClose={() => setShowEdit(false)}
        onChanged={refreshData}
      />
    )}

    {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
    </>
  );
}

function MonthGrid({
  year,
  month,
  monthName,
  dayMap,
  onHover,
  size,
}: {
  year: number;
  month: number;
  monthName: string;
  dayMap: Map<string, DayInfo>;
  onHover: (t: { x: number; y: number; text: string } | null) => void;
  size: number;
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
  // Always render 6 week rows so every month's day cells are the same
  // height, regardless of how many weeks that particular month spans.
  while (weeks.length < 6) weeks.push(new Array(7).fill(null));

  const pad = Math.max(4, Math.round(size / 40));
  const badgeFont = Math.max(9, Math.min(13, size / 10));
  const headerFont = Math.max(7, Math.min(10, size / 16));
  const dayFont = Math.max(8, Math.min(13, size / 11));
  const emojiFont = Math.max(7, Math.min(11, size / 12));

  return (
    <div
      className="bg-neutral-50 border border-neutral-100 rounded-lg flex flex-col overflow-hidden"
      style={{ width: size, height: size, padding: pad }}
    >
      <div className="flex justify-center shrink-0" style={{ marginBottom: pad / 2 }}>
        <span
          className="font-semibold text-white bg-[#FD7C41] rounded-md tracking-wide"
          style={{ fontSize: badgeFont, padding: `${pad / 3}px ${pad}px` }}
        >
          {monthName}
        </span>
      </div>
      <div className="grid grid-cols-7 shrink-0" style={{ marginBottom: pad / 3 }}>
        {DAY_HEADERS.map((h, i) => (
          <div
            key={h}
            className={`text-center font-semibold ${i === 6 ? 'text-[#FD7C41]' : 'text-neutral-400'}`}
            style={{ fontSize: headerFont }}
          >
            {h}
          </div>
        ))}
      </div>
      <div className="flex-1 min-h-0 grid gap-[2px]" style={{ gridTemplateRows: 'repeat(6, 1fr)' }}>
        {weeks.map((wk, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-[2px] rounded-sm hover:bg-[#FD7C41]/10 transition-colors">
            {wk.map((dt, di) => {
              if (!dt) return <div key={di} />;
              const info = dayMap.get(dateKey(dt));
              const isSun = dt.getDay() === 0;
              const primaryCategory = info?.categories[0]?.category;
              const cellClasses = [
                'flex flex-col items-center justify-center rounded-sm overflow-hidden leading-tight cursor-default h-full',
                info?.holidayName ? CATEGORY_META.official_holiday.cell + ' rounded' : '',
                !info?.holidayName && primaryCategory ? CATEGORY_META[primaryCategory].cell + ' rounded' : '',
                !info?.holidayName && !primaryCategory && isSun ? 'text-[#FD7C41]/70' : '',
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
                  <span style={{ fontSize: dayFont }}>{dt.getDate()}</span>
                  {emojis && (
                    <span className="leading-none whitespace-nowrap" style={{ fontSize: emojiFont }}>
                      {emojis}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
