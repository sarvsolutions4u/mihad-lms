'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, fmtDate } from '@/lib/client';
import { classLinkFor } from '@/lib/links';
import { useSession } from '@/components/SessionProvider';
import { PageHeader, Card, Table, Badge, Alert, Spinner, Empty, Stat, Tabs, FileLink, JoinButton } from '@/components/ui';
import AttendanceRegister, { statusTone } from '@/components/AttendanceRegister';

const RES_LABEL = {
  note: 'Notes', pdf: 'PDF', doc: 'Document', ppt: 'Presentation', paper: 'Question paper',
  video: 'Video', link: 'Link', image: 'Image', other: 'Other',
};

export default function SubjectPage() {
  const { id } = useParams();
  const { user } = useSession();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await api.get(`/api/subjects/${id}`));
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (data && !tab) setTab(data.canManage ? 'students' : 'overview');
  }, [data, tab]);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <Spinner />;

  const { subject, canManage } = data;
  const link = classLinkFor({ subject, classRoom: subject.classRoom });

  const tabs = canManage
    ? [
        { key: 'students', label: 'Students', count: data.students.length },
        { key: 'attendance', label: 'Attendance' },
        { key: 'plans', label: 'Lesson plans', count: data.plans.length },
        { key: 'tasks', label: 'Assignments', count: data.tasks.length },
        { key: 'resources', label: 'Notes & papers', count: data.resources.length },
      ]
    : [
        { key: 'overview', label: 'My progress' },
        { key: 'plans', label: 'Lesson plans', count: data.plans.length },
        { key: 'tasks', label: 'Assignments', count: data.tasks.length },
        { key: 'resources', label: 'Notes & papers', count: data.resources.length },
      ];

  return (
    <>
      <Link href="/subjects" className="mb-3 inline-block text-xs font-semibold text-slate-500 hover:text-maroon">
        ← All subjects
      </Link>
      <PageHeader
        title={subject.name}
        subtitle={[subject.classRoom?.name, subject.teacher?.name ? `Teacher: ${subject.teacher.name}` : 'No teacher assigned', subject.code]
          .filter(Boolean)
          .join(' · ')}
      >
        {link ? <JoinButton url={link} size="md" /> : <Badge tone="amber">No class link set</Badge>}
        {user?.role === 'admin' && (
          <Link href="/classes" className="btn-ghost">
            Edit subject
          </Link>
        )}
      </PageHeader>

      {!!data.slots?.length && (
        <div className="mb-5 flex flex-wrap gap-2">
          {data.slots.map((s) => (
            <Badge key={s._id}>
              {s.day} {s.startTime}–{s.endTime}
              {s.room ? ` · ${s.room}` : ''}
            </Badge>
          ))}
        </div>
      )}

      {canManage && (
        <div className="mb-5 grid gap-4 sm:grid-cols-4">
          <Stat label="Students enrolled" value={data.stats.students} />
          <Stat label="Open assignments" value={data.stats.openTasks} />
          <Stat label="Portions completed" value={`${data.stats.plansDone}/${data.stats.plans}`} />
          <Stat
            label="Avg attendance"
            value={(() => {
              const withAtt = data.students.filter((s) => s.attendance);
              if (!withAtt.length) return '—';
              const p = withAtt.reduce((a, s) => a + s.attendance.present, 0);
              const t = withAtt.reduce((a, s) => a + s.attendance.total, 0);
              return `${Math.round((p / t) * 100)}%`;
            })()}
          />
        </div>
      )}

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'students' && <StudentsTab students={data.students} isAdmin={user?.role === 'admin'} />}
      {tab === 'attendance' && <AttendanceRegister subjectId={subject._id} students={data.students} onSaved={load} />}
      {tab === 'overview' && <ProgressTab data={data} />}
      {tab === 'plans' && <PlansTab plans={data.plans} canManage={canManage} subjectId={subject._id} />}
      {tab === 'tasks' && <TasksTab data={data} canManage={canManage} />}
      {tab === 'resources' && <ResourcesTab resources={data.resources} canManage={canManage} subjectId={subject._id} />}
    </>
  );
}

/* ------------------------------------------------------------------ */

function StudentsTab({ students, isAdmin }) {
  return (
    <Card bodyClass="px-5 py-4">
      <Table
        columns={[
          {
            key: 'name',
            header: 'Student',
            render: (s) => (
              <Link href={`/students/${s._id}`} className="group block">
                <span className="font-semibold text-slate-800 group-hover:text-maroon group-hover:underline">{s.name}</span>
                <span className="block text-xs text-slate-400">{s.admissionNo || s.email}</span>
              </Link>
            ),
          },
          { key: 'classRoom', header: 'Batch', render: (s) => s.classRoom?.name || '—' },
          { key: 'phone', header: 'Phone', render: (s) => s.phone || '—' },
          {
            key: 'att',
            header: 'Attendance',
            render: (s) =>
              s.attendance ? (
                <Badge tone={s.attendance.pct >= 85 ? 'green' : s.attendance.pct >= 70 ? 'amber' : 'red'}>
                  {s.attendance.pct}% · {s.attendance.present}/{s.attendance.total}
                </Badge>
              ) : (
                <span className="text-xs text-slate-400">Not marked yet</span>
              ),
          },
          {
            key: 'last',
            header: 'Last session',
            render: (s) =>
              s.attendance ? (
                <span className="text-xs">
                  <Badge tone={statusTone(s.attendance.last)}>{s.attendance.last}</Badge>{' '}
                  <span className="text-slate-400">{fmtDate(s.attendance.lastDate)}</span>
                </span>
              ) : (
                '—'
              ),
          },
          ...(isAdmin
            ? [{ key: 'enrol', header: 'Enrolment', render: (s) => (s.enrolment === 'chosen' ? <Badge tone="maroon">Chosen subjects</Badge> : <Badge>Whole batch</Badge>) }]
            : []),
          {
            key: 'open',
            header: '',
            align: 'right',
            render: (s) => (
              <Link href={`/students/${s._id}`} className="btn-ghost btn-sm">
                Details
              </Link>
            ),
          },
        ]}
        rows={students}
        empty={<Empty title="No students enrolled yet" hint={isAdmin ? 'Enrol students from People → Edit → Subjects, or from a student’s page.' : 'The office enrols students into subjects.'} />}
      />
    </Card>
  );
}

function ProgressTab({ data }) {
  const att = data.attendance || [];
  const present = att.filter((a) => ['present', 'late'].includes(a.status)).length;
  const multi = (data.learners || []).length > 1;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Attendance in this subject" bodyClass="px-5 py-4">
        <p className="mb-3 text-2xl font-bold text-maroon">
          {att.length ? `${Math.round((present / att.length) * 100)}%` : '—'}
          <span className="ml-2 text-sm font-medium text-slate-500">
            {att.length ? `${present} of ${att.length} sessions` : 'No sessions recorded yet'}
          </span>
        </p>
        <Table
          columns={[
            { key: 'date', header: 'Date', render: (r) => fmtDate(r.date) },
            ...(multi ? [{ key: 'student', header: 'Student', render: (r) => r.student?.name }] : []),
            { key: 'status', header: 'Status', render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
            { key: 'remark', header: 'Remark', render: (r) => r.remark || '—' },
          ]}
          rows={att}
          empty={<Empty title="No attendance recorded yet" />}
        />
      </Card>
      <Card title="Marks" bodyClass="px-5 py-4">
        <Table
          columns={[
            { key: 'examTitle', header: 'Test', render: (m) => m.examTitle || 'Test' },
            ...(multi ? [{ key: 'student', header: 'Student', render: (m) => m.student?.name }] : []),
            { key: 'date', header: 'Date', render: (m) => fmtDate(m.date) },
            { key: 'score', header: 'Score', align: 'right', render: (m) => <span className="font-semibold text-maroon">{m.score} / {m.maxScore}</span> },
          ]}
          rows={data.marks || []}
          empty={<Empty title="No marks yet" />}
        />
      </Card>
    </div>
  );
}

function PlansTab({ plans, canManage, subjectId }) {
  return (
    <>
      {canManage && (
        <div className="mb-4 flex justify-end">
          <Link href={`/lesson-plans?subject=${subjectId}`} className="btn-primary">
            Open lesson planner
          </Link>
        </div>
      )}
      {!plans.length ? (
        <Card>
          <Empty title="No lesson plans yet" />
        </Card>
      ) : (
        <div className="space-y-3">
          {plans.map((p) => (
            <Card key={p._id} bodyClass="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold text-maroon">{p.title}</h3>
                <Badge>Week of {fmtDate(p.weekOf)}</Badge>
                {p.portionCompleted ? <Badge tone="green">Portion done</Badge> : <Badge tone="amber">In progress</Badge>}
                {p.notesGiven && <Badge tone="maroon">Notes given</Badge>}
                {p.examDone && <Badge tone="gold">Exam done</Badge>}
              </div>
              {p.portion && <p className="mt-2 text-sm text-slate-600">{p.portion}</p>}
              {p.teacherRemark && <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{p.teacherRemark}</p>}
              {!!p.attachments?.length && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {p.attachments.map((a, i) => (
                    <FileLink key={i} url={a.url} name={a.name} size={a.size} />
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function TasksTab({ data, canManage }) {
  const mine = (taskId) => (data.submissions || []).filter((s) => String(s.task) === String(taskId));
  return (
    <>
      <div className="mb-4 flex justify-end">
        <Link href={`/assignments?subject=${data.subject._id}`} className={canManage ? 'btn-primary' : 'btn-ghost'}>
          {canManage ? 'Manage assignments & submissions' : 'Open assignments to submit work'}
        </Link>
      </div>
      {!data.tasks.length ? (
        <Card>
          <Empty title="No assignments yet" />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.tasks.map((t) => {
            const overdue = t.deadline && t.deadline < data.today;
            const subs = mine(t._id);
            return (
              <Card key={t._id} bodyClass="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Badge tone={t.type === 'worksheet' ? 'maroon' : 'gold'}>{t.type}</Badge>
                    <h3 className="mt-1.5 text-sm font-bold text-maroon">{t.title}</h3>
                    {t.description && <p className="mt-1 line-clamp-3 text-xs text-slate-600">{t.description}</p>}
                  </div>
                  {t.deadline && (
                    <span className={`shrink-0 rounded-lg px-2.5 py-1.5 text-center text-xs font-semibold ${overdue ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-maroon'}`}>
                      {overdue ? 'Closed' : 'Due'} {fmtDate(t.deadline)}
                    </span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {t.attachmentUrl && <FileLink url={t.attachmentUrl} name={t.attachmentName || 'Attachment'} />}
                  {canManage && <Badge tone={t.submissionCount ? 'green' : 'slate'}>{t.submissionCount} submitted</Badge>}
                  {!canManage && (subs.length ? <Badge tone="green">Submitted</Badge> : <Badge tone={overdue ? 'red' : 'amber'}>Not submitted</Badge>)}
                  {!canManage && subs[0]?.score !== undefined && subs[0]?.score !== null && (
                    <Badge tone="maroon">
                      Score {subs[0].score}
                      {t.maxMarks ? ` / ${t.maxMarks}` : ''}
                    </Badge>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

function ResourcesTab({ resources, canManage, subjectId }) {
  return (
    <>
      {canManage && (
        <div className="mb-4 flex justify-end">
          <Link href={`/resources?subject=${subjectId}&new=1`} className="btn-primary">
            Upload notes / paper
          </Link>
        </div>
      )}
      {!resources.length ? (
        <Card>
          <Empty title="No notes or papers yet" />
        </Card>
      ) : (
        <Card bodyClass="px-5 py-4">
          <Table
            columns={[
              {
                key: 'title',
                header: 'Title',
                render: (r) => (
                  <div>
                    <p className="font-semibold text-slate-800">{r.title}</p>
                    {r.description && <p className="text-xs text-slate-500">{r.description}</p>}
                  </div>
                ),
              },
              { key: 'type', header: 'Type', render: (r) => <Badge tone="maroon">{RES_LABEL[r.type] || r.type}</Badge> },
              { key: 'by', header: 'Added', render: (r) => <span className="text-xs text-slate-500">{fmtDate(r.createdAt)}{r.uploadedBy?.name ? ` · ${r.uploadedBy.name}` : ''}</span> },
              { key: 'file', header: 'File', render: (r) => (r.url ? <FileLink url={r.url} name={r.fileName || 'Open'} /> : '—') },
            ]}
            rows={resources}
          />
        </Card>
      )}
    </>
  );
}
