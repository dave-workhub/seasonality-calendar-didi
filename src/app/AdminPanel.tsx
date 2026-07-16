'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { CLUSTERS } from '@/lib/cities';

interface Request {
  id: number;
  user_id: string;
  city_slug: string;
  status: string;
  requested_at: string;
  email?: string;
}

const CITY_NAME: Record<string, string> = Object.fromEntries(
  CLUSTERS.flatMap((c) => c.cities.map((city) => [city.slug, city.name]))
);

export default function AdminPanel({ onClose }: { onClose: () => void }) {
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!supabase) return;
    setLoading(true);
    const [{ data: reqs, error: reqErr }, { data: profiles }] = await Promise.all([
      supabase.from('city_permissions').select('id, user_id, city_slug, status, requested_at').order('requested_at', { ascending: false }),
      supabase.from('profiles').select('id, email'),
    ]);
    if (reqErr) {
      setError(reqErr.message);
      setLoading(false);
      return;
    }
    const emailById = new Map((profiles ?? []).map((p) => [p.id, p.email]));
    setRequests((reqs ?? []).map((r) => ({ ...r, email: emailById.get(r.user_id) })));
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount pattern
    load();
  }, []);

  async function decide(id: number, status: 'approved' | 'rejected') {
    if (!supabase) return;
    const { error: err } = await supabase.from('city_permissions').update({ status, decided_at: new Date().toISOString() }).eq('id', id);
    if (err) setError(err.message);
    else load();
  }

  const pending = requests.filter((r) => r.status === 'pending');
  const decided = requests.filter((r) => r.status !== 'pending');

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="relative bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Solicitudes de acceso</h2>

        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
        {loading ? (
          <p className="text-sm text-neutral-400">Cargando…</p>
        ) : (
          <>
            <p className="text-xs text-neutral-500 mb-2">Pendientes ({pending.length})</p>
            <div className="flex flex-col gap-1.5 mb-5">
              {pending.length === 0 && <p className="text-sm text-neutral-400">No hay solicitudes pendientes.</p>}
              {pending.map((r) => (
                <div key={r.id} className="flex items-center gap-2 text-sm border border-neutral-100 rounded-md px-3 py-1.5">
                  <span className="flex-1 truncate">
                    {r.email} → <span className="font-medium">{CITY_NAME[r.city_slug] ?? r.city_slug}</span>
                  </span>
                  <button onClick={() => decide(r.id, 'approved')} className="text-xs px-2 py-1 rounded bg-[#FD7C41] text-white font-medium">
                    Aprobar
                  </button>
                  <button onClick={() => decide(r.id, 'rejected')} className="text-xs px-2 py-1 rounded border border-neutral-200 text-neutral-600">
                    Rechazar
                  </button>
                </div>
              ))}
            </div>

            <p className="text-xs text-neutral-500 mb-2">Historial ({decided.length})</p>
            <div className="flex flex-col gap-1.5">
              {decided.map((r) => (
                <div key={r.id} className="flex items-center gap-2 text-xs border border-neutral-100 rounded-md px-3 py-1.5 text-neutral-500">
                  <span className="flex-1 truncate">
                    {r.email} → {CITY_NAME[r.city_slug] ?? r.city_slug}
                  </span>
                  <span className={r.status === 'approved' ? 'text-emerald-600' : 'text-red-500'}>{r.status}</span>
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
