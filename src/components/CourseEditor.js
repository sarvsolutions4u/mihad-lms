'use client';

import { WEEKDAYS } from '@/lib/programs';

const blankSlot = { day: 'Monday', startTime: '17:00', endTime: '18:00' };

/**
 * Short-term courses for one student: which course, total hours, start date and
 * the weekly class slots (day + start/end time).
 * value: [{ subject, totalHours, startDate, slots: [{ day, startTime, endTime }] }]
 */
export default function CourseEditor({ subjects, value = [], onChange }) {
  const set = (i, patch) => onChange(value.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const setSlot = (i, k, patch) => set(i, { slots: value[i].slots.map((s, j) => (j === k ? { ...s, ...patch } : s)) });

  const hoursPerWeek = (c) =>
    (c.slots || []).reduce((sum, s) => {
      const [a, b] = [s.startTime, s.endTime].map((t) => (t ? Number(t.split(':')[0]) * 60 + Number(t.split(':')[1]) : 0));
      return sum + Math.max(0, b - a) / 60;
    }, 0);

  return (
    <div className="space-y-3">
      {value.map((c, i) => {
        const perWeek = hoursPerWeek(c);
        const weeks = perWeek && c.totalHours ? Math.ceil(Number(c.totalHours) / perWeek) : 0;
        return (
          <div key={i} className="space-y-3 rounded-lg border border-gold-100 bg-gold-50/40 p-3">
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
              <label className="block">
                <span className="label">Course</span>
                <select className="input" value={c.subject || ''} onChange={(e) => set(i, { subject: e.target.value })} required>
                  <option value="">Choose…</option>
                  {subjects.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="label">Total hours</span>
                <input className="input" type="number" min="1" step="0.5" required value={c.totalHours ?? ''} onChange={(e) => set(i, { totalHours: e.target.value })} />
              </label>
              <label className="block">
                <span className="label">Starts on</span>
                <input className="input" type="date" value={c.startDate || ''} onChange={(e) => set(i, { startDate: e.target.value })} />
              </label>
              <div className="flex items-end">
                <button type="button" className="btn-ghost btn-sm" onClick={() => onChange(value.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </div>
            </div>

            <div>
              <span className="label">Weekly class slots</span>
              <div className="space-y-2">
                {(c.slots || []).map((s, k) => (
                  <div key={k} className="flex flex-wrap items-center gap-2">
                    <select className="input w-36 py-1.5" value={s.day} onChange={(e) => setSlot(i, k, { day: e.target.value })}>
                      {WEEKDAYS.map((d) => (
                        <option key={d}>{d}</option>
                      ))}
                    </select>
                    <input className="input w-32 py-1.5" type="time" value={s.startTime} onChange={(e) => setSlot(i, k, { startTime: e.target.value })} />
                    <span className="text-xs text-slate-400">to</span>
                    <input className="input w-32 py-1.5" type="time" value={s.endTime} onChange={(e) => setSlot(i, k, { endTime: e.target.value })} />
                    <button type="button" className="text-xs font-semibold text-red-700 hover:underline" onClick={() => set(i, { slots: c.slots.filter((_, j) => j !== k) })}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" className="mt-2 text-xs font-semibold text-maroon hover:underline" onClick={() => set(i, { slots: [...(c.slots || []), { ...blankSlot }] })}>
                + Add a day
              </button>
              {perWeek > 0 && (
                <p className="mt-2 text-[11px] text-slate-500">
                  {perWeek} hr{perWeek === 1 ? '' : 's'} a week{weeks ? ` · about ${weeks} week${weeks === 1 ? '' : 's'} to finish` : ''}. Class slots are created
                  automatically when you save.
                </p>
              )}
            </div>
          </div>
        );
      })}
      <button
        type="button"
        className="btn-ghost btn-sm"
        onClick={() => onChange([...value, { subject: subjects[0]?._id || '', totalHours: '', startDate: '', slots: [{ ...blankSlot }] }])}
      >
        + Add a course
      </button>
    </div>
  );
}
