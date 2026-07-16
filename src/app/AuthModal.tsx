'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function AuthModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [signupDone, setSignupDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setError(null);
    setLoading(true);
    try {
      if (mode === 'login') {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        onClose();
      } else {
        const { data, error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        // Autoconfirm is on, so signUp already returns an active session — no
        // email confirmation step, just close and let the header pick it up.
        if (data.session) onClose();
        else setSignupDone(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Algo salió mal');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="relative bg-white rounded-lg shadow-xl w-full max-w-sm p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {signupDone ? (
          <div className="text-center">
            <p className="text-sm text-neutral-700 mb-4">
              Cuenta creada. Ya puedes iniciar sesión con tu correo y contraseña.
            </p>
            <button
              onClick={() => {
                setSignupDone(false);
                setMode('login');
              }}
              className="px-4 py-1.5 rounded-md bg-[#FD7C41] text-white text-sm font-medium hover:bg-[#e86d34] transition-colors"
            >
              Iniciar sesión
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-neutral-900 mb-4">
              {mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
            </h2>
            <form onSubmit={submit} className="flex flex-col gap-3">
              <input
                type="email"
                required
                placeholder="Correo"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="border border-neutral-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#FD7C41]"
              />
              <input
                type="password"
                required
                minLength={6}
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border border-neutral-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#FD7C41]"
              />
              {error && <p className="text-xs text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 rounded-md bg-[#FD7C41] text-white text-sm font-medium hover:bg-[#e86d34] transition-colors disabled:opacity-50"
              >
                {loading ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Registrarme'}
              </button>
            </form>
            <button
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login');
                setError(null);
              }}
              className="text-xs text-neutral-500 hover:text-[#FD7C41] mt-3 underline"
            >
              {mode === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
            </button>
          </>
        )}

        <button onClick={onClose} className="absolute top-3 right-4 text-neutral-400 hover:text-neutral-600 text-lg">
          ×
        </button>
      </div>
    </div>
  );
}
