'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, list, todayISO, fmtDate } from '@/lib/client';
import { useSession } from '@/components/SessionProvider';
import { useLookups } from '@/lib/useLookups';
import { PageHeader, Card, Table, Badge, Alert, Spinner, Empty, Field, Select, Stat } from '@/components/ui';

const STATUSES = [
  { value: 'present', label: 'Present', tone: 'green' },
  { value: 'absent', label: 'Absent', tone: 'red' },
  { value: 'late', label: 'Late', tone: 'amber' },
  { value: 'excused', label: 'Excused', tone: 'maroon' },
];

const toneFor = (s) => STATUSES.find((x) => x.value === s)?.tone || 'slate';

export default function AttendancePage() {
  const { user } = useSession();
  const isAdmin = user?.role === 'admin';
  return isAdmin ? <MarkAttendance /> : <ViewAttendance />;
}

/* ------------------------------------------------------------------ */
/* Admin: mark a whole class for a date                                */
/* ------------------------------------------------------------------ */

function MarkAttendance() {
  const { classes, subjects, loading: lookLoading } = useLookups();
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [students, setStudents] = useState([]);
  const [marks, setMarks] = useState({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!classId && classes.length) setClassId(classes[0]._id);
  }, [classes, classId]);

  async function load() {
    if (!classId) return;
    setLoading(true);
    try {
      const [s, a] = await Promise.all([
        list('users', { role: 'student', classRoom: classId, sort: 'name', limit: 500 }),
        list('attendance', { classRoom: classId, date, limit: 500 }),
      ]);
      setStudents(s.items);
      const existing = {};
      for (const row of a.items) {
        if (subjectId && String(row.subject?._id || row.subject || '') !== subjectId) continue;
        if (!subjectId && row.subject) continue;
        existing[String(row.student?._id || row.student)] = { status: row.status, remark: row.remark || '' };
      }
      setMarks(
        Object.fromEntries(
          s.items.map((st) => [String(st._id), existing[String(st._id)] || { status: 'present', remark: '' }])
        )
      );
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, date, subjectId]);

  async function save() {
    setBusy(true);
    setNotice('');
    try {
      await api.post('/api/attendance/bulk', {
        classRoom: classId,
        date,
        subject: subjectId || null,
        rows: students.map((s) => ({ student: s._id, ...marks[String(s._id)] })),
      });
      setNotice(`Attendance saved for ${fmtDate(date)}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const setAll = (status) =>
    setMarks(Object.fromEntries(students.map((s) => [String(s._id), { ...marks[String(s._id)], status }])));

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, late: 0, excused: 0 };
    Object.values(marks).forEach((m) => (c[m.status] = (c[m.status] || 0) + 1));
    return c;
  }, [marks]);

  if (lookLoading) return <Spinner />;

  return (
    <>
      <PageHeader title="Attendance" subtitle="Mark the register for a class and date. Parents and students see it straight away." />

      <Alert onClose={() => setError('')}>{error}</Alert>
      <Alert tone="success" onClose={() => setNotice('')}>
        {notice}
      </Alert>

      <Card className="mb-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Class">
            <Select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              options={classes.map((c) => ({ value: c._id, label: c.name }))}
              placeholder="Choose…"
            />
          </Field>
          <Field label="Date">
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Subject (optional)" hint="Leave blank for a whole-day register.">
            <Select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              options={subjects
                .filter((s) => String(s.classRoom?._id || s.classRoom) === String(classId))
                .map((s) => ({ value: s._id, label: s.name }))}
              placeholder="Whole day"
            />
          </Field>
          <div className="flex items-end gap-2">
            <button className="btn-ghost flex-1" onClick={() => setAll('present')} type="button">
              All present
            </button>
            <button className="btn-ghost flex-1" onClick={() => setAll('absent')} type="button">
              All absent
            </button>
          </div>
        </div>
      </Card>

      {loading ? (
        <Spinner />
      ) : !students.length ? (
        <Card>
          <Empty title="No students in this class" hint="Add students from the People page, or import them from Excel." />
        </Card>
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-4">
            {STATUSES.map((s) => (
              <Stat key={s.value} label={s.label} value={counts[s.value] || 0} />
            ))}
          </div>

          <Card bodyClass="px-5 py-4">
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="th">Student</th>
                    <th className="th">Status</th>
                    <th className="th">Remark</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {students.map((s) => {
                    const m = marks[String(s._id)] || { status: 'present', remark: '' };
                    return (
                      <tr key={s._id}>
                        <td className="td">
                          <p className="font-medium text-slate-800">{s.name}</p>
                          <p className="text-xs text-slate-400">{s.admissionNo || s.email}</p>
                        </td>
                        <td className="td">
                          <div className="flex flex-wrap gap-1.5">
                            {STATUSES.map((st) => (
                              <button
                                key={st.value}
                                type="button"
                                onClick={() => setMarks({ ...marks, [String(s._id)]: { ...m, status: st.value } })}
                                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                                  m.status === st.value
                                    ? 'bg-maroon text-white'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                              >
                                {st.label}
                              </button>
                            ))}
                          </div>
                        </td>
                        <td className="td">
                          <input
                            className="input py-1.5 text-xs"
                            placeholder="Optional"
                            value={m.remark}
                            onChange={(e) => setMarks({ ...marks, [String(s._id)]: { ...m, remark: e.target.value } })}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-5 flex justify-end">
              <button className="btn-primary" onClick={save} disabled={busy}>
                {busy ? 'Saving…' : 'Save attendance'}
              </button>
            </div>
          </Card>
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Teacher / student / parent: read-only history                       */
/* ------------------------------------------------------------------ */

function ViewAttendance() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    list('attendance', { sort: '-date', limit: 300 })
      .then((r) => setRows(r.items))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const summary = useMemo(() => {
    const total = rows.length;
    const present = rows.filter((r) => ['present', 'late'].includes(r.status)).length;
    return { total, present, pct: total ? Math.round((present / total) * 100) : null };
  }, [rows]);

  if (loading) return <Spinner />;

  return (
    <>
      <PageHeader title="Attendance" subtitle="Your attendance record, updated by the office." />
      <Alert onClose={() => setError('')}>{error}</Alert>

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Stat label="Attendance rate" value={summary.pct === null ? '—' : `${summary.pct}%`} />
        <Stat label="Sessions recorded" value={summary.total} />
        <Stat label="Present / late" value={summary.present} />
      </div>

      <Card bodyClass="px-5 py-4">
        <Table
          columns={[
            { key: 'date', header: 'Date', render: (r) => fmtDate(r.date) },
            { key: 'student', header: 'Student', render: (r) => r.student?.name || '—' },
            { key: 'classRoom', header: 'Class', render: (r) => r.classRoom?.name || '—' },
            { key: 'subject', header: 'Subject', render: (r) => r.subject?.name || 'Whole day' },
            { key: 'status', header: 'Status', render: (r) => <Badge tone={toneFor(r.status)}>{r.status}</Badge> },
            { key: 'remark', header: 'Remark', render: (r) => r.remark || '—' },
          ]}
          rows={rows}
          empty={<Empty title="No attendance recorded yet" />}
        />
      </Card>
    </>
  );
}
