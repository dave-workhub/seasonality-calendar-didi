'use client';

import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabaseClient';
import { ALL_CITIES, currencyForCity } from '@/lib/cities';
import { isoWeek, isoWeekLabel, isoYear } from '@/lib/holidays';

interface BurnRow {
  id: number;
  iso_year: number;
  iso_week: number;
  b_burn_pct: number | null;
  b_burn_nominal: number | null;
  c_burn_pct: number | null;
  c_burn_nominal: number | null;
  b_locked: boolean;
  c_locked: boolean;
  currency: string;
  updated_at: string;
}

// Expected header cells, case/space-insensitive, in this column order:
// Year | Week | B Burn | C Burn — just the percentages. No city column,
// since each city gets its own sheet tab / CSV, and the upload is already
// scoped to whichever city is selected in the sidebar. Never touches
// nominal — that's only ever set via the manual edit form, so a re-upload
// here can't silently wipe out a value you typed in by hand.
const EXPECTED_HEADERS = ['year', 'week', 'bburn', 'cburn'];

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

// Strips accents so "Medellín" / "Medellin" both match, lowercases, and
// drops spaces — for matching a workbook tab name against a city.
function foldName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, '');
}

// Matches a sheet tab name (e.g. "Medellin", "cartagena", "Data", "Cities")
// against a known city — returns null for tabs that aren't a city at all
// (reference/notes tabs), so those are silently skipped rather than erroring.
function matchCitySlug(sheetName: string): string | null {
  const folded = foldName(sheetName);
  const match = ALL_CITIES.find((c) => foldName(c.slug) === folded || foldName(c.name) === folded);
  return match?.slug ?? null;
}

// Same header/row validation as the plain-CSV path, but operating on rows
// already split into cells (from XLSX.utils.sheet_to_json) instead of raw
// text lines — a workbook tab and a CSV file end up parsed the same way.
function parseSheetRows(rows: string[][]): { candidates: { iso_year: number; iso_week: number; b_burn_pct: number | null; c_burn_pct: number | null }[]; error: string | null } {
  if (rows.length < 2) return { candidates: [], error: 'no data rows' };
  const header = rows[0].map(normalizeHeader);
  const headerOk = EXPECTED_HEADERS.every((h, i) => header[i] === h);
  if (!headerOk) return { candidates: [], error: `header must be Year, Week, B Burn, C Burn (found: ${rows[0].join(', ')})` };

  const candidates: { iso_year: number; iso_week: number; b_burn_pct: number | null; c_burn_pct: number | null }[] = [];
  for (let i = 1; i < rows.length; i++) {
    const [yearStr, weekStr, bPct, cPct] = rows[i];
    const year = num(yearStr);
    const week = num(weekStr);
    if (!year || !week) continue; // blank trailing row
    const b = num(bPct);
    const c = num(cPct);
    if (b === null && c === null) continue; // future week, not filled in yet
    candidates.push({ iso_year: year, iso_week: week, b_burn_pct: b, c_burn_pct: c });
  }
  return { candidates, error: null };
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

interface BurnCandidate {
  city_slug: string;
  iso_year: number;
  iso_week: number;
  b_burn_pct?: number | null;
  b_burn_nominal?: number | null;
  c_burn_pct?: number | null;
  c_burn_nominal?: number | null;
  currency: string;
}

// Shared by every write path (simple-template import, raw-CSV import, and
// the manual edit form): looks up each week's existing b_locked/c_locked
// flags first, then upserts — but a locked side is left out of that row's
// payload entirely, so its current DB value survives untouched instead of
// being overwritten by whatever this import computed.
async function upsertRespectingLocks(
  candidates: BurnCandidate[]
): Promise<{ written: number; skippedB: number; skippedC: number; error: string | null }> {
  if (!supabase || candidates.length === 0) return { written: 0, skippedB: 0, skippedC: 0, error: null };

  const cities = [...new Set(candidates.map((c) => c.city_slug))];
  const { data: existing, error: fetchErr } = await supabase
    .from('weekly_burn')
    .select('city_slug, iso_year, iso_week, b_locked, c_locked')
    .in('city_slug', cities);
  if (fetchErr) return { written: 0, skippedB: 0, skippedC: 0, error: fetchErr.message };

  const lockMap = new Map<string, { b: boolean; c: boolean }>();
  for (const row of existing ?? []) {
    lockMap.set(`${row.city_slug}|${row.iso_year}|${row.iso_week}`, { b: row.b_locked, c: row.c_locked });
  }

  let written = 0;
  let skippedB = 0;
  let skippedC = 0;

  for (const cand of candidates) {
    const lock = lockMap.get(`${cand.city_slug}|${cand.iso_year}|${cand.iso_week}`);
    const payload: Record<string, unknown> = {
      city_slug: cand.city_slug,
      iso_year: cand.iso_year,
      iso_week: cand.iso_week,
      currency: cand.currency,
    };
    // % and nominal are included independently, not as a pair — a candidate
    // that only supplies b_burn_pct (like the plain weekly % import) must
    // leave b_burn_nominal out of the upsert entirely so whatever's already
    // there (e.g. typed in by hand) survives untouched, not reset to null.
    if (lock?.b) {
      skippedB++;
    } else {
      if (cand.b_burn_pct !== undefined) payload.b_burn_pct = cand.b_burn_pct;
      if (cand.b_burn_nominal !== undefined) payload.b_burn_nominal = cand.b_burn_nominal;
    }
    if (lock?.c) {
      skippedC++;
    } else {
      if (cand.c_burn_pct !== undefined) payload.c_burn_pct = cand.c_burn_pct;
      if (cand.c_burn_nominal !== undefined) payload.c_burn_nominal = cand.c_burn_nominal;
    }
    // One upsert per row (not a batch) since the column set genuinely
    // varies row to row depending on what's locked.
    const { error: err } = await supabase.from('weekly_burn').upsert(payload, { onConflict: 'city_slug,iso_year,iso_week' });
    if (err) return { written, skippedB, skippedC, error: err.message };
    written++;
  }

  return { written, skippedB, skippedC, error: null };
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

  const [xlsxBusy, setXlsxBusy] = useState(false);
  const [xlsxError, setXlsxError] = useState<string | null>(null);
  const [xlsxStatus, setXlsxStatus] = useState<string | null>(null);

  // Manual edit form — null id means "adding a new week", otherwise editing
  // the row with that id. Locking here always wins over whatever's in the
  // DB already (the user is explicitly setting the value right now), unlike
  // the CSV import paths which respect an existing lock and skip it.
  const [manualOpen, setManualOpen] = useState(false);
  const [manualEditingId, setManualEditingId] = useState<number | null>(null);
  const [manualYear, setManualYear] = useState('');
  const [manualWeek, setManualWeek] = useState('');
  const [manualBPct, setManualBPct] = useState('');
  const [manualBNom, setManualBNom] = useState('');
  const [manualCPct, setManualCPct] = useState('');
  const [manualCNom, setManualCNom] = useState('');
  const [manualLockB, setManualLockB] = useState(true);
  const [manualLockC, setManualLockC] = useState(true);
  const [manualBusy, setManualBusy] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

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
        .select('id, iso_year, iso_week, b_burn_pct, b_burn_nominal, c_burn_pct, c_burn_nominal, b_locked, c_locked, currency, updated_at')
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
      setError('Header row must be: Year, Week, B Burn, C Burn');
      return;
    }

    const payload: BurnCandidate[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cells = splitLine(lines[i]);
      const [yearStr, weekStr, bPct, cPct] = cells;
      const year = num(yearStr);
      const week = num(weekStr);

      if (!year || !week) {
        setError(`Row ${i + 1}: missing year or week.`);
        return;
      }

      const b = num(bPct);
      const c = num(cPct);
      if (b === null && c === null) continue; // blank row (e.g. a future week not filled in yet) — skip rather than create an empty entry

      // Nominal is deliberately never set here — only % comes from this
      // file, so any nominal value already on the row (typed in by hand)
      // is left alone.
      payload.push({
        city_slug: citySlug,
        iso_year: year,
        iso_week: week,
        b_burn_pct: b,
        c_burn_pct: c,
        currency: currencyForCity(citySlug) ?? 'USD',
      });
    }

    setBusy(true);
    const result = await upsertRespectingLocks(payload);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    const skipped = result.skippedB + result.skippedC > 0 ? ` (${result.skippedB + result.skippedC} locked field${result.skippedB + result.skippedC === 1 ? '' : 's'} left untouched)` : '';
    setStatus(`Imported ${result.written} row${result.written === 1 ? '' : 's'}.${skipped}`);
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
    const payload: BurnCandidate[] = weekly.map((w) => ({
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
    const result = await upsertRespectingLocks(payload);
    setRawBusy(false);
    if (result.error) {
      setRawError(result.error);
      return;
    }
    const skipped = result.skippedB + result.skippedC > 0 ? ` (${result.skippedB + result.skippedC} locked side${result.skippedB + result.skippedC === 1 ? '' : 's'} left untouched)` : '';
    setRawStatus(`Computed and uploaded ${result.written} week${result.written === 1 ? '' : 's'} for ${cityName}.${skipped}`);
    setRawBRows([]);
    setRawCRows([]);
    setRawGmvRows([]);
    setRawFileNames({ b: null, c: null, gmv: null });
    load();
  }

  function handleXlsxFile(file: File) {
    setXlsxError(null);
    setXlsxStatus(null);
    setXlsxBusy(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const buf = reader.result as ArrayBuffer;
        const workbook = XLSX.read(buf, { type: 'array' });

        const payload: BurnCandidate[] = [];
        const matchedCities: string[] = [];
        const skippedTabs: string[] = [];
        const badTabs: string[] = [];

        for (const sheetName of workbook.SheetNames) {
          const slug = matchCitySlug(sheetName);
          if (!slug) {
            skippedTabs.push(sheetName);
            continue;
          }
          const sheet = workbook.Sheets[sheetName];
          // raw:false forces formatted display strings (e.g. "3.40%")
          // rather than the underlying fraction (0.034) a percent-formatted
          // Excel cell actually stores — keeps this on the same "%" text
          // parsing as every other import path.
          const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
          const { candidates, error: sheetErr } = parseSheetRows(rows);
          if (sheetErr) {
            badTabs.push(`${sheetName} (${sheetErr})`);
            continue;
          }
          matchedCities.push(sheetName);
          const currency = currencyForCity(slug) ?? 'USD';
          for (const c of candidates) {
            payload.push({ city_slug: slug, iso_year: c.iso_year, iso_week: c.iso_week, b_burn_pct: c.b_burn_pct, c_burn_pct: c.c_burn_pct, currency });
          }
        }

        if (payload.length === 0) {
          setXlsxError(badTabs.length > 0 ? `Couldn't read any city tabs — ${badTabs.join('; ')}` : 'No matching city tabs found in this file.');
          setXlsxBusy(false);
          return;
        }

        const result = await upsertRespectingLocks(payload);
        setXlsxBusy(false);
        if (result.error) {
          setXlsxError(result.error);
          return;
        }
        const skipped = result.skippedB + result.skippedC > 0 ? ` (${result.skippedB + result.skippedC} locked side${result.skippedB + result.skippedC === 1 ? '' : 's'} left untouched)` : '';
        const ignored = skippedTabs.length > 0 ? ` Ignored non-city tabs: ${skippedTabs.join(', ')}.` : '';
        setXlsxStatus(`Updated ${matchedCities.length} cit${matchedCities.length === 1 ? 'y' : 'ies'} (${result.written} week rows).${skipped}${ignored}`);
        load();
      } catch (err) {
        setXlsxBusy(false);
        setXlsxError(err instanceof Error ? err.message : "Couldn't read that file.");
      }
    };
    reader.onerror = () => {
      setXlsxBusy(false);
      setXlsxError("Couldn't read that file.");
    };
    reader.readAsArrayBuffer(file);
  }

  function openManualNew() {
    setManualEditingId(null);
    setManualYear(String(currentYear));
    setManualWeek(String(currentWeek));
    setManualBPct('');
    setManualBNom('');
    setManualCPct('');
    setManualCNom('');
    setManualLockB(true);
    setManualLockC(true);
    setManualError(null);
    setManualOpen(true);
  }

  function openManualEdit(r: BurnRow) {
    setManualEditingId(r.id);
    setManualYear(String(r.iso_year));
    setManualWeek(String(r.iso_week));
    setManualBPct(r.b_burn_pct?.toString() ?? '');
    setManualBNom(r.b_burn_nominal?.toString() ?? '');
    setManualCPct(r.c_burn_pct?.toString() ?? '');
    setManualCNom(r.c_burn_nominal?.toString() ?? '');
    setManualLockB(r.b_locked);
    setManualLockC(r.c_locked);
    setManualError(null);
    setManualOpen(true);
  }

  async function saveManualEdit() {
    if (!supabase) return;
    const year = num(manualYear);
    const week = num(manualWeek);
    if (!year || !week) {
      setManualError('Enter a year and week.');
      return;
    }
    setManualBusy(true);
    // Deliberately NOT going through upsertRespectingLocks — a manual edit
    // is the one write path allowed to override an existing lock (that's
    // the point of editing it), and it sets the lock flags itself below.
    const { error: err } = await supabase.from('weekly_burn').upsert(
      {
        city_slug: citySlug,
        iso_year: year,
        iso_week: week,
        b_burn_pct: num(manualBPct),
        b_burn_nominal: num(manualBNom),
        c_burn_pct: num(manualCPct),
        c_burn_nominal: num(manualCNom),
        b_locked: manualLockB,
        c_locked: manualLockC,
        currency: currencyForCity(citySlug) ?? 'USD',
      },
      { onConflict: 'city_slug,iso_year,iso_week' }
    );
    setManualBusy(false);
    if (err) {
      setManualError(err.message);
      return;
    }
    setManualOpen(false);
    load();
  }

  // Weeks up through the current one, most recent first (rows is already
  // sorted that way) — keeps a sheet that has blank placeholder rows for
  // future weeks (e.g. through week 51) from pushing the "recent weeks"
  // list and sparkline out to weeks that haven't happened yet.
  const pastRows = rows.filter((r) => r.iso_year < currentYear || (r.iso_year === currentYear && r.iso_week <= currentWeek));

  // The importer skips blank rows now, so the in-progress current week
  // (its data isn't in yet — the week isn't over) never becomes a real DB
  // row. Show it anyway as an empty placeholder rather than silently
  // skipping straight to last week, so it's clear data is just pending.
  const hasCurrentWeek = pastRows[0]?.iso_year === currentYear && pastRows[0]?.iso_week === currentWeek;
  const displayRows: BurnRow[] = hasCurrentWeek
    ? pastRows
    : [
        {
          id: -1,
          iso_year: currentYear,
          iso_week: currentWeek,
          b_burn_pct: null,
          b_burn_nominal: null,
          c_burn_pct: null,
          c_burn_nominal: null,
          b_locked: false,
          c_locked: false,
          currency: currencyForCity(citySlug) ?? 'USD',
          updated_at: '',
        },
        ...pastRows,
      ];

  const weekOptions = rows.map((r) => ({ key: weekKey(r.iso_year, r.iso_week), label: `Week ${r.iso_week} · ${r.iso_year}` }));
  const weekA = rows.find((r) => weekKey(r.iso_year, r.iso_week) === weekAKey) ?? null;
  const weekB = rows.find((r) => weekKey(r.iso_year, r.iso_week) === weekBKey) ?? null;

  const burnUploadedAt = rows.length > 0 ? rows.reduce((max, r) => (r.updated_at > max ? r.updated_at : max), rows[0].updated_at) : null;
  // Sparkline wants oldest-to-newest, left to right — pastRows is newest-first.
  const sparkPoints = [...pastRows.slice(0, 8)].reverse().map((r) => ({ b: r.b_burn_pct, c: r.c_burn_pct }));

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
        <div className="mb-3">
          <label
            className={`text-[10px] px-2 py-1.5 rounded-md bg-[#2F6D46] text-white font-medium cursor-pointer inline-block ${xlsxBusy ? 'opacity-50 pointer-events-none' : ''}`}
          >
            {xlsxBusy ? 'Reading file…' : 'Upload weekly XLSX (all cities)'}
            <input
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              disabled={xlsxBusy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleXlsxFile(file);
                e.target.value = '';
              }}
            />
          </label>
          <p className="text-[9px] text-neutral-400 mt-1 mb-0">One tab per city (Year, Week, B Burn, C Burn) — updates every matching city at once.</p>
          {xlsxStatus && <p className="text-[9px] text-[#2F6D46] mt-1 mb-0">{xlsxStatus}</p>}
          {xlsxError && <p className="text-[9px] text-red-600 mt-1 mb-0">{xlsxError}</p>}
        </div>
      )}

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

      {canUpload && !manualOpen && (
        <button onClick={openManualNew} className="text-[10px] text-[#2F6D46] underline mb-2 block">
          + Edit a week manually
        </button>
      )}

      {canUpload && manualOpen && (
        <div className="mb-3 flex flex-col gap-1.5 border border-dashed border-neutral-300 rounded-md p-2">
          <p className="text-[9px] text-neutral-500 leading-[1.4] m-0">
            {manualEditingId !== null
              ? 'Editing this week directly. Locked sides are ignored by future CSV imports until you uncheck the lock.'
              : 'Add or overwrite a week directly — leave a field blank to leave it empty.'}
          </p>
          <div className="flex gap-1.5">
            <input
              type="number"
              placeholder="Year"
              value={manualYear}
              onChange={(e) => setManualYear(e.target.value)}
              disabled={manualEditingId !== null}
              className="w-16 text-[10px] border border-neutral-200 rounded px-1.5 py-1 disabled:opacity-50"
            />
            <input
              type="number"
              placeholder="Week"
              value={manualWeek}
              onChange={(e) => setManualWeek(e.target.value)}
              disabled={manualEditingId !== null}
              className="w-16 text-[10px] border border-neutral-200 rounded px-1.5 py-1 disabled:opacity-50"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <input
              type="number"
              placeholder="B burn %"
              value={manualBPct}
              onChange={(e) => setManualBPct(e.target.value)}
              className="w-20 text-[10px] border border-neutral-200 rounded px-1.5 py-1"
            />
            <input
              type="number"
              placeholder="B nominal (optional)"
              value={manualBNom}
              onChange={(e) => setManualBNom(e.target.value)}
              className="flex-1 min-w-0 text-[10px] border border-neutral-200 rounded px-1.5 py-1"
            />
          </div>
          <label className="flex items-center gap-1.5 text-[9px] text-neutral-500">
            <input type="checkbox" checked={manualLockB} onChange={(e) => setManualLockB(e.target.checked)} />
            Lock B (ignore future CSV imports for this side)
          </label>

          <div className="flex items-center gap-1.5">
            <input
              type="number"
              placeholder="C burn %"
              value={manualCPct}
              onChange={(e) => setManualCPct(e.target.value)}
              className="w-20 text-[10px] border border-neutral-200 rounded px-1.5 py-1"
            />
            <input
              type="number"
              placeholder="C nominal (optional)"
              value={manualCNom}
              onChange={(e) => setManualCNom(e.target.value)}
              className="flex-1 min-w-0 text-[10px] border border-neutral-200 rounded px-1.5 py-1"
            />
          </div>
          <label className="flex items-center gap-1.5 text-[9px] text-neutral-500">
            <input type="checkbox" checked={manualLockC} onChange={(e) => setManualLockC(e.target.checked)} />
            Lock C (ignore future CSV imports for this side)
          </label>

          <div className="flex gap-1.5 mt-1">
            <button
              onClick={saveManualEdit}
              disabled={manualBusy}
              className="text-[10px] px-2 py-1 rounded-md bg-[#2F6D46] text-white font-medium disabled:opacity-50"
            >
              {manualBusy ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setManualOpen(false)} className="text-[10px] px-2 py-1 rounded-md border border-neutral-200 text-neutral-600">
              Cancel
            </button>
          </div>
          {manualError && <p className="text-[9px] text-red-600 m-0">{manualError}</p>}
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
          {displayRows.slice(0, 8).map((r, i) => {
            const isCurrent = r.iso_year === currentYear && r.iso_week === currentWeek;
            const prior = displayRows[i + 1] ?? null;
            const bDelta = prior ? ppDelta(r.b_burn_pct, prior.b_burn_pct) : null;
            const cDelta = prior ? ppDelta(r.c_burn_pct, prior.c_burn_pct) : null;
            return (
              <div
                key={r.id}
                className={`rounded-md border px-2 py-1.5 ${isCurrent ? 'border-[#9AC7A4] bg-[#eef7f0]' : 'border-neutral-100'}`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <p className={`text-[10px] font-medium m-0 ${isCurrent ? 'text-[#1E4A2C]' : 'text-neutral-500'}`}>
                    Week {r.iso_week} · {isoWeekLabel(r.iso_year, r.iso_week)}
                  </p>
                  {canUpload && (
                    <button onClick={() => openManualEdit(r)} className="text-[9px] text-[#2F6D46] underline shrink-0">
                      Edit
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-neutral-700">
                  B {r.b_burn_pct ?? '—'}% · {r.currency} {fmtNum(r.b_burn_nominal)} <DeltaBadge pp={bDelta} />
                  {r.b_locked && <span title="Locked — CSV imports skip this side">🔒</span>}
                </p>
                <p className="text-[10px] text-neutral-700">
                  C {r.c_burn_pct ?? '—'}% · {r.currency} {fmtNum(r.c_burn_nominal)} <DeltaBadge pp={cDelta} />
                  {r.c_locked && <span title="Locked — CSV imports skip this side">🔒</span>}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
