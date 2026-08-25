'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { HolidayEntry } from '@/lib/holidays';

interface OverrideRow {
  id: number;
  override_date: string;
  hidden: boolean;
  custom_name: string | null;
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

export default function HolidaysPanel({
  citySlug,
  cityName,
  year,
  holidays,
  onClose,
  onChanged,
}: {
  citySlug: string;
  cityName: string;
  year: number;
  holidays: HolidayEntry[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [renaming, setRenaming] = useState<string | null>(null); // "month-day"
  const [renameValue, setRenameValue] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from('holiday_overrides')
      .select('id, override_date, hidden, custom_name')
      .eq('city_slug', citySlug)
      .gte('override_date', `${year}-01-01`)
      .lte('override_date', `${year}-12-31`)
      .then(({ data }) => setOverrides((data as OverrideRow[]) ?? []));
  }, [citySlug, year, onChanged]);

  async function hide(month: number, day: number) {
    if (!supabase) return;
    const dateStr = `${year}-${pad2(month + 1)}-${pad2(day)}`;
    const { error: err } = await supabase.from('holiday_overrides').upsert(
      { city_slug: citySlug, override_date: dateStr, hidden: true },
      { onConflict: 'city_slug,override_date' }
    );
    if (err) setError(err.message);
    else onChanged();
  }

  async function rename(month: number, day: number) {
    if (!supabase || !renameValue.trim()) return;
    const dateStr = `${year}-${pad2(month + 1)}-${pad2(day)}`;
    const { error: err } = await supabase.from('holiday_overrides').upsert(
      { city_slug: citySlug, override_date: dateStr, hidden: false, custom_name: renameValue.trim() },
      { onConflict: 'city_slug,override_date' }
    );
    if (err) setError(err.message);
    else {
      setRenaming(null);
      onChanged();
    }
  }

  async function addLocal() {
    if (!supabase || !newDate || !newName.trim()) return;
    const { error: err } = await supabase.from('holiday_overrides').upsert(
      { city_slug: citySlug, override_date: newDate, hidden: false, custom_name: newName.trim() },
      { onConflict: 'city_slug,override_date' }
    );
    if (err) setError(err.message);
    else {
      setNewDate('');
      setNewName('');
      onChanged();
    }
  }

  async function removeOverride(id: number) {
    if (!supabase) return;
    const { error: err } = await supabase.from('holiday_overrides').delete().eq('id', id);
    if (err) setError(err.message);
    else onChanged();
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-neutral-900 mb-1">Holidays for {cityName}</h2>
        <p className="text-xs text-neutral-400 mb-4">Year {year} — hide a wrong holiday, rename it, or add a local one</p>

        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

        <p className="text-xs text-neutral-500 mb-2">Official holidays visible this year (live source + exceptions applied)</p>
        <div className="flex flex-col gap-1.5 mb-5">
          {holidays.map((h) => {
            const key = `${h.month}-${h.day}`;
            return (
              <div key={key} className="flex items-center gap-2 text-sm border border-neutral-100 rounded-md px-3 py-1.5">
                <span className="text-[10px] text-neutral-400 w-14 shrink-0">
                  {pad2(h.day)}/{pad2(h.month + 1)}
                </span>
                {renaming === key ? (
                  <>
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      className="flex-1 border border-neutral-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-[#FD9153]"
                    />
                    <button onClick={() => rename(h.month, h.day)} className="text-xs text-[#FD9153]">
                      Save
                    </button>
                    <button onClick={() => setRenaming(null)} className="text-xs text-neutral-400">
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 truncate">{h.name}</span>
                    <button
                      onClick={() => {
                        setRenaming(key);
                        setRenameValue(h.name);
                      }}
                      className="text-xs text-neutral-400 hover:text-[#FD9153]"
                    >
                      Rename
                    </button>
                    <button onClick={() => hide(h.month, h.day)} className="text-xs text-neutral-400 hover:text-red-600">
                      Hide
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-xs text-neutral-500 mb-2">Add a local holiday (not from the official source)</p>
        <div className="flex gap-2 mb-5">
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="border border-neutral-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-[#FD9153]"
          />
          <input
            placeholder="Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 border border-neutral-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-[#FD9153]"
          />
          <button
            onClick={addLocal}
            disabled={!newDate || !newName.trim()}
            className="text-xs px-3 py-1.5 rounded-md bg-[#FD9153] text-white font-medium disabled:opacity-50"
          >
            Add
          </button>
        </div>

        {overrides.length > 0 && (
          <>
            <p className="text-xs text-neutral-500 mb-2">Active exceptions for {year}</p>
            <div className="flex flex-col gap-1.5">
              {overrides.map((o) => (
                <div key={o.id} className="flex items-center gap-2 text-xs border border-neutral-100 rounded-md px-3 py-1.5 text-neutral-500">
                  <span className="w-20 shrink-0">{o.override_date}</span>
                  <span className="flex-1">{o.hidden ? 'Hidden' : `Renamed/added: ${o.custom_name}`}</span>
                  <button onClick={() => removeOverride(o.id)} className="hover:text-red-600">
                    Remove exception
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <button onClick={onClose} className="absolute top-3 right-4 text-neutral-400 hover:text-neutral-600 text-lg">
          ×
        </button>
      </div>
    </div>
  );
}
