'use client';

import { useEffect, useState } from 'react';
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
  cities,
  scopeLabel,
  date,
  onClose,
  onChanged,
}: {
  cities: { slug: string; name: string }[];
  scopeLabel: string;
  date: Date;
  onClose: () => void;
  onChanged: () => void;
}) {
  const dateStr = toISODate(date);
  const citySlugs = cities.map((c) => c.slug);
  const cityNameBySlug = Object.fromEntries(cities.map((c) => [c.slug, c.name]));
  const multiCity = cities.length > 1;

  const [fetchedEvents, setFetchedEvents] = useState<CalendarEvent[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Fetch events across every city in scope for the year this date falls in --
  // decoupled from the parent's per-current-city `events` state so Country/
  // Indigo scope can see (and edit/delete) events belonging to any city in
  // the group, not just the one selected in the header dropdown.
  useEffect(() => {
    if (!supabase) return;
    const year = date.getFullYear();
    let cancelled = false;
    supabase
      .from('calendar_events')
      .select('*')
      .in('city_slug', citySlugs)
      .gte('start_date', `${year}-01-01`)
      .lte('start_date', `${year}-12-31`)
      .then(({ data }) => {
        if (cancelled) return;
        setFetchedEvents((data as CalendarEvent[]) ?? []);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- citySlugs is derived fresh each render from `cities`
  }, [cities, date]);

  const touching = fetchedEvents
    .filter((ev) => ev.start_date <= dateStr && (ev.end_date ?? ev.start_date) >= dateStr)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState({ title: '', category: 'other_event' as Category, start_date: dateStr, end_date: '', source_url: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Default straight into "new event" mode once the fetch resolves and there's
  // nothing on this date yet -- computed at render time (not via an effect)
  // so there's no cascading setState and no flash of the wrong panel.
  const effectiveEditingId = editingId ?? (loaded && touching.length === 0 ? 'new' : null);

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
    if (effectiveEditingId === 'new') {
      // Country/Indigo scope writes one row per city in the group so each
      // city keeps its own independently editable/deletable event record --
      // tagged with a shared batch_id (only when there's actually more than
      // one city) so the whole group can be found and deleted together later
      // if it turns out it should never have gone out that wide.
      const batchId = multiCity ? crypto.randomUUID() : null;
      const payload = citySlugs.map((slug) => ({
        city_slug: slug,
        batch_id: batchId,
        title: form.title,
        category: form.category,
        start_date: form.start_date,
        end_date: form.end_date || null,
        source_url: form.source_url || null,
      }));
      const { error: err } = await supabase.from('calendar_events').insert(payload);
      setBusy(false);
      if (err) {
        setError(err.message);
        return;
      }
    } else {
      // Editing an existing event only ever touches that one row/city,
      // regardless of what scope is currently active.
      const { error: err } = await supabase
        .from('calendar_events')
        .update({
          title: form.title,
          category: form.category,
          start_date: form.start_date,
          end_date: form.end_date || null,
          source_url: form.source_url || null,
        })
        .eq('id', editingId);
      setBusy(false);
      if (err) {
        setError(err.message);
        return;
      }
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

  // Deletes every row that was written together in one Country/Indigo-scope
  // "add event" -- looked up by batch_id across ALL cities, not just the ones
  // in the currently active scope, since the batch may span cities outside
  // the view you're deleting from (e.g. added via Indigo, cleaned up from
  // Mexico scope).
  async function removeBatch(batchId: string) {
    if (!supabase) return;
    setBusy(true);
    const { data: rows, error: lookupErr } = await supabase
      .from('calendar_events')
      .select('id')
      .eq('batch_id', batchId);
    if (lookupErr) {
      setBusy(false);
      setError(lookupErr.message);
      return;
    }
    const count = rows?.length ?? 0;
    if (!confirm(`Delete this event from all ${count} ${count === 1 ? 'city' : 'cities'} it was added to?`)) {
      setBusy(false);
      return;
    }
    const { error: err } = await supabase.from('calendar_events').delete().eq('batch_id', batchId);
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
        <h2 className="text-lg font-semibold text-neutral-900 mb-1">{scopeLabel}</h2>
        <p className="text-xs text-neutral-400 mb-4 capitalize">
          {DATE_LABEL_FMT.format(date)}
          {multiCity && ` — ${cities.length} cities`}
        </p>

        {touching.length > 0 && effectiveEditingId === null && (
          <div className="flex flex-col gap-1.5 mb-4">
            {touching.map((ev) => (
              <div key={ev.id} className="flex items-center gap-2 text-sm border border-neutral-100 rounded-md px-3 py-1.5">
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500 shrink-0">{CATEGORY_LABEL[ev.category]}</span>
                {multiCity && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#F9D0B8] text-[#883607] shrink-0">
                    {cityNameBySlug[ev.city_slug] ?? ev.city_slug}
                  </span>
                )}
                <span className="flex-1 truncate">{ev.title}</span>
                <button onClick={() => startEdit(ev)} className="text-xs text-neutral-400 hover:text-[#FD9153]">
                  Edit
                </button>
                <button onClick={() => remove(ev.id)} className="text-xs text-neutral-400 hover:text-red-600">
                  Delete
                </button>
                {ev.batch_id && (
                  <button
                    onClick={() => removeBatch(ev.batch_id!)}
                    title="Delete this event from every city it was added to at once"
                    className="text-xs text-neutral-400 hover:text-red-600"
                  >
                    Delete batch
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={startNew}
              className="text-xs px-3 py-1.5 rounded-md border border-dashed border-neutral-300 text-neutral-500 hover:border-[#FD9153] hover:text-[#FD9153] transition-colors mt-1"
            >
              + Add another event this day
            </button>
          </div>
        )}

        {effectiveEditingId !== null && (
          <div className="border border-neutral-200 rounded-md p-3 bg-neutral-50">
            {effectiveEditingId === 'new' && multiCity && (
              <p className="text-[11px] text-neutral-500 mb-2">
                This event will be added to all {cities.length} cities: {cities.map((c) => c.name).join(', ')}.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input
                autoFocus
                placeholder="Title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="col-span-2 border border-neutral-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-[#FD9153]"
              />
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as Category })}
                className="col-span-2 border border-neutral-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-[#FD9153]"
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
                  className="border border-neutral-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-[#FD9153]"
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-neutral-500">
                To (optional)
                <input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  className="border border-neutral-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-[#FD9153]"
                />
              </label>
              <input
                placeholder="Source URL (optional)"
                value={form.source_url}
                onChange={(e) => setForm({ ...form, source_url: e.target.value })}
                className="col-span-2 border border-neutral-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-[#FD9153]"
              />
            </div>
            {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
            <div className="flex gap-2">
              <button
                disabled={busy || !form.title || !form.start_date}
                onClick={save}
                className="text-xs px-3 py-1.5 rounded-md bg-[#FD9153] text-white font-medium disabled:opacity-50"
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
