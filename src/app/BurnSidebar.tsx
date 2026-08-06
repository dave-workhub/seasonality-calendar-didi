'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { currencyForCity } from '@/lib/cities';
import { isoWeek, isoWeekLabel, isoYear } from '@/lib/holidays';

interface BurnRow {
  id: number;
  iso_year: number;
  iso_week: number;
  b_burn_pct: number | null;
  b_burn_nominal: number | null;
  c_burn_pct: number | null;
  c_burn_nominal: number | null;
  currency: string;
  updated_at: string;
}

// Expected header cells, case/space-insensitive, in this column order:
// Year | Week | City | B Burn % | B Burn Nominal | C Burn % | C Burn Nominal
const EXPECTED_HEADERS = ['year', 'week', 'city', 'bburn%', 'bburnnominal', 'cburn%', 'cburnnominal'];

function normalizeHeader(h: string) {
  return h.trim().toLowerCase().replace(/[\s_]+/g, '');
}

// Proper CSV/TSV line split — respects quoted fields (so "$ 1,234,567" with
// an embedded comma stays one field instead of shredding into two).
function splitLine(line: string): string[] {
  const delim = line.includes('\t') && !line.includes(',') ? '\t' : ',';
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      cells.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

// Strips currency symbols, percent signs, spaces, and thousands separators.
function num(v: string): number | null {
  if (v === undefined || v === null) return null;
  const trimmed = v.trim();
  // Scientific notation (e.g. "1.58E+08") — handle before the strip below
  // would mangle the exponent's "E+" into garbage.
  if (/^-?\d+(\.\d+)?[eE][+-]?\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  const cleaned = trimmed.replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function fmtNum(n: number | null) {
  if (n === null) return '—';
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toString();
}

interface RawRow {
  date: Date;
  city: string;
  value: number;
}

// Parses a raw daily-level export (date + city + one value column, plus
// whatever other columns — spend_channel, creator, product_id, etc. — get
// ignored) into {date, city, value} rows. Columns are found by fuzzy header
// match, not fixed position, since exports may reorder columns.
function parseRawCsv(text: string, valueAliases: string[]): { rows: RawRow[]; error: string | null } {
  const lines = text.trim().split('\n').filter((l) => l.trim() !== '');
  if (lines.length < 2) return { rows: [], error: 'File needs a header row plus at least one data row.' };

  const header = splitLine(lines[0]).map(normalizeHeader);
  const dateIdx = header.findIndex((h) => h.includes('date'));
  const cityIdx = header.findIndex((h) => h.includes('city'));
  const valueIdx = header.findIndex((h) => valueAliases.includes(h));

  if (dateIdx === -1 || cityIdx === -1 || valueIdx === -1) {
    return { rows: [], error: `Couldn't find date/city/value columns in the header (looked for a "date" column, a "city" column, and one of: ${valueAliases.join(', ')}).` };
  }

  const rows: RawRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    const dateStr = cells[dateIdx];
    const city = (cells[cityIdx] ?? '').trim();
    const value = num(cells[valueIdx]);
    if (!dateStr || !city || value === null) continue; // skip malformed/blank rows silently
    // Handles "2026-01-21" and "2026-01-21 0:00" alike. Built via the
    // (year, month, day) constructor rather than new Date("2026-01-21") —
    // that string form parses as UTC midnight per spec, which silently
    // shifts a day off in any timezone behind UTC (Colombia, Mexico) once
    // isoWeek/isoYear's local-time methods touch it.
    const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) continue;
    const date = new Date(y, m - 1, d);
    if (Number.isNaN(date.getTime())) continue;
    rows.push({ date, city, value });
  }
  return { rows, error: null };
}

interface WeeklyTotals {
  isoYear: number;
  isoWeek: number;
  bSum: number | null;
  cSum: number | null;
  gmvSum: number | null;
}

// Groups three raw daily datasets (already filtered to the right user, per
// the Sheets FILTER formulas) by ISO week, filters to the current city by
// name, sums each, and derives B/C burn % from nominal ÷ GMV.
function aggregateWeekly(bRows: RawRow[], cRows: RawRow[], gmvRows: RawRow[], cityName: string): WeeklyTotals[] {
  const cityLower = cityName.trim().toLowerCase();
  const matchesCity = (r: RawRow) => r.city.trim().toLowerCase() === cityLower;

  const sumByWeek = (rows: RawRow[]) => {
    const map = new Map<string, number>();
    for (const r of rows) {
      if (!matchesCity(r)) continue;
      const key = weekKey(isoYear(r.date), isoWeek(r.date));
      map.set(key, (map.get(key) ?? 0) + r.value);
    }
    return map;
  };

  const bMap = sumByWeek(bRows);
  const cMap = sumByWeek(cRows);
  const gmvMap = sumByWeek(gmvRows);

  const allKeys = new Set([...bMap.keys(), ...cMap.keys()]);
  const round2 = (n: number) => Math.round(n * 100) / 100;

  return Array.from(allKeys)
    .map((key) => {
      const [yearStr, weekStr] = key.split('-W');
      const gmv = gmvMap.get(key) ?? null;
      const bSum = bMap.get(key) ?? null;
      const cSum = cMap.get(key) ?? null;
      return {
        isoYear: Number(yearStr),
        isoWeek: Number(weekStr),
        bSum: bSum !== null ? round2(bSum) : null,
        cSum: cSum !== null ? round2(cSum) : null,
        gmvSum: gmv !== null ? round2(gmv) : null,
      };
    })
    .sort((a, b) => a.isoYear - b.isoYear || a.isoWeek - b.isoWeek);
}

// Percentage-point delta (not a relative %) — the right way to compare two
// already-percentage values, e.g. 1.1% vs 0.9% is "+0.2pp", not "+22%".
function ppDelta(current: number | null, prior: number | null): number | null {
  if (current === null || prior === null) return null;
  return Math.round((current - prior) * 100) / 100;
}

function DeltaBadge({ pp }: { pp: number | null }) {
  if (pp === null) return null;
  if (pp === 0) return <span className="text-neutral-400">·0pp</span>;
  const up = pp > 0;
  return <span className={up ? 'text-[#3B6D11]' : 'text-red-600'}>{up ? '▲' : '▼'}{Math.abs(pp)}pp</span>;
}

function weekKey(year: number, week: number) {
  return `${year}-W${week}`;
}

function fmtTimestamp(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const month = d.toLocaleString('en', { month: 'short', timeZone: 'UTC' });
  const day = d.getUTCDate();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${month} ${day}, ${hh}:${mm} UTC`;
}

// Small dual-line trend chart: B burn (green) and C burn (pink) over the
// last few weeks, oldest to newest. Points with no data leave a gap rather
// than being guessed at.
function BurnSparkline({ points }: { points: { b: number | null; c: number | null }[] }) {
  const n = points.length;
  if (n < 2) return null;

  const allVals = points.flatMap((p) => [p.b, p.c]).filter((v): v is number => v !== null);
  if (allVals.length === 0) return null;

  const W = 200;
  const H = 44;
  const PAD = 4;
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const range = max - min || 1;
  const xStep = W / (n - 1);
  const toY = (v: number) => H - PAD - ((v - min) / range) * (H - PAD * 2);

  const linePoints = (key: 'b' | 'c') =>
    points
      .map((p, i) => (p[key] !== null ? `${(i * xStep).toFixed(1)},${toY(p[key] as number).toFixed(1)}` : null))
      .filter((v): v is string => v !== null)
      .join(' ');

  const lastB = [...points].reverse().find((p) => p.b !== null);
  const lastC = [...points].reverse().find((p) => p.c !== null);
  const lastBIdx = lastB ? points.lastIndexOf(lastB) : -1;
  const lastCIdx = lastC ? points.lastIndexOf(lastC) : -1;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-11 mb-1">
      <polyline points={linePoints('b')} fill="none" stroke="#2F6D46" strokeWidth="2" />
      <polyline points={linePoints('c')} fill="none" stroke="#D4537E" strokeWidth="2" />
      {lastBIdx >= 0 && <circle cx={lastBIdx * xStep} cy={toY(lastB!.b as number)} r="2.5" fill="#2F6D46" />}
      {lastCIdx >= 0 && <circle cx={lastCIdx * xStep} cy={toY(lastC!.c as number)} r="2.5" fill="#D4537E" />}
    </svg>
  );
}

export default function BurnSidebar({ citySlug, cityName, canUpload }: { citySlug: string; cityName: string; canUpload: boolean }) {
  const [rows, setRows] = useState<BurnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [weekAKey, setWeekAKey] = useState<string | null>(null);
  const [weekBKey, setWeekBKey] = useState<string | null>(null);
  const [rainSyncedAt, setRainSyncedAt] = useState<string | null>(null);

  const [showRawImport, setShowRawImport] = useState(false);
  const [rawBRows, setRawBRows] = useState<RawRow[]>([]);
  const [rawCRows, setRawCRows] = useState<RawRow[]>([]);
  const [rawGmvRows, setRawGmvRows] = useState<RawRow[]>([]);
  const [rawFileNames, setRawFileNames] = useState<{ b: string | null; c: string | null; gmv: string | null }>({ b: null, c: null, gmv: null });
  const [rawBusy, setRawBusy] = useState(false);
  const [rawError, setRawError] = useState<string | null>(null);
  const [rawStatus, setRawStatus] = useState<string | null>(null);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentWeek = isoWeek(now);

  async function load() {
    if (!supabase) return;
    setLoading(true);
    // Fetches full history for this city (not just recent weeks) so the
    // Compare panel below can reach back across years. Also grabs the most
    // recent rain_daily sync timestamp for this city, for the freshness line.
    const [burnRes, rainRes] = await Promise.all([
      supabase
        .from('weekly_burn')
        .select('id, iso_year, iso_week, b_burn_pct, b_burn_nominal, c_burn_pct, c_burn_nominal, currency, updated_at')
        .eq('city_slug', citySlug)
        .order('iso_year', { ascending: false })
        .order('iso_week', { ascending: false }),
      supabase.from('rain_daily').select('updated_at').eq('city_slug', citySlug).order('updated_at', { ascending: false }).limit(1),
    ]);
    if (burnRes.error) {
      setError(burnRes.error.message);
    } else {
      const fetched = (burnRes.data ?? []) as BurnRow[];
      setRows(fetched);
      setWeekAKey(fetched[0] ? weekKey(fetched[0].iso_year, fetched[0].iso_week) : null);
      setWeekBKey(fetched[1] ? weekKey(fetched[1].iso_year, fetched[1].iso_week) : null);
    }
    setRainSyncedAt(rainRes.data?.[0]?.updated_at ?? null);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-param-change pattern
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load is stable per render, only citySlug should retrigger
  }, [citySlug]);

  async function importCsv(csvText: string) {
    if (!supabase || !csvText.trim()) return;
    setError(null);
    setStatus(null);

    const lines = csvText.trim().split('\n').filter((l) => l.trim() !== '');
    if (lines.length < 2) {
      setError('The file needs a header row plus at least one data row.');
      return;
    }

    const header = splitLine(lines[0]).map(normalizeHeader);
    const headerOk = EXPECTED_HEADERS.every((h, i) => header[i] === h);
    if (!headerOk) {
      setError('Header row must be: Year, Week, City, B Burn %, B Burn Nominal, C Burn %, C Burn Nominal');
      return;
    }

    const payload: {
      city_slug: string;
      iso_year: number;
      iso_week: number;
      b_burn_pct: number | null;
      b_burn_nominal: number | null;
      c_burn_pct: number | null;
      c_burn_nominal: number | null;
      currency: string;
    }[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cells = splitLine(lines[i]);
      const [yearStr, weekStr, city, bPct, bNom, cPct, cNom] = cells;
      const year = num(yearStr);
      const week = num(weekStr);
      const slug = (city ?? '').trim().toLowerCase();

      if (!year || !week || !slug) {
        setError(`Row ${i + 1}: missing year, week, or city.`);
        return;
      }

      payload.push({
        city_slug: slug,
        iso_year: year,
        iso_week: week,
        b_burn_pct: num(bPct),
        b_burn_nominal: num(bNom),
        c_burn_pct: num(cPct),
        c_burn_nominal: num(cNom),
        currency: currencyForCity(slug) ?? 'USD',
      });
    }

    setBusy(true);
    const { error: err } = await supabase.from('weekly_burn').upsert(payload, { onConflict: 'city_slug,iso_year,iso_week' });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setStatus(`Imported ${payload.length} row${payload.length === 1 ? '' : 's'}.`);
    load();
  }

  function handleFile(file: File) {
    setError(null);
    setStatus(null);
    const reader = new FileReader();
    reader.onload = () => importCsv(String(reader.result ?? ''));
    reader.onerror = () => setError("Couldn't read that file.");
    reader.readAsText(file);
  }

  function handleRawFile(kind: 'b' | 'c' | 'gmv', file: File, valueAliases: string[]) {
    setRawError(null);
    setRawStatus(null);
    const reader = new FileReader();
    reader.onload = () => {
      const { rows, error: err } = parseRawCsv(String(reader.result ?? ''), valueAliases);
      if (err) {
        setRawError(`${file.name}: ${err}`);
        return;
      }
      setRawFileNames((f) => ({ ...f, [kind]: file.name }));
      if (kind === 'b') setRawBRows(rows);
      else if (kind === 'c') setRawCRows(rows);
      else setRawGmvRows(rows);
    };
    reader.onerror = () => setRawError(`Couldn't read ${file.name}.`);
    reader.readAsText(file);
  }

  async function uploadRawAggregates() {
    if (!supabase) return;
    if (rawBRows.length === 0 && rawCRows.length === 0) {
      setRawError('Upload at least the B burn or C burn file first.');
      return;
    }
    const weekly = aggregateWeekly(rawBRows, rawCRows, rawGmvRows, cityName);
    if (weekly.length === 0) {
      setRawError(`No rows matched city "${cityName}" — check the raw files were filtered/exported for the right city.`);
      return;
    }

    const currency = currencyForCity(citySlug) ?? 'USD';
    const payload = weekly.map((w) => ({
      city_slug: citySlug,
      iso_year: w.isoYear,
      iso_week: w.isoWeek,
      b_burn_nominal: w.bSum,
      c_burn_nominal: w.cSum,
      b_burn_pct: w.bSum !== null && w.gmvSum ? Math.round((w.bSum / w.gmvSum) * 10000) / 100 : null,
      c_burn_pct: w.cSum !== null && w.gmvSum ? Math.round((w.cSum / w.gmvSum) * 10000) / 100 : null,
      currency,
    }));

    setRawBusy(true);
    const { error: err } = await supabase.from('weekly_burn').upsert(payload, { onConflict: 'city_slug,iso_year,iso_week' });
    setRawBusy(false);
    if (err) {
      setRawError(err.message);
      return;
    }
    setRawStatus(`Computed and uploaded ${payload.length} week${payload.length === 1 ? '' : 's'} for ${cityName}.`);
    setRawBRows([]);
    setRawCRows([]);
    setRawGmvRows([]);
    setRawFileNames({ b: null, c: null, gmv: null });
    load();
  }

  const weekOptions = rows.map((r) => ({ key: weekKey(r.iso_year, r.iso_week), label: `Week ${r.iso_week} · ${r.iso_year}` }));
  const weekA = rows.find((r) => weekKey(r.iso_year, r.iso_week) === weekAKey) ?? null;
  const weekB = rows.find((r) => weekKey(r.iso_year, r.iso_week) === weekBKey) ?? null;

  const burnUploadedAt = rows.length > 0 ? rows.reduce((max, r) => (r.updated_at > max ? r.updated_at : max), rows[0].updated_at) : null;
  // Sparkline wants oldest-to-newest, left to right — rows are fetched newest-first.
  const sparkPoints = [...rows.slice(0, 8)].reverse().map((r) => ({ b: r.b_burn_pct, c: r.c_burn_pct }));

  return (
    <div className="w-[210px] shrink-0 border-l border-neutral-200 pl-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-medium text-neutral-500">{cityName} · weekly burn</p>
        {canUpload && (
          <label className={`text-[10px] text-[#2F6D46] underline cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
            {busy ? 'Uploading…' : 'Upload CSV'}
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = '';
              }}
            />
          </label>
        )}
      </div>

      {canUpload && (
        <button onClick={() => setShowRawImport((v) => !v)} className="text-[10px] text-[#2F6D46] underline mb-2 block">
          {showRawImport ? '← Hide raw weekly import' : 'Raw weekly import →'}
        </button>
      )}

      {canUpload && showRawImport && (
        <div className="mb-3 flex flex-col gap-1.5 border border-dashed border-neutral-300 rounded-md p-2">
          <p className="text-[9px] text-neutral-500 leading-[1.4] m-0">
            Upload the 3 filtered raw exports (B burn, C burn, GMV) — weeks and B/C burn % are computed automatically.
          </p>
          {(
            [
              { kind: 'b' as const, label: 'B burn raw', aliases: ['bburn'], value: rawFileNames.b },
              { kind: 'c' as const, label: 'C burn raw', aliases: ['cburn', 'totalspend'], value: rawFileNames.c },
              { kind: 'gmv' as const, label: 'GMV raw', aliases: ['gmv'], value: rawFileNames.gmv },
            ]
          ).map(({ kind, label, aliases, value }) => (
            <label key={kind} className="text-[10px] text-neutral-600 flex items-center justify-between cursor-pointer">
              <span>{label}</span>
              <span className={`underline ${value ? 'text-[#2F6D46]' : 'text-neutral-400'}`}>{value ?? 'Choose file'}</span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleRawFile(kind, file, aliases);
                  e.target.value = '';
                }}
              />
            </label>
          ))}
          <button
            onClick={uploadRawAggregates}
            disabled={rawBusy || (rawBRows.length === 0 && rawCRows.length === 0)}
            className="text-[10px] px-2 py-1 rounded-md bg-[#2F6D46] text-white font-medium disabled:opacity-50 mt-1"
          >
            {rawBusy ? 'Computing…' : 'Compute & upload'}
          </button>
          {rawStatus && <p className="text-[9px] text-[#2F6D46] m-0">{rawStatus}</p>}
          {rawError && <p className="text-[9px] text-red-600 m-0">{rawError}</p>}
        </div>
      )}

      <div className="text-[9px] text-neutral-400 leading-[1.5] mb-2.5">
        {fmtTimestamp(rainSyncedAt) && <p className="m-0">Rain/heat synced {fmtTimestamp(rainSyncedAt)}</p>}
        {fmtTimestamp(burnUploadedAt) && <p className="m-0">Burn last uploaded {fmtTimestamp(burnUploadedAt)}</p>}
      </div>

      {!showCompare && sparkPoints.length >= 2 && (
        <div className="mb-2">
          <p className="text-[10px] font-medium text-neutral-500 mb-1">Last {sparkPoints.length} weeks</p>
          <BurnSparkline points={sparkPoints} />
          <div className="flex gap-2.5 text-[9px] text-neutral-500">
            <span>
              <i className="inline-block w-2 h-2 rounded-full bg-[#2F6D46] mr-1" />B burn
            </span>
            <span>
              <i className="inline-block w-2 h-2 rounded-full bg-[#D4537E] mr-1" />C burn
            </span>
          </div>
        </div>
      )}

      {status && <p className="text-[10px] text-[#2F6D46] mb-2">{status}</p>}
      {error && <p className="text-[10px] text-red-600 mb-2">{error}</p>}

      <button onClick={() => setShowCompare((v) => !v)} className="text-[10px] text-[#2F6D46] underline mb-2 block">
        {showCompare ? '← Back to recent weeks' : 'Compare weeks →'}
      </button>

      {loading ? (
        <p className="text-xs text-neutral-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-[11px] text-neutral-400">No burn data yet for {cityName}.</p>
      ) : showCompare ? (
        <div className="flex flex-col gap-2">
          <select
            value={weekAKey ?? ''}
            onChange={(e) => setWeekAKey(e.target.value)}
            className="text-[10px] border border-neutral-200 rounded px-1.5 py-1"
          >
            {weekOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
          <div className="text-center text-[10px] text-neutral-400">vs</div>
          <select
            value={weekBKey ?? ''}
            onChange={(e) => setWeekBKey(e.target.value)}
            className="text-[10px] border border-neutral-200 rounded px-1.5 py-1"
          >
            {weekOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>

          {!weekA || !weekB ? (
            <p className="text-[10px] text-neutral-400 mt-1">Pick two weeks with data.</p>
          ) : (
            <div className="mt-1 flex flex-col gap-1.5">
              <div className="rounded-md bg-neutral-50 px-2 py-1.5">
                <p className="text-[10px] font-medium text-neutral-500 mb-0.5">
                  Week {weekA.iso_week} · {weekA.iso_year}
                </p>
                <p className="text-[10px] text-neutral-700">B {weekA.b_burn_pct ?? '—'}% · C {weekA.c_burn_pct ?? '—'}%</p>
              </div>
              <div className="rounded-md bg-neutral-50 px-2 py-1.5">
                <p className="text-[10px] font-medium text-neutral-500 mb-0.5">
                  Week {weekB.iso_week} · {weekB.iso_year}
                </p>
                <p className="text-[10px] text-neutral-700">B {weekB.b_burn_pct ?? '—'}% · C {weekB.c_burn_pct ?? '—'}%</p>
              </div>
              <div className="rounded-md border border-[#9AC7A4] bg-[#eef7f0] px-2 py-1.5">
                <p className="text-[10px] font-medium text-[#1E4A2C] mb-0.5">pp change (A vs B)</p>
                <p className="text-[10px] text-neutral-700">
                  B: <DeltaBadge pp={ppDelta(weekA.b_burn_pct, weekB.b_burn_pct)} />
                  {ppDelta(weekA.b_burn_pct, weekB.b_burn_pct) === null && <span className="text-neutral-400">no data</span>}
                </p>
                <p className="text-[10px] text-neutral-700">
                  C: <DeltaBadge pp={ppDelta(weekA.c_burn_pct, weekB.c_burn_pct)} />
                  {ppDelta(weekA.c_burn_pct, weekB.c_burn_pct) === null && <span className="text-neutral-400">no data</span>}
                </p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {rows.slice(0, 10).map((r, i) => {
            const isCurrent = r.iso_year === currentYear && r.iso_week === currentWeek;
            const prior = rows[i + 1] ?? null;
            const bDelta = prior ? ppDelta(r.b_burn_pct, prior.b_burn_pct) : null;
            const cDelta = prior ? ppDelta(r.c_burn_pct, prior.c_burn_pct) : null;
            return (
              <div
                key={r.id}
                className={`rounded-md border px-2 py-1.5 ${isCurrent ? 'border-[#9AC7A4] bg-[#eef7f0]' : 'border-neutral-100'}`}
              >
                <p className={`text-[10px] font-medium mb-0.5 ${isCurrent ? 'text-[#1E4A2C]' : 'text-neutral-500'}`}>
                  Week {r.iso_week} · {isoWeekLabel(r.iso_year, r.iso_week)}
                </p>
                <p className="text-[10px] text-neutral-700">
                  B {r.b_burn_pct ?? '—'}% · {r.currency} {fmtNum(r.b_burn_nominal)} <DeltaBadge pp={bDelta} />
                </p>
                <p className="text-[10px] text-neutral-700">
                  C {r.c_burn_pct ?? '—'}% · {r.currency} {fmtNum(r.c_burn_nominal)} <DeltaBadge pp={cDelta} />
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
