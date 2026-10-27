'use client';

import Link from 'next/link';
import { JoinButton } from '@/components/ui';

/** A clickable subject tile — the whole card opens the subject page. */
export default function SubjectCard({ s, link }) {
  const manage = s.studentCount !== null && s.studentCount !== undefined;
  return (
    <div className="card group relative flex flex-col p-5 transition-shadow hover:shadow-lg">
      <Link href={`/subjects/${s._id}`} className="absolute inset-0 rounded-xl" aria-label={`Open ${s.name}`} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold text-maroon group-hover:underline">{s.name}</h3>
          <p className="truncate text-xs text-slate-500">
            {s.classRoom?.name}
            {s.teacher?.name ? ` · ${s.teacher.name}` : ''}
          </p>
        </div>
        <span className="shrink-0 text-lg text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-maroon">→</span>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-cream-50 px-2 py-2">
          <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{manage ? 'Students' : 'Attendance'}</dt>
          <dd className="text-base font-bold text-maroon">
            {manage ? s.studentCount : s.attendance === null || s.attendance === undefined ? '—' : `${s.attendance}%`}
          </dd>
        </div>
        <div className="rounded-lg bg-cream-50 px-2 py-2">
          <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">This week</dt>
          <dd className="text-base font-bold text-maroon">
            {s.plansDone}/{s.plansThisWeek}
          </dd>
        </div>
        <div className="rounded-lg bg-cream-50 px-2 py-2">
          <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Open tasks</dt>
          <dd className="text-base font-bold text-maroon">{s.openTasks}</dd>
        </div>
      </dl>

      {link && (
        <div className="relative z-10 mt-4 self-start">
          <JoinButton url={link} />
        </div>
      )}
    </div>
  );
}
