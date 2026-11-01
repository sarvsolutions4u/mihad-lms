'use client';

import { fmtDate } from '@/lib/client';
import { fmtRange } from '@/lib/programs';

/** Hours used / left on one short-term course, with the next class and the weekly slots. */
export default function CourseProgress({ course: c, showName = true }) {
  if (!c) return null;
  const done = c.leftHours <= 0 && c.totalHours > 0;
  return (
    <div className="rounded-xl border border-gold-100 bg-gold-50/40 p-4">
      {showName && <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">{c.subjectName}</p>}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <p className="text-2xl font-bold text-maroon">
          {c.leftHours} hr{c.leftHours === 1 ? '' : 's'} <span className="text-sm font-medium text-slate-500">left of {c.totalHours}</span>
        </p>
        <p className="text-xs text-slate-500">
          {c.usedHours} hr{c.usedHours === 1 ? "" : "s"} done · {c.attended} class{c.attended === 1 ? '' : 'es'} attended{c.missed ? ` · ${c.missed} missed` : ''}
        </p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
        <div className={`h-full rounded-full ${done ? 'bg-emerald-500' : 'bg-maroon'}`} style={{ width: `${c.pct}%` }} />
      </div>
      <div className="mt-3 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
        <p>
          <span className="font-semibold text-slate-700">Next class: </span>
          {c.nextSession ? `${fmtDate(c.nextSession.date)}${c.nextSession.startTime ? ` · ${fmtRange(c.nextSession.startTime, c.nextSession.endTime)}` : ''}` : done ? 'Course complete' : 'Not scheduled'}
        </p>
        <p>
          <span className="font-semibold text-slate-700">Planned until: </span>
          {c.lastPlanned ? fmtDate(c.lastPlanned) : '—'}
        </p>
        {!!c.slots?.length && (
          <p className="sm:col-span-2">
            <span className="font-semibold text-slate-700">Weekly slots: </span>
            {c.slots.map((s) => `${s.day.slice(0, 3)} ${fmtRange(s.startTime, s.endTime)}`).join(' · ')}
          </p>
        )}
      </div>
    </div>
  );
}
