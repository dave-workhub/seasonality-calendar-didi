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

export default function BurnSidebar({ citySlug, cityName }: { citySlug: string; cityName: string }) {
  const [rows, setRows] = useState<BurnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentWeek = isoWeek(now);

  async function load() {
    if (!supabase) return;
    setLoading(true);
    const { data, error: err } = await supabase
      .from('weekly_burn')
      .select('id, iso_year, iso_week, b_burn_pct, b_burn_nominal, c_burn_pct, c_burn_nominal, currency')
      .eq('city_slug', citySlug)
      .order('iso_year', { ascending: false })
      .order('iso_week', { ascending: false })
      .limit(12);
    if (err) setError(err.message);
    else setRows((data ?? []) as BurnRow[]);
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

  return (
    <div className="w-[190px] shrink-0 border-l border-neutral-200 pl-4">
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

      {loading ? (
        <p className="text-xs text-neutral-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-[11px] text-neutral-400">No burn data yet for {cityName}.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {rows.map((r) => {
            const isCurrent = r.iso_year === currentYear && r.iso_week === currentWeek;
            return (
              <div
                key={r.id}
                className={`rounded-md border px-2 py-1.5 ${isCurrent ? 'border-[#9AC7A4] bg-[#eef7f0]' : 'border-neutral-100'}`}
              >
                <p className={`text-[10px] font-medium mb-0.5 ${isCurrent ? 'text-[#1E4A2C]' : 'text-neutral-500'}`}>
                  Week {r.iso_week} · {isoWeekLabel(r.iso_year, r.iso_week)}
                </p>
                <p className="text-[10px] text-neutral-700">
                  B {r.b_burn_pct ?? '—'}% · {r.currency} {fmtNum(r.b_burn_nominal)}
                </p>
                <p className="text-[10px] text-neutral-700">
                  C {r.c_burn_pct ?? '—'}% · {r.currency} {fmtNum(r.c_burn_nominal)}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
