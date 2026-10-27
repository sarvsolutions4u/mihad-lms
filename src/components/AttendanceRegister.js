'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, list, todayISO, fmtDate } from '@/lib/client';
import { Card, Alert, Spinner, Empty, Badge } from '@/components/ui';

export const STATUSES = [
  { value: 'present', label: 'Present', short: 'P', on: 'bg-emerald-600 text-white', tone: 'green' },
  { value: 'absent', label: 'Absent', short: 'A', on: 'bg-red-600 text-white', tone: 'red' },
  { value: 'late', label: 'Late', short: 'L', on: 'bg-amber-500 text-white', tone: 'amber' },
  { value: 'excused', label: 'Excused', short: 'E', on: 'bg-slate-600 text-white', tone: 'slate' },
];
export const statusTone = (s) => STATUSES.find((x) => x.value === s)?.tone || 'slate';

/**
 * One-screen register: pick a date, tap a status per student, Save.
 * Works for a subject (teacher or admin) or a whole-day class register (admin).
 *
 * props: subjectId?, classId?, students [{_id,name,admissionNo}], onSaved?
 */
export default function AttendanceRegister({ subjectId, classId, students, onSaved }) {
  const [date, setDate] = useState(todayISO());
  const [marks, setMarks] = useState({});
  const [saved, setSaved] = useState(false); // a register already exists for this date
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [history, setHistory] = useState([]);

  const key = subjectId ? { subject: subjectId } : { classRoom: classId };

  async function loadDay(d = date) {
    if (!subjectId && !classId) return;
    setLoading(true);
    try {
      const r = await list('attendance', { ...key, date: d, limit: 1000 });
      const existing = {};
      for (const row of r.items) {
        if (!subjectId && row.subject) continue; // whole-day register only
        existing[String(row.student?._id || row.student)] = { status: row.status, remark: row.remark || '' };
      }
      setSaved(Object.keys(existing).length > 0);
      setMarks(Object.fromEntries(students.map((s) => [String(s._id), existing[String(s._id)] || { status: 'present', remark: '' }])));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory() {
    try {
      const r = await list('attendance', { ...key, sort: '-date', limit: 1000 });
      const byDate = {};
      for (const row of r.items) {
        if (!subjectId && row.subject) continue;
        byDate[row.date] ||= { date: row.date, present: 0, absent: 0, late: 0, excused: 0, total: 0 };
        byDate[row.date][row.status] += 1;
        byDate[row.date].total += 1;
      }
      setHistory(Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12));
    } catch {
      /* history is a nice-to-have */
    }
  }

  useEffect(() => {
    loadDay(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, subjectId, classId, students]);

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, classId]);

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, late: 0, excused: 0 };
    Object.values(marks).forEach((m) => (c[m.status] = (c[m.status] || 0) + 1));
    return c;
  }, [marks]);

  const setOne = (id, patch) => setMarks((m) => ({ ...m, [id]: { ...(m[id] || { status: 'present', remark: '' }), ...patch } }));
  const setAll = (status) => setMarks((m) => Object.fromEntries(students.map((s) => [String(s._id), { ...(m[String(s._id)] || {}), status }])));

  async function save() {
    setBusy(true);
    setNotice('');
    setError('');
    try {
      const res = await api.post('/api/attendance/bulk', {
        date,
        subject: subjectId || null,
        classRoom: classId || null,
        rows: students.map((s) => ({ student: s._id, ...marks[String(s._id)] })),
      });
      setNotice(`Attendance saved for ${fmtDate(date)} — ${res.saved} student${res.saved === 1 ? '' : 's'}.`);
      setSaved(true);
      loadHistory();
      onSaved?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!students.length) {
    return (
      <Card>
        <Empty title="No students to mark" hint="Students appear here once they are enrolled in this subject." />
      </Card>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <div className="xl:col-span-2">
        <Alert onClose={() => setError('')}>{error}</Alert>
        <Alert tone="success" onClose={() => setNotice('')}>
          {notice}
        </Alert>

        <Card bodyClass="p-0">
          {/* toolbar */}
          <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-5 py-4">
            <label className="block">
              <span className="label">Date</span>
              <input className="input py-1.5" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
            </label>
            <div className="flex gap-1.5">
              <button type="button" className="btn-ghost btn-sm" onClick={() => setAll('present')}>
                All present
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setAll('absent')}>
                All absent
              </button>
            </div>
            <div className="ml-auto flex flex-wrap gap-1.5 text-xs">
              {STATUSES.map((s) => (
                <Badge key={s.value} tone={s.tone}>
                  {s.label} {counts[s.value] || 0}
                </Badge>
              ))}
            </div>
          </div>

          {saved && !loading && (
            <p className="border-b border-slate-100 bg-emerald-50 px-5 py-2 text-xs font-medium text-emerald-800">
              A register is already saved for this date — change anything and save again to update it.
            </p>
          )}

          {loading ? (
            <Spinner />
          ) : (
            <ul className="divide-y divide-slate-100">
              {students.map((s) => {
                const id = String(s._id);
                const m = marks[id] || { status: 'present', remark: '' };
                return (
                  <li key={id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <Link href={`/students/${id}`} className="text-sm font-semibold text-slate-800 hover:text-maroon hover:underline">
                        {s.name}
                      </Link>
                      <p className="text-xs text-slate-400">{s.admissionNo || s.email || ''}</p>
                    </div>
                    <div className="flex gap-1" role="radiogroup" aria-label={`Attendance for ${s.name}`}>
                      {STATUSES.map((st) => (
                        <button
                          key={st.value}
                          type="button"
                          role="radio"
                          aria-checked={m.status === st.value}
                          title={st.label}
                          onClick={() => setOne(id, { status: st.value })}
                          className={`h-9 min-w-[2.25rem] rounded-lg px-2 text-xs font-bold transition-colors sm:min-w-[4.5rem] ${
                            m.status === st.value ? st.on : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          <span className="sm:hidden">{st.short}</span>
                          <span className="hidden sm:inline">{st.label}</span>
                        </button>
                      ))}
                    </div>
                    <input
                      className="input py-1.5 text-xs sm:w-40"
                      placeholder="Remark (optional)"
                      value={m.remark}
                      onChange={(e) => setOne(id, { remark: e.target.value })}
                    />
                  </li>
                );
              })}
            </ul>
          )}

          <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-slate-100 bg-white/95 px-5 py-3.5 backdrop-blur">
            <p className="text-xs text-slate-500">
              {students.length} student{students.length === 1 ? '' : 's'} · {fmtDate(date)}
            </p>
            <button className="btn-primary" onClick={save} disabled={busy || loading}>
              {busy ? 'Saving…' : saved ? 'Update attendance' : 'Save attendance'}
            </button>
          </div>
        </Card>
      </div>

      <Card title="Recent registers" bodyClass="">
        {history.length ? (
          <ul className="divide-y divide-slate-100">
            {history.map((h) => (
              <li key={h.date}>
                <button
                  type="button"
                  onClick={() => setDate(h.date)}
                  className={`flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left hover:bg-slate-50 ${h.date === date ? 'bg-maroon-50' : ''}`}
                >
                  <span className="text-sm font-medium text-slate-700">{fmtDate(h.date)}</span>
                  <span className="text-xs text-slate-500">
                    <span className="font-semibold text-emerald-700">{h.present + h.late}</span>/{h.total} present
                    {h.absent ? <span className="ml-1.5 font-semibold text-red-600">{h.absent} absent</span> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="No registers yet" hint="Saved registers appear here — click one to open it." />
        )}
      </Card>
    </div>
  );
}
