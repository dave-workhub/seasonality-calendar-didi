'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { currencyForCity } from '@/lib/cities';
import { isoWeek, isoWeekLabel } from '@/lib/holidays';

interface BurnRow {
  id: number;
  iso_year: number;
  iso_week: number;
  b_burn_pct: number | null;
  b_burn_nominal: number | null;
  c_burn_pct: number | null;
  c_burn_nominal: number | null;
  currency: string;
}

// Expected header cells, case/space-insensitive, in this column order:
// Year | Week | City | B Burn % | B Burn Nominal | C Burn % | C Burn Nominal
const EXPECTED_HEADERS = ['year', 'week', 'city', 'bburn%', 'bburnnominal', 'cburn%', 'cburnnominal'];

function normalizeHeader(h: string) {
  return h.trim().toLowerCase().replace(/\s+/g, '');
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
  const cleaned = v.replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function fmtNum(n: number | null) {
  if (n === null) return '—';
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toString();
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

export default function BurnSidebar({ citySlug, cityName }: { citySlug: string; cityName: string }) {
  const [rows, setRows] = useState<BurnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [weekAKey, setWeekAKey] = useState<string | null>(null);
  const [weekBKey, setWeekBKey] = useState<string | null>(null);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentWeek = isoWeek(now);

  async function load() {
    if (!supabase) return;
    setLoading(true);
    // Fetches full history for this city (not just recent weeks) so the
    // Compare panel below can reach back across years.
    const { data, error: err } = await supabase
      .from('weekly_burn')
      .select('id, iso_year, iso_week, b_burn_pct, b_burn_nominal, c_burn_pct, c_burn_nominal, currency')
      .eq('city_slug', citySlug)
      .order('iso_year', { ascending: false })
      .order('iso_week', { ascending: false });
    if (err) {
      setError(err.message);
    } else {
      const fetched = (data ?? []) as BurnRow[];
      setRows(fetched);
      setWeekAKey(fetched[0] ? weekKey(fetched[0].iso_year, fetched[0].iso_week) : null);
      setWeekBKey(fetched[1] ? weekKey(fetched[1].iso_year, fetched[1].iso_week) : null);
    }
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

  const weekOptions = rows.map((r) => ({ key: weekKey(r.iso_year, r.iso_week), label: `Week ${r.iso_week} · ${r.iso_year}` }));
  const weekA = rows.find((r) => weekKey(r.iso_year, r.iso_week) === weekAKey) ?? null;
  const weekB = rows.find((r) => weekKey(r.iso_year, r.iso_week) === weekBKey) ?? null;

  return (
    <div className="w-[210px] shrink-0 border-l border-neutral-200 pl-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-medium text-neutral-500">{cityName} · weekly burn</p>
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
      </div>

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
