'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function AuthModal({
  onClose,
  inline = false,
}: {
  onClose?: () => void;
  // Renders as a plain centered card with no backdrop/close button, for use
  // as the body of a full-page sign-in gate instead of a popup.
  inline?: boolean;
}) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [signupDone, setSignupDone] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setError(null);
    setLoading(true);
    try {
      if (mode === 'login') {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        onClose?.();
      } else {
        const { data, error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        // Autoconfirm is on, so signUp already returns an active session — no
        // email confirmation step, just close and let the header pick it up.
        if (data.session) onClose?.();
        else setSignupDone(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  async function signInWithGoogle() {
    if (!supabase) return;
    setError(null);
    setGoogleLoading(true);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Hints Google's account picker toward the work domain -- a UI nicety
        // only, not a security boundary (the app checks the real email after
        // sign-in and signs out anything that isn't actually @didi-labs.com).
        queryParams: { hd: 'didi-labs.com' },
        redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      },
    });
    if (err) {
      setError(err.message);
      setGoogleLoading(false);
    }
    // On success the browser navigates away to Google, so no further local
    // state update is needed here.
  }

  const body = signupDone ? (
    <div className="text-center">
      <p className="text-sm text-neutral-700 mb-4">
        Account created. You can now sign in with your email and password.
      </p>
      <button
        onClick={() => {
          setSignupDone(false);
          setMode('login');
        }}
        className="px-4 py-1.5 rounded-md bg-[#FD9153] text-white text-sm font-medium hover:bg-[#FC5E03] transition-colors"
      >
        Sign in
      </button>
    </div>
  ) : (
    <>
      <h2 className="text-lg font-semibold text-neutral-900 mb-4">
        {mode === 'login' ? 'Sign in' : 'Create account'}
      </h2>

      <button
        onClick={signInWithGoogle}
        disabled={googleLoading}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md border border-neutral-300 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors disabled:opacity-50"
      >
        <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l6-6C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.2-.1-2.4-.4-3.5z"/>
          <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l6-6C34.6 5.1 29.6 3 24 3 16.3 3 9.7 7.3 6.3 14.7z"/>
          <path fill="#4CAF50" d="M24 45c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.6 36.4 26.9 37 24 37c-5.3 0-9.7-3.1-11.3-7.5l-6.6 5.1C9.5 40.6 16.2 45 24 45z"/>
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.6 5.6C41.4 36.5 45 30.9 45 24c0-1.2-.1-2.4-.4-3.5z"/>
        </svg>
        {googleLoading ? 'One moment…' : 'Sign in with Google'}
      </button>
      <p className="text-[11px] text-neutral-400 text-center mt-1.5">Restricted to @didi-labs.com accounts</p>

      <div className="flex items-center gap-2 my-3">
        <div className="h-px bg-neutral-200 flex-1" />
        <span className="text-[11px] text-neutral-400">or</span>
        <div className="h-px bg-neutral-200 flex-1" />
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border border-neutral-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#FD9153]"
        />
        <input
          type="password"
          required
          minLength={6}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border border-neutral-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#FD9153]"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 rounded-md bg-[#FD9153] text-white text-sm font-medium hover:bg-[#FC5E03] transition-colors disabled:opacity-50"
        >
          {loading ? 'One moment…' : mode === 'login' ? 'Log in' : 'Sign up'}
        </button>
      </form>
      <button
        onClick={() => {
          setMode(mode === 'login' ? 'signup' : 'login');
          setError(null);
        }}
        className="text-xs text-neutral-500 hover:text-[#FD9153] mt-3 underline"
      >
        {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
      </button>
    </>
  );

  if (inline) {
    return <div className="relative bg-white rounded-lg shadow-xl w-full max-w-sm p-6">{body}</div>;
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="relative bg-white rounded-lg shadow-xl w-full max-w-sm p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {body}
        <button onClick={onClose} className="absolute top-3 right-4 text-neutral-400 hover:text-neutral-600 text-lg">
          ×
        </button>
      </div>
    </div>
  );
}
