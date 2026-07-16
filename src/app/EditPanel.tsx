'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { CalendarEvent, Category, EDITABLE_CATEGORIES } from './CalendarApp';
import { HolidayEntry } from '@/lib/holidays';

const CATEGORY_LABEL: Record<Category, string> = {
  official_holiday: 'Official Holiday',
  high_demand_celebration: 'High Demand',
  school_break: 'School Break',
  back_to_school: 'Back to School',
  other_event: 'Other Event',
};

interface OverrideRow {
  id: number;
  override_date: string;
  hidden: boolean;
  custom_name: string | null;
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

export default function EditPanel({
  citySlug,
  cityName,
  year,
  events,
  holidays,
  onClose,
  onChanged,
}: {
  citySlug: string;
  cityName: string;
  year: number;
  events: CalendarEvent[];
  holidays: HolidayEntry[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<'events' | 'holidays'>('events');

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-neutral-900 mb-1">Editar {cityName}</h2>
        <p className="text-xs text-neutral-400 mb-4">Año {year}</p>

        <div className="flex gap-2 mb-4 border-b border-neutral-200">
          {(['events', 'holidays'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t ? 'border-[#FD7C41] text-[#FD7C41]' : 'border-transparent text-neutral-400 hover:text-neutral-600'
              }`}
            >
              {t === 'events' ? 'Eventos' : 'Festivos'}
            </button>
          ))}
        </div>

        {tab === 'events' ? (
          <EventsTab citySlug={citySlug} year={year} events={events} onChanged={onChanged} />
        ) : (
          <HolidaysTab citySlug={citySlug} year={year} holidays={holidays} onChanged={onChanged} />
        )}

        <button onClick={onClose} className="absolute top-3 right-4 text-neutral-400 hover:text-neutral-600 text-lg">
          ×
        </button>
      </div>
    </div>
  );
}

function EventsTab({
  citySlug,
  year,
  events,
  onChanged,
}: {
  citySlug: string;
  year: number;
  events: CalendarEvent[];
  onChanged: () => void;
}) {
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState({ title: '', category: 'other_event' as Category, start_date: '', end_date: '', source_url: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function startNew() {
    setForm({ title: '', category: 'other_event', start_date: `${year}-01-01`, end_date: '', source_url: '' });
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
  }

  async function remove(id: number) {
    if (!supabase) return;
    if (!confirm('¿Borrar este evento?')) return;
    setBusy(true);
    const { error: err } = await supabase.from('calendar_events').delete().eq('id', id);
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    onChanged();
  }

  const sorted = [...events].sort((a, b) => a.start_date.localeCompare(b.start_date));

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button
          onClick={startNew}
          className="text-xs px-3 py-1.5 rounded-md bg-[#FD7C41] text-white font-medium hover:bg-[#e86d34] transition-colors"
        >
          + Agregar evento
        </button>
      </div>

      {editingId !== null && (
        <div className="border border-neutral-200 rounded-md p-3 mb-4 bg-neutral-50">
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input
              placeholder="Título"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="col-span-2 border border-neutral-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-[#FD7C41]"
            />
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as Category })}
              className="border border-neutral-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-[#FD7C41]"
            >
              {EDITABLE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
            <input
              placeholder="URL fuente (opcional)"
              value={form.source_url}
              onChange={(e) => setForm({ ...form, source_url: e.target.value })}
              className="border border-neutral-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-[#FD7C41]"
            />
            <label className="flex items-center gap-1.5 text-xs text-neutral-500">
              Desde
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="border border-neutral-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-[#FD7C41]"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-neutral-500">
              Hasta (opcional)
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className="border border-neutral-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-[#FD7C41]"
              />
            </label>
          </div>
          {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
          <div className="flex gap-2">
            <button
              disabled={busy || !form.title || !form.start_date}
              onClick={save}
              className="text-xs px-3 py-1.5 rounded-md bg-[#FD7C41] text-white font-medium disabled:opacity-50"
            >
              Guardar
            </button>
            <button onClick={() => setEditingId(null)} className="text-xs px-3 py-1.5 rounded-md border border-neutral-200 text-neutral-600">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {sorted.length === 0 && <p className="text-sm text-neutral-400">No hay eventos curados para esta ciudad todavía.</p>}
        {sorted.map((ev) => (
          <div key={ev.id} className="flex items-center gap-2 text-sm border border-neutral-100 rounded-md px-3 py-1.5">
            <span className="text-[10px] text-neutral-400 w-20 shrink-0">
              {ev.start_date.slice(5)}
              {ev.end_date ? `–${ev.end_date.slice(5)}` : ''}
            </span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500 shrink-0">{CATEGORY_LABEL[ev.category]}</span>
            <span className="flex-1 truncate">{ev.title}</span>
            <button onClick={() => startEdit(ev)} className="text-xs text-neutral-400 hover:text-[#FD7C41]">
              Editar
            </button>
            <button onClick={() => remove(ev.id)} className="text-xs text-neutral-400 hover:text-red-600">
              Borrar
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function HolidaysTab({
  citySlug,
  year,
  holidays,
  onChanged,
}: {
  citySlug: string;
  year: number;
  holidays: HolidayEntry[];
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
    <div>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      <p className="text-xs text-neutral-500 mb-2">Festivos oficiales visibles este año (fuente en vivo + excepciones aplicadas)</p>
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
                    className="flex-1 border border-neutral-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-[#FD7C41]"
                  />
                  <button onClick={() => rename(h.month, h.day)} className="text-xs text-[#FD7C41]">
                    Guardar
                  </button>
                  <button onClick={() => setRenaming(null)} className="text-xs text-neutral-400">
                    Cancelar
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
                    className="text-xs text-neutral-400 hover:text-[#FD7C41]"
                  >
                    Renombrar
                  </button>
                  <button onClick={() => hide(h.month, h.day)} className="text-xs text-neutral-400 hover:text-red-600">
                    Ocultar
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-neutral-500 mb-2">Agregar festivo local (no viene de la fuente oficial)</p>
      <div className="flex gap-2 mb-5">
        <input
          type="date"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
          className="border border-neutral-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-[#FD7C41]"
        />
        <input
          placeholder="Nombre"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="flex-1 border border-neutral-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-[#FD7C41]"
        />
        <button
          onClick={addLocal}
          disabled={!newDate || !newName.trim()}
          className="text-xs px-3 py-1.5 rounded-md bg-[#FD7C41] text-white font-medium disabled:opacity-50"
        >
          Agregar
        </button>
      </div>

      {overrides.length > 0 && (
        <>
          <p className="text-xs text-neutral-500 mb-2">Excepciones activas para {year}</p>
          <div className="flex flex-col gap-1.5">
            {overrides.map((o) => (
              <div key={o.id} className="flex items-center gap-2 text-xs border border-neutral-100 rounded-md px-3 py-1.5 text-neutral-500">
                <span className="w-20 shrink-0">{o.override_date}</span>
                <span className="flex-1">
                  {o.hidden ? 'Oculto' : `Renombrado/agregado: ${o.custom_name}`}
                </span>
                <button onClick={() => removeOverride(o.id)} className="hover:text-red-600">
                  Quitar excepción
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
