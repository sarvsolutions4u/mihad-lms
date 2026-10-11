'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';
import { Logo, Alert } from '@/components/ui';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/api/auth/login', { email, password });
      router.replace('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Left — brand panel */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-maroon via-maroon to-maroon-900 px-12 py-14 lg:flex lg:flex-col lg:justify-center">
        {/* arch motif from the Al Mihad mark */}
        <svg
          aria-hidden
          viewBox="0 0 400 520"
          className="pointer-events-none absolute -right-20 bottom-0 h-[40rem] w-auto"
        >
          <path d="M20 520V230C20 120 110 50 200 0c90 50 180 120 180 230v290" fill="none" stroke="rgba(201,162,39,.22)" strokeWidth="2" />
          <path d="M80 520V250c0-75 55-125 120-160 65 35 120 85 120 160v270" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="2" />
          <path d="M140 520V275c0-40 28-70 60-90 32 20 60 50 60 90v245" fill="none" stroke="rgba(255,255,255,.05)" strokeWidth="2" />
        </svg>
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gold" />

        <div className="relative max-w-lg">
          <div className="mb-10">
            <Logo />
          </div>
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.22em] text-gold">
            Learning Portal · Educate to Innovate
          </p>
          <h1 className="text-4xl font-bold leading-tight text-white xl:text-5xl">
            Every course, every learner, one clear view.
          </h1>
          <p className="mt-5 text-base leading-relaxed text-maroon-100/80">
            Course plans, attendance, marks, assignments, study material and parent
            updates for Al Mihad students and trainers—connected in one secure place.
          </p>

          <ul className="mt-10 space-y-3 text-sm text-maroon-100/80">
            {[
              'Trainers upload the weekly plan, then tick off each portion as it is covered',
              'Students and parents see attendance, marks and fee status anytime',
              'Batch announcements and class links reach exactly the right learners',
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Right — form */}
      <div className="flex items-center justify-center bg-cream-50 px-5 py-14">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo light={false} />
          </div>

          <h2 className="text-2xl font-bold text-maroon">Sign in</h2>
          <p className="mt-1.5 text-sm text-slate-500">
            Use the email address given to you by the Al Mihad office.
          </p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            <Alert onClose={() => setError('')}>{error}</Alert>

            <label className="block">
              <span className="label">Email</span>
              <input
                className="input"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@almihadtraining.com"
              />
            </label>

            <label className="block">
              <span className="label">Password</span>
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </label>

            <button className="btn-primary w-full py-2.5" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-slate-500">
            Forgotten your password? Please contact the administrator.
          </p>
          <p className="mt-2 text-center text-xs text-slate-400">
            Al Mihad Training Centre · Sahara Tower 2, Al Nahda, Sharjah
          </p>
        </div>
      </div>
    </div>
  );
}
