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
      setError(err instanceof Error ? err.message : 'Something went wrong');
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
              Account created. You can now sign in with your email and password.
            </p>
            <button
              onClick={() => {
                setSignupDone(false);
                setMode('login');
              }}
              className="px-4 py-1.5 rounded-md bg-[#2F6D46] text-white text-sm font-medium hover:bg-[#26593A] transition-colors"
            >
              Sign in
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-neutral-900 mb-4">
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </h2>
            <form onSubmit={submit} className="flex flex-col gap-3">
              <input
                type="email"
                required
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="border border-neutral-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#2F6D46]"
              />
              <input
                type="password"
                required
                minLength={6}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border border-neutral-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#2F6D46]"
              />
              {error && <p className="text-xs text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 rounded-md bg-[#2F6D46] text-white text-sm font-medium hover:bg-[#26593A] transition-colors disabled:opacity-50"
              >
                {loading ? 'One moment…' : mode === 'login' ? 'Log in' : 'Sign up'}
              </button>
            </form>
            <button
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login');
                setError(null);
              }}
              className="text-xs text-neutral-500 hover:text-[#2F6D46] mt-3 underline"
            >
              {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
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
