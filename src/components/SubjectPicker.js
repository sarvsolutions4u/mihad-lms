'use client';

import { useMemo } from 'react';

/** Choose which subjects a student is enrolled in (empty = whole batch). */
export default function SubjectPicker({ subjects, value, onChange, homeClassId }) {
  const groups = useMemo(() => {
    const g = new Map();
    for (const s of subjects) {
      const k = s.classRoom?.name || 'No batch';
      if (!g.has(k)) g.set(k, { home: String(s.classRoom?._id || s.classRoom) === String(homeClassId), items: [] });
      g.get(k).items.push(s);
    }
    return [...g.entries()].sort((a, b) => Number(b[1].home) - Number(a[1].home));
  }, [subjects, homeClassId]);

  const toggle = (id) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <div className="space-y-4">
      <label className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 ${!value.length ? 'border-maroon bg-maroon-50' : 'border-slate-200'}`}>
        <input type="radio" checked={!value.length} onChange={() => onChange([])} className="mt-0.5 text-maroon focus:ring-maroon" />
        <span className="text-sm">
          <span className="font-semibold text-slate-800">All subjects of the batch</span>
          <span className="block text-xs text-slate-500">Default. The student sees every subject in their class.</span>
        </span>
      </label>
      <p className="text-xs font-semibold text-slate-500">…or tick only the subjects this student takes:</p>
      {groups.map(([batch, g]) => (
        <div key={batch}>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            {batch}
            {g.home ? ' · their batch' : ''}
          </p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {g.items.map((s) => (
              <label
                key={s._id}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm ${
                  value.includes(String(s._id)) ? 'border-maroon bg-maroon-50 text-maroon' : 'border-slate-200 text-slate-700'
                }`}
              >
                <input
                  type="checkbox"
                  checked={value.includes(String(s._id))}
                  onChange={() => toggle(String(s._id))}
                  className="h-4 w-4 rounded border-slate-300 text-maroon focus:ring-maroon"
                />
                <span className="min-w-0 truncate">
                  {s.name}
                  {s.teacher?.name ? <span className="text-xs text-slate-400"> · {s.teacher.name}</span> : null}
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
