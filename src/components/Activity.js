'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client';
import { Badge, Spinner, Empty, Alert } from '@/components/ui';

const TZ = 'Asia/Dubai';

export const fmtWhen = (d) =>
  d ? new Date(d).toLocaleString('en-GB', { timeZone: TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
export const fmtClock = (d) => (d ? new Date(d).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }) : '');

export function fmtMins(m) {
  if (!m) return '0 m';
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? `${h} h${r ? ` ${r} m` : ''}` : `${r} m`;
}

export function ago(d) {
  if (!d) return 'Never';
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 90) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr${h === 1 ? '' : 's'} ago`;
  const days = Math.round(h / 24);
  if (days < 31) return `${days} day${days === 1 ? '' : 's'} ago`;
  return fmtWhen(d);
}

export function SeenStatus({ online, lastSeenAt }) {
  return online ? (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
      <span className="h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-emerald-100" /> Online now
    </span>
  ) : (
    <span className="text-xs text-slate-500">{lastSeenAt ? `Seen ${ago(lastSeenAt)}` : 'Not seen yet'}</span>
  );
}

export const EVENT = {
  login: { label: 'Signed in', tone: 'green' },
  logout: { label: 'Signed out', tone: 'slate' },
  upload: { label: 'Uploaded', tone: 'maroon' },
  post: { label: 'Posted', tone: 'gold' },
  submit: { label: 'Submitted', tone: 'amber' },
  download: { label: 'Opened file', tone: 'slate' },
};

/** One line of the log. */
export function EventRow({ e, showUser = false }) {
  const t = EVENT[e.type] || { label: e.type, tone: 'slate' };
  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-1 px-5 py-2.5">
      <span className="w-28 shrink-0 text-xs font-medium text-slate-500">{fmtWhen(e.at)}</span>
      <Badge tone={t.tone}>{t.label}</Badge>
      <span className="min-w-0 flex-1 text-sm text-slate-700">
        {showUser && e.user && (
          <>
            <span className="font-semibold text-slate-800">{e.user.name}</span>
            <span className="text-xs text-slate-400">
              {' '}
              · {e.user.role}
              {e.user.classRoom?.name ? ` · ${e.user.classRoom.name}` : ''}
            </span>
            {(e.name || e.subject) && <span className="text-slate-300"> — </span>}
          </>
        )}
        {e.name && <span className="break-all">{e.name}</span>}
        {(e.detail || e.subject?.name) && (
          <span className="text-xs text-slate-500">
            {' '}
            ({[e.detail, e.subject?.name].filter(Boolean).join(' · ')})
          </span>
        )}
      </span>
      {e.device && <span className="text-[11px] text-slate-400">{e.device}</span>}
    </li>
  );
}

/** Daily active minutes as small bars. */
export function ActiveBars({ series, today }) {
  const max = Math.max(30, ...series.map((s) => s.minutes));
  return (
    <div>
      <div className="flex h-28 items-end gap-[3px]" role="img" aria-label="Active minutes per day">
        {series.map((s) => (
          <div key={s.date} className="group relative flex h-full flex-1 items-end">
            <div
              className={`w-full rounded-t ${s.minutes ? (s.date === today ? 'bg-gold' : 'bg-maroon') : 'bg-slate-100'}`}
              style={{ height: `${s.minutes ? Math.max(6, (s.minutes / max) * 100) : 3}%` }}
            />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-[10px] text-white group-hover:block">
              {new Date(`${s.date}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })} · {fmtMins(s.minutes)}
              {s.first ? ` · ${fmtClock(s.first)}–${fmtClock(s.last)}` : ''}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-400">
        <span>{series[0] && new Date(`${series[0].date}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })}</span>
        <span>Today</span>
      </div>
    </div>
  );
}

/** Everything about one person's activity (used in the log page and on the student page). */
export function PersonActivity({ userId, compact = false }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    setData(null);
    api
      .get(`/api/activity/user/${userId}?days=${days}`)
      .then(setData)
      .catch((e) => setErr(e.message));
  }, [userId, days]);

  if (err) return <Alert onClose={() => setErr('')}>{err}</Alert>;
  if (!data) return <Spinner />;
  const { person, totals } = data;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {!compact && (
            <p className="text-sm font-bold text-slate-800">
              {person.role === 'student' ? (
                <Link href={`/students/${person._id}`} className="hover:text-maroon hover:underline">
                  {person.name}
                </Link>
              ) : (
                person.name
              )}{' '}
              <span className="text-xs font-normal text-slate-500">
                · {person.role}
                {person.classRoom?.name ? ` · ${person.classRoom.name}` : ''}
              </span>
            </p>
          )}
          <div className="mt-0.5 flex flex-wrap items-center gap-3">
            <SeenStatus online={person.online} lastSeenAt={person.lastSeenAt} />
            <span className="text-xs text-slate-500">Last sign-in: {person.lastLoginAt ? fmtWhen(person.lastLoginAt) : 'never'}</span>
          </div>
        </div>
        <div className="flex rounded-lg border border-slate-200 p-0.5">
          {[7, 30, 90].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setDays(n)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold ${days === n ? 'bg-maroon text-white' : 'text-slate-600'}`}
            >
              {n} days
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ['Active time', fmtMins(totals.minutes)],
          ['Days active', `${totals.activeDays} / ${data.days}`],
          ['Avg per day', fmtMins(totals.avgPerActiveDay)],
          ['Sign-ins', totals.logins],
          [person.role === 'student' ? 'Work submitted' : 'Uploads & posts', person.role === 'student' ? totals.submissions : totals.uploads],
          ['Files opened', totals.opened],
        ].map(([l, v]) => (
          <div key={l} className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{l}</p>
            <p className="text-lg font-bold text-maroon">{v}</p>
          </div>
        ))}
      </div>

      <ActiveBars series={data.series} today={data.today} />

      <div className="rounded-lg border border-slate-200">
        <p className="border-b border-slate-100 px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-500">Recent activity</p>
        {data.events.length ? (
          <ul className="max-h-[22rem] divide-y divide-slate-100 overflow-y-auto">
            {data.events.map((e) => (
              <EventRow key={e._id} e={e} />
            ))}
          </ul>
        ) : (
          <Empty title="No activity in this period" />
        )}
      </div>
    </div>
  );
}
