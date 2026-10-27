'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, list, update, remove, fmtDate } from '@/lib/client';
import { useSession } from '@/components/SessionProvider';
import {
  PageHeader, Card, Table, Badge, Alert, Spinner, Empty, Stat, Tabs, FileLink, Modal, Confirm, JoinButton,
} from '@/components/ui';
import { statusTone } from '@/components/AttendanceRegister';
import { classLinkFor } from '@/lib/links';
import SubjectPicker from '@/components/SubjectPicker';

const feeTone = (s) => ({ paid: 'green', overdue: 'red', partial: 'amber', pending: 'slate' }[s] || 'slate');
const money = (n, c = 'AED') => `${c} ${(Number(n) || 0).toLocaleString()}`;

export default function StudentPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useSession();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState('attendance');
  const [enrolOpen, setEnrolOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.get(`/api/students/${id}`));
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error && !data) return <Alert>{error}</Alert>;
  if (!data) return <Spinner />;

  const { student, subjects, attendanceSummary: att, fees, parents, canManage } = data;
  const feeOutstanding = (fees || []).reduce((s, f) => s + Math.max(0, (f.amount || 0) - (f.paidAmount || 0)), 0);

  const tabs = [
    { key: 'attendance', label: 'Attendance', count: att.total },
    { key: 'marks', label: 'Marks', count: data.marks.length },
    { key: 'work', label: 'Submitted work', count: data.submissions.length },
    ...(fees ? [{ key: 'fees', label: 'Fees', count: fees.length }] : []),
  ];

  return (
    <>
      <button onClick={() => router.back()} className="mb-3 inline-block text-xs font-semibold text-slate-500 hover:text-maroon">
        ← Back
      </button>
      <PageHeader
        title={student.name}
        subtitle={[student.admissionNo, student.classRoom?.name, student.active === false ? 'Account disabled' : null].filter(Boolean).join(' · ')}
      >
        <JoinButton url={classLinkFor({ classRoom: student.classRoom })} label="Batch class link" />
        {(user?.role === 'admin' || user?.role === 'parent') && (
          <Link href={`/reports?student=${student._id}`} className="btn-ghost">
            Progress report
          </Link>
        )}
        {canManage && (
          <>
            <button className="btn-ghost" onClick={() => setEnrolOpen(true)}>
              Change subjects
            </button>
            <button className="btn-danger" onClick={() => setConfirm(true)}>
              Remove student
            </button>
          </>
        )}
      </PageHeader>

      <Alert onClose={() => setError('')}>{error}</Alert>
      <Alert tone="success" onClose={() => setNotice('')}>
        {notice}
      </Alert>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Attendance" value={att.pct === null ? '—' : `${att.pct}%`} hint={att.total ? `${att.present} of ${att.total} sessions` : 'No sessions yet'} />
        <Stat label="Subjects" value={subjects.length} hint={student.enrolment === 'batch' ? 'All subjects of the batch' : 'Chosen subjects'} />
        <Stat label="Work submitted" value={data.submissions.length} />
        {fees ? (
          <Stat label="Fees outstanding" value={feeOutstanding ? money(feeOutstanding) : 'Nil'} hint={`${fees.filter((f) => f.status === 'overdue').length} overdue`} />
        ) : (
          <Stat label="Tests marked" value={data.marks.length} />
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5">
          <Card title="Details" bodyClass="px-5 py-4">
            <dl className="space-y-2.5 text-sm">
              <Row label="Email" value={student.email} />
              <Row label="Phone" value={student.phone || '—'} />
              <Row label="Batch" value={student.classRoom?.name || '—'} />
              <Row label="Admission no" value={student.admissionNo || '—'} />
              <Row label="Joined" value={fmtDate(student.createdAt)} />
              {canManage && <Row label="Last sign-in" value={student.lastLoginAt ? fmtDate(student.lastLoginAt) : 'Never'} />}
            </dl>
          </Card>

          {parents && (
            <Card title="Parents" bodyClass="px-5 py-4">
              {parents.length ? (
                <ul className="space-y-3">
                  {parents.map((p) => (
                    <li key={p._id} className="text-sm">
                      <p className="font-semibold text-slate-800">{p.name}</p>
                      <p className="text-xs text-slate-500">
                        {p.phone ? (
                          <a href={`tel:${p.phone}`} className="hover:text-maroon">
                            {p.phone}
                          </a>
                        ) : (
                          'No phone'
                        )}{' '}
                        · {p.email}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">No parent account linked.</p>
              )}
            </Card>
          )}

          <Card
            title="Subjects"
            action={canManage && <button className="text-xs font-semibold text-maroon hover:underline" onClick={() => setEnrolOpen(true)}>Change</button>}
            bodyClass="px-5 py-4"
          >
            {subjects.length ? (
              <ul className="space-y-2">
                {subjects.map((s) => {
                  const a = att.bySubject.find((b) => b.subject === String(s._id));
                  return (
                    <li key={s._id} className="flex items-center justify-between gap-3">
                      <Link href={`/subjects/${s._id}`} className="min-w-0 text-sm font-semibold text-maroon hover:underline">
                        <span className="block truncate">{s.name}</span>
                        <span className="block truncate text-xs font-normal text-slate-500">
                          {s.classRoom?.name}
                          {s.teacher?.name ? ` · ${s.teacher.name}` : ''}
                        </span>
                      </Link>
                      {a ? <Badge tone={a.pct >= 85 ? 'green' : a.pct >= 70 ? 'amber' : 'red'}>{a.pct}%</Badge> : <span className="text-xs text-slate-400">—</span>}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">Not enrolled in any subject.</p>
            )}
            {student.enrolment === 'batch' && subjects.length > 0 && (
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
                Enrolled in every subject of the batch. {canManage ? 'Use “Change” to pick specific subjects.' : ''}
              </p>
            )}
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Tabs tabs={tabs} value={tab} onChange={setTab} />

          {tab === 'attendance' && (
            <Card bodyClass="px-5 py-4">
              {!!att.bySubject.length && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {att.bySubject.map((b) => (
                    <Badge key={b.subject} tone={b.pct >= 85 ? 'green' : b.pct >= 70 ? 'amber' : 'red'}>
                      {b.name}: {b.pct}% ({b.present}/{b.total})
                    </Badge>
                  ))}
                </div>
              )}
              <Table
                columns={[
                  { key: 'date', header: 'Date', render: (r) => fmtDate(r.date) },
                  { key: 'subject', header: 'Subject', render: (r) => r.subject?.name || 'Whole day' },
                  { key: 'status', header: 'Status', render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
                  { key: 'remark', header: 'Remark', render: (r) => r.remark || '—' },
                ]}
                rows={data.attendance}
                empty={<Empty title="No attendance recorded yet" />}
              />
            </Card>
          )}

          {tab === 'marks' && (
            <Card bodyClass="px-5 py-4">
              <Table
                columns={[
                  { key: 'subject', header: 'Subject', render: (m) => m.subject?.name || '—' },
                  { key: 'examTitle', header: 'Test', render: (m) => m.examTitle || 'Test' },
                  { key: 'date', header: 'Date', render: (m) => fmtDate(m.date) },
                  {
                    key: 'score',
                    header: 'Score',
                    align: 'right',
                    render: (m) => (
                      <span className="font-semibold text-maroon">
                        {m.score} / {m.maxScore}
                        <span className="ml-1.5 text-xs font-normal text-slate-400">{m.maxScore ? Math.round((m.score / m.maxScore) * 100) : 0}%</span>
                      </span>
                    ),
                  },
                  { key: 'remark', header: 'Remark', render: (m) => m.remark || '—' },
                ]}
                rows={data.marks}
                empty={<Empty title="No marks yet" />}
              />
            </Card>
          )}

          {tab === 'work' && (
            <Card bodyClass="px-5 py-4">
              <Table
                columns={[
                  {
                    key: 'task',
                    header: 'Assignment',
                    render: (s) => (
                      <div>
                        <p className="font-semibold text-slate-800">{s.task?.title || '—'}</p>
                        <p className="text-xs text-slate-500">{s.task?.subject?.name}</p>
                      </div>
                    ),
                  },
                  {
                    key: 'when',
                    header: 'Submitted',
                    render: (s) => (
                      <span className="text-xs">
                        {fmtDate(s.submittedAt)}
                        {s.task?.deadline && String(s.submittedAt).slice(0, 10) > s.task.deadline && (
                          <Badge tone="red">Late</Badge>
                        )}
                      </span>
                    ),
                  },
                  { key: 'file', header: 'Work', render: (s) => (s.url ? <FileLink url={s.url} name={s.fileName || 'Open work'} /> : s.note ? <span className="text-xs text-slate-500">Note only</span> : '—') },
                  {
                    key: 'score',
                    header: 'Score',
                    align: 'right',
                    render: (s) => (s.score === undefined || s.score === null ? <span className="text-xs text-slate-400">Not graded</span> : `${s.score}${s.task?.maxMarks ? ` / ${s.task.maxMarks}` : ''}`),
                  },
                ]}
                rows={data.submissions}
                empty={<Empty title="No work submitted yet" />}
              />
            </Card>
          )}

          {tab === 'fees' && fees && (
            <Card
              bodyClass="px-5 py-4"
              title="Fee statement"
              action={
                <Link href={`/fees?student=${student._id}`} className="text-xs font-semibold text-maroon hover:underline">
                  {canManage ? 'Manage fees →' : 'Open fees →'}
                </Link>
              }
            >
              <Table
                columns={[
                  { key: 'title', header: 'Description' },
                  { key: 'amount', header: 'Amount', align: 'right', render: (f) => money(f.amount, f.currency) },
                  { key: 'paid', header: 'Paid', align: 'right', render: (f) => money(f.paidAmount, f.currency) },
                  { key: 'due', header: 'Due', render: (f) => fmtDate(f.dueDate) },
                  { key: 'status', header: 'Status', render: (f) => <Badge tone={feeTone(f.status)}>{f.status}</Badge> },
                  {
                    key: 'receipts',
                    header: 'Receipts',
                    render: (f) => {
                      const files = (f.payments || []).filter((p) => p.receipt?.url);
                      return files.length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {files.map((p, i) => (
                            <FileLink key={i} url={p.receipt.url} name={p.receipt.name || `Receipt ${p.receiptNo || i + 1}`} compact />
                          ))}
                        </div>
                      ) : (
                        '—'
                      );
                    },
                  },
                ]}
                rows={fees}
                empty={<Empty title="No fee records" />}
              />
            </Card>
          )}
        </div>
      </div>

      {canManage && (
        <EnrolModal
          open={enrolOpen}
          student={student}
          onClose={() => setEnrolOpen(false)}
          onSaved={() => {
            setEnrolOpen(false);
            setNotice('Subjects updated');
            load();
          }}
          onError={setError}
        />
      )}

      <Confirm
        open={confirm}
        onClose={() => setConfirm(false)}
        message={`Remove ${student.name}? Their account, attendance, marks, submitted work and fee records (with receipts) will be deleted permanently. To keep the records instead, disable the account from People → Edit.`}
        onConfirm={async () => {
          try {
            await remove('users', student._id);
            router.push('/people');
          } catch (e) {
            setError(e.message);
            setConfirm(false);
          }
        }}
      />
    </>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="truncate text-right font-medium text-slate-800">{value}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Choose which subjects a student is enrolled in                       */
/* ------------------------------------------------------------------ */

function EnrolModal({ open, student, onClose, onSaved, onError }) {
  const [subjects, setSubjects] = useState([]);
  const [value, setValue] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValue((student.subjects || []).map((s) => String(s._id || s)));
    list('subjects', { sort: 'name', limit: 500 })
      .then((r) => setSubjects(r.items))
      .catch((e) => onError(e.message));
  }, [open, student, onError]);

  async function save() {
    setBusy(true);
    try {
      await update('users', student._id, { subjects: value });
      onSaved();
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={`Subjects for ${student.name}`}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save subjects'}
          </button>
        </>
      }
    >
      <SubjectPicker subjects={subjects} value={value} onChange={setValue} homeClassId={student.classRoom?._id} />
    </Modal>
  );
}
