'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, list, todayISO, fmtDate } from '@/lib/client';
import { useSession } from '@/components/SessionProvider';
import Link from 'next/link';
import { PageHeader, Card, Table, Badge, Alert, Spinner, Empty, Field, Select, Stat } from '@/components/ui';
import AttendanceRegister from '@/components/AttendanceRegister';

const STATUSES = [
  { value: 'present', label: 'Present', tone: 'green' },
  { value: 'absent', label: 'Absent', tone: 'red' },
  { value: 'late', label: 'Late', tone: 'amber' },
  { value: 'excused', label: 'Excused', tone: 'maroon' },
];

const toneFor = (s) => STATUSES.find((x) => x.value === s)?.tone || 'slate';

export default function AttendancePage() {
  const { user } = useSession();
  const canMark = user?.role === 'admin' || user?.role === 'teacher';
  const [mode, setMode] = useState('mark');
  if (!user) return <Spinner />;
  if (!canMark) return <ViewAttendance />;
  return (
    <>
      <PageHeader
        title="Attendance"
        subtitle={
          user.role === 'teacher'
            ? 'Pick one of your subjects and a date, tap each student’s status, then save. The office, students and parents see it straight away.'
            : 'Mark by subject, or a whole-day register for a batch. Teachers can mark their own subjects too.'
        }
      >
        <div className="flex gap-1.5">
          {[
            { key: 'mark', label: 'Mark register' },
            { key: 'history', label: 'History' },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setMode(t.key)}
              className={`rounded-lg px-3.5 py-2 text-sm font-semibold ${mode === t.key ? 'bg-maroon text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </PageHeader>
      {mode === 'mark' ? <MarkAttendance isAdmin={user.role === 'admin'} /> : <ViewAttendance embedded />}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Admin / teacher: choose subject (or batch) and mark                 */
/* ------------------------------------------------------------------ */

function MarkAttendance({ isAdmin }) {
  const [subjects, setSubjects] = useState(null);
  const [classes, setClasses] = useState([]);
  const [target, setTarget] = useState(''); // "s:<id>" subject | "c:<id>" whole-day batch
  const [students, setStudents] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const calls = [api.get('/api/subjects')];
    if (isAdmin) calls.push(list('classrooms', { sort: 'order name', limit: 100 }));
    Promise.all(calls)
      .then(([s, c]) => {
        setSubjects(s.items);
        if (c) setClasses(c.items);
        const fromUrl = new URLSearchParams(window.location.search).get('subject');
        const first = fromUrl || s.items[0]?._id;
        if (first) setTarget(`s:${first}`);
      })
      .catch((e) => setError(e.message));
  }, [isAdmin]);

  useEffect(() => {
    if (!target) return;
    setStudents(null);
    const [kind, id] = target.split(':');
    const q = kind === 's' ? { enrolledIn: id, role: 'student' } : { role: 'student', classRoom: id };
    list('users', { ...q, sort: 'name', limit: 1000 })
      .then((r) => setStudents(r.items))
      .catch((e) => setError(e.message));
  }, [target]);

  if (error) return <Alert onClose={() => setError('')}>{error}</Alert>;
  if (!subjects) return <Spinner />;
  if (!subjects.length && !classes.length) {
    return (
      <Card>
        <Empty title="No subjects assigned to you yet" hint="The office assigns subjects under Classes & Subjects." />
      </Card>
    );
  }

  const [kind, id] = target.split(':');
  const options = [
    ...subjects.map((s) => ({ value: `s:${s._id}`, label: `${s.name} — ${s.classRoom?.name || ''}` })),
    ...(isAdmin ? classes.map((c) => ({ value: `c:${c._id}`, label: `${c.name} — whole-day register` })) : []),
  ];

  return (
    <>
      <Card className="mb-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={isAdmin ? 'Subject or batch' : 'Your subject'}>
            <Select value={target} onChange={(e) => setTarget(e.target.value)} options={options} placeholder="Choose…" />
          </Field>
          {kind === 's' && id && (
            <div className="flex items-end">
              <Link href={`/subjects/${id}`} className="btn-ghost">
                Open subject page →
              </Link>
            </div>
          )}
        </div>
      </Card>
      {!students ? (
        <Spinner />
      ) : (
        <AttendanceRegister
          key={target}
          subjectId={kind === 's' ? id : undefined}
          classId={kind === 'c' ? id : undefined}
          students={students}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Teacher / student / parent: read-only history                       */
/* ------------------------------------------------------------------ */

function ViewAttendance({ embedded = false }) {
  const { user } = useSession();
  const staff = user?.role === 'admin' || user?.role === 'teacher';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    list('attendance', { sort: '-date', limit: 1000 })
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
      {!embedded && <PageHeader title="Attendance" subtitle="Attendance record, marked by the teachers and the office." />}
      <Alert onClose={() => setError('')}>{error}</Alert>

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Stat label="Attendance rate" value={summary.pct === null ? '—' : `${summary.pct}%`} />
        <Stat label="Sessions recorded" value={summary.total} />
        <Stat label={staff ? 'Present / late (all records)' : 'Present / late'} value={summary.present} />
      </div>

      <Card bodyClass="px-5 py-4">
        <Table
          columns={[
            { key: 'date', header: 'Date', render: (r) => fmtDate(r.date) },
            {
              key: 'student',
              header: 'Student',
              render: (r) =>
                r.student?._id ? (
                  <Link href={`/students/${r.student._id}`} className="font-medium text-slate-800 hover:text-maroon hover:underline">
                    {r.student.name}
                  </Link>
                ) : (
                  '—'
                ),
            },
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
