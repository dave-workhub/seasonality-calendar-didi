'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ALL_CITIES, currencyForCity } from '@/lib/cities';
import { isoWeekLabel } from '@/lib/holidays';

interface BurnRow {
  id: number;
  city_slug: string;
  iso_year: number;
  iso_week: number;
  b_burn_pct: number | null;
  b_burn_nominal: number | null;
  c_burn_pct: number | null;
  c_burn_nominal: number | null;
  currency: string;
}

const CITY_NAME: Record<string, string> = Object.fromEntries(ALL_CITIES.map((c) => [c.slug, c.name]));
const CITY_SLUGS = new Set(ALL_CITIES.map((c) => c.slug));

// Expected header cells, case/space-insensitive, in this column order:
// Year | Week | City | B Burn % | B Burn Nominal | C Burn % | C Burn Nominal
const EXPECTED_HEADERS = ['year', 'week', 'city', 'bburn%', 'bburnnominal', 'cburn%', 'cburnnominal'];

function normalizeHeader(h: string) {
  return h.trim().toLowerCase().replace(/\s+/g, '');
}

function splitLine(line: string): string[] {
  const delim = line.includes('\t') ? '\t' : ',';
  return line.split(delim).map((c) => c.trim());
}

function num(v: string): number | null {
  if (v === undefined || v === null || v.trim() === '') return null;
  const n = Number(v.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

export default function BurnPanel({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<BurnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [csv, setCsv] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!supabase) return;
    setLoading(true);
    const { data, error: err } = await supabase
      .from('weekly_burn')
      .select('id, city_slug, iso_year, iso_week, b_burn_pct, b_burn_nominal, c_burn_pct, c_burn_nominal, currency')
      .order('iso_year', { ascending: false })
      .order('iso_week', { ascending: false });
    if (err) setError(err.message);
    else setRows((data ?? []) as BurnRow[]);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount pattern
    load();
  }, []);

  async function importCsv() {
    if (!supabase || !csv.trim()) return;
    setError(null);
    setStatus(null);

    const lines = csv.trim().split('\n').filter((l) => l.trim() !== '');
    if (lines.length < 2) {
      setError('Paste the header row plus at least one data row.');
      return;
    }

    const header = splitLine(lines[0]).map(normalizeHeader);
    const headerOk = EXPECTED_HEADERS.every((h, i) => header[i] === h);
    if (!headerOk) {
      setError(`Header row doesn't match. Expected: Year, Week, City, B Burn %, B Burn Nominal, C Burn %, C Burn Nominal`);
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
      const citySlug = (city ?? '').trim().toLowerCase();

      if (!year || !week) {
        setError(`Row ${i + 1}: missing year or week.`);
        return;
      }
      if (!CITY_SLUGS.has(citySlug)) {
        setError(`Row ${i + 1}: "${city}" isn't a known city slug (use e.g. cartagena, medellin, saltillo, hermosillo, merida).`);
        return;
      }

      payload.push({
        city_slug: citySlug,
        iso_year: year,
        iso_week: week,
        b_burn_pct: num(bPct),
        b_burn_nominal: num(bNom),
        c_burn_pct: num(cPct),
        c_burn_nominal: num(cNom),
        currency: currencyForCity(citySlug) ?? 'USD',
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
    setCsv('');
    load();
  }

  async function removeRow(id: number) {
    if (!supabase) return;
    const { error: err } = await supabase.from('weekly_burn').delete().eq('id', id);
    if (err) setError(err.message);
    else load();
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-neutral-900 mb-1">Weekly burn</h2>
        <p className="text-xs text-neutral-400 mb-4">Admin only. Paste a CSV export from the weekly Google Sheet template below.</p>

        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder="Year,Week,City,B Burn %,B Burn Nominal,C Burn %,C Burn Nominal&#10;2026,32,cartagena,4.2,18500,2.8,9200"
          rows={4}
          className="w-full border border-neutral-200 rounded-md px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#2F6D46] mb-2"
        />
        <div className="flex items-center gap-2 mb-5">
          <button
            onClick={importCsv}
            disabled={busy || !csv.trim()}
            className="text-xs px-3 py-1.5 rounded-md bg-[#2F6D46] text-white font-medium disabled:opacity-50"
          >
            Import
          </button>
          {status && <span className="text-xs text-[#2F6D46]">{status}</span>}
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>

        <p className="text-xs text-neutral-500 mb-2">Imported weeks ({rows.length})</p>
        {loading ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-neutral-400">No burn data imported yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-xs border border-neutral-100 rounded-md px-3 py-1.5">
                <span className="w-32 shrink-0 text-neutral-500">
                  Week {r.iso_week} · {isoWeekLabel(r.iso_year, r.iso_week)}
                </span>
                <span className="w-24 shrink-0 font-medium">{CITY_NAME[r.city_slug] ?? r.city_slug}</span>
                <span className="flex-1 text-neutral-600">
                  B: {r.b_burn_pct ?? '—'}% · {r.currency} {r.b_burn_nominal?.toLocaleString() ?? '—'} &nbsp;·&nbsp; C: {r.c_burn_pct ?? '—'}% ·{' '}
                  {r.currency} {r.c_burn_nominal?.toLocaleString() ?? '—'}
                </span>
                <button onClick={() => removeRow(r.id)} className="text-neutral-400 hover:text-red-600 shrink-0">
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <button onClick={onClose} className="absolute top-3 right-4 text-neutral-400 hover:text-neutral-600 text-lg">
          ×
        </button>
      </div>
    </div>
  );
}
