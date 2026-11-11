'use client';

import { useEffect, useState } from 'react';
import { list } from '@/lib/client';

/**
 * Tick the batches (subjects) a course is for. Students enrolled in a ticked
 * subject see the course; its trainer manages it. Trainers only see their own subjects.
 */
export default function SubjectPicker({ value = [], onChange, locked = [] }) {
  const [subjects, setSubjects] = useState(null);
  useEffect(() => {
    list('subjects', { limit: 500, sort: 'name' })
      .then((r) => setSubjects(r.items))
      .catch(() => setSubjects([]));
  }, []);
  if (!subjects) return <p className="text-xs text-slate-500">Loading batches…</p>;
  if (!subjects.length) return <p className="text-xs text-slate-500">No subjects yet — add a subject (e.g. “Spoken English”) to a batch first.</p>;
  const groups = {};
  for (const s of subjects) (groups[s.classRoom?.name || 'Other'] ||= []).push(s);
  const ids = value.map(String);
  return (
    <div className="max-h-64 space-y-3 overflow-y-auto rounded-lg border border-slate-200 p-3">
      {Object.entries(groups).map(([cls, subs]) => (
        <div key={cls}>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">{cls}</p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {subs.map((s) => (
              <label key={s._id} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={ids.includes(String(s._id))}
                  onChange={(e) => onChange(e.target.checked ? [...ids, String(s._id)] : ids.filter((x) => x !== String(s._id)))}
                />
                {s.name}
                {s.teacher?.name ? <span className="text-xs text-slate-400">· {s.teacher.name}</span> : null}
              </label>
            ))}
          </div>
        </div>
      ))}
      {locked.length > 0 && <p className="text-[11px] text-slate-500">Also linked to {locked.length} batch(es) of other trainers.</p>}
    </div>
  );
}
