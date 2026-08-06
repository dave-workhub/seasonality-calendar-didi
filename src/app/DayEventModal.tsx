'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { CalendarEvent, Category, EDITABLE_CATEGORIES } from './CalendarApp';

const CATEGORY_LABEL: Record<Category, string> = {
  official_holiday: 'Official Holiday',
  high_demand_celebration: 'High Demand',
  school_break: 'School Break',
  back_to_school: 'Back to School',
  other_event: 'Other Event',
};

function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const DATE_LABEL_FMT = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long', year: 'numeric' });

export default function DayEventModal({
  citySlug,
  cityName,
  date,
  events,
  onClose,
  onChanged,
}: {
  citySlug: string;
  cityName: string;
  date: Date;
  events: CalendarEvent[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const dateStr = toISODate(date);
  const touching = events
    .filter((ev) => ev.start_date <= dateStr && (ev.end_date ?? ev.start_date) >= dateStr)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  const [editingId, setEditingId] = useState<number | 'new' | null>(touching.length === 0 ? 'new' : null);
  const [form, setForm] = useState({ title: '', category: 'other_event' as Category, start_date: dateStr, end_date: '', source_url: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function startNew() {
    setForm({ title: '', category: 'other_event', start_date: dateStr, end_date: '', source_url: '' });
    setEditingId('new');
    setError(null);
  }

  function startEdit(ev: CalendarEvent) {
    setForm({
      title: ev.title,
      category: ev.category,
      start_date: ev.start_date,
      end_date: ev.end_date ?? '',
      source_url: ev.source_url ?? '',
    });
    setEditingId(ev.id);
    setError(null);
  }

  async function save() {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const payload = {
      city_slug: citySlug,
      title: form.title,
      category: form.category,
      start_date: form.start_date,
      end_date: form.end_date || null,
      source_url: form.source_url || null,
    };
    const query =
      editingId === 'new'
        ? supabase.from('calendar_events').insert(payload)
        : supabase.from('calendar_events').update(payload).eq('id', editingId);
    const { error: err } = await query;
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setEditingId(null);
    onChanged();
    onClose();
  }

  async function remove(id: number) {
    if (!supabase) return;
    if (!confirm('Delete this event?')) return;
    setBusy(true);
    const { error: err } = await supabase.from('calendar_events').delete().eq('id', id);
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    onChanged();
    if (touching.length === 1) onClose();
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="relative bg-white rounded-lg shadow-xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-neutral-900 mb-1">{cityName}</h2>
        <p className="text-xs text-neutral-400 mb-4 capitalize">{DATE_LABEL_FMT.format(date)}</p>

        {touching.length > 0 && editingId === null && (
          <div className="flex flex-col gap-1.5 mb-4">
            {touching.map((ev) => (
              <div key={ev.id} className="flex items-center gap-2 text-sm border border-neutral-100 rounded-md px-3 py-1.5">
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500 shrink-0">{CATEGORY_LABEL[ev.category]}</span>
                <span className="flex-1 truncate">{ev.title}</span>
                <button onClick={() => startEdit(ev)} className="text-xs text-neutral-400 hover:text-[#2F6D46]">
                  Edit
                </button>
                <button onClick={() => remove(ev.id)} className="text-xs text-neutral-400 hover:text-red-600">
                  Delete
                </button>
              </div>
            ))}
            <button
              onClick={startNew}
              className="text-xs px-3 py-1.5 rounded-md border border-dashed border-neutral-300 text-neutral-500 hover:border-[#2F6D46] hover:text-[#2F6D46] transition-colors mt-1"
            >
              + Add another event this day
            </button>
          </div>
        )}

        {editingId !== null && (
          <div className="border border-neutral-200 rounded-md p-3 bg-neutral-50">
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input
                autoFocus
                placeholder="Title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="col-span-2 border border-neutral-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-[#2F6D46]"
              />
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as Category })}
                className="col-span-2 border border-neutral-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-[#2F6D46]"
              >
                {EDITABLE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-xs text-neutral-500">
                From
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  className="border border-neutral-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-[#2F6D46]"
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-neutral-500">
                To (optional)
                <input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  className="border border-neutral-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-[#2F6D46]"
                />
              </label>
              <input
                placeholder="Source URL (optional)"
                value={form.source_url}
                onChange={(e) => setForm({ ...form, source_url: e.target.value })}
                className="col-span-2 border border-neutral-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-[#2F6D46]"
              />
            </div>
            {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
            <div className="flex gap-2">
              <button
                disabled={busy || !form.title || !form.start_date}
                onClick={save}
                className="text-xs px-3 py-1.5 rounded-md bg-[#2F6D46] text-white font-medium disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={() => (touching.length > 0 ? setEditingId(null) : onClose())}
                className="text-xs px-3 py-1.5 rounded-md border border-neutral-200 text-neutral-600"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <button onClick={onClose} className="absolute top-3 right-4 text-neutral-400 hover:text-neutral-600 text-lg">
          ×
        </button>
      </div>
    </div>
  );
}
