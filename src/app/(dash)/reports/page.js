'use client';

import { useEffect, useState } from 'react';
import { api, list } from '@/lib/client';
import { useSession } from '@/components/SessionProvider';
import { PageHeader, Card, Table, Badge, Alert, Spinner, Empty, Field, Select, Stat, JoinButton } from '@/components/ui';

export default function ReportsPage() {
  const { user } = useSession();
  const [students, setStudents] = useState([]);
  const [studentId, setStudentId] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /* who can this person look at? */
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        if (user.role === 'student') {
          setStudents([{ _id: user.id || user._id, name: user.name }]);
          setStudentId(String(user.id || user._id));
        } else {
          const r = await list('users', { role: 'student', sort: 'name', limit: 1000 });
          setStudents(r.items);
          const fromUrl = new URLSearchParams(window.location.search).get('student');
          setStudentId(fromUrl || String(r.items[0]?._id || ''));
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  useEffect(() => {
    if (!studentId) return;
    setReport(null);
    api
      .get(`/api/report/${studentId}`)
      .then(setReport)
      .catch((e) => setError(e.message));
  }, [studentId]);

  if (loading) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Progress report"
        subtitle="Portions covered, notes given, exam results and attendance — subject by subject."
      >
        {students.length > 1 && (
          <Select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            options={students.map((s) => ({
              value: s._id,
              label: `${s.name}${s.classRoom?.name ? ` — ${s.classRoom.name}` : ''}`,
            }))}
            placeholder="Choose a student…"
          />
        )}
      </PageHeader>

      <Alert onClose={() => setError('')}>{error}</Alert>

      {!studentId ? (
        <Card>
          <Empty title="Choose a student to see their report" />
        </Card>
      ) : !report ? (
        <Spinner />
      ) : (
        <>
          <Card className="mb-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-maroon">{report.student.name}</h2>
                <p className="text-sm text-slate-500">
                  {report.student.classRoom?.name || 'No class'}
                  {report.student.admissionNo ? ` · ${report.student.admissionNo}` : ''}
                </p>
              </div>
              {report.student.classRoom?.onlineClassLink && (
                <JoinButton url={report.student.classRoom.onlineClassLink} label="Batch class link" />
              )}
            </div>
          </Card>

          <div className="mb-5 grid gap-4 sm:grid-cols-3">
            <Stat
              label="Attendance"
              value={report.overall.attendance === null ? '—' : `${report.overall.attendance}%`}
              hint={`${report.overall.sessions} sessions recorded`}
            />
            <Stat
              label="Portions completed"
              value={`${report.overall.plansCompleted}/${report.overall.plansTotal}`}
              hint="Across all subjects"
            />
            <Stat label="Subjects" value={report.bySubject.length} />
          </div>

          {!report.bySubject.length ? (
            <Card>
              <Empty title="No subjects set up for this class yet" />
            </Card>
          ) : (
            <div className="space-y-4">
              {report.bySubject.map((s) => (
                <Card key={s.subject._id} bodyClass="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="text-base font-bold text-maroon">{s.subject.name}</h3>
                      <p className="text-xs text-slate-500">Teacher: {s.subject.teacher}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge tone="maroon">
                        Portions {s.completedCount}/{s.plannedCount}
                      </Badge>
                      <Badge tone="slate">Notes given {s.notesGivenCount}</Badge>
                      <Badge tone="gold">Exams {s.examCount}</Badge>
                      {s.average !== null && <Badge tone={s.average >= 50 ? 'green' : 'red'}>Average {s.average}%</Badge>}
                    </div>
                  </div>

                  {s.plannedCount > 0 && (
                    <div className="mt-4">
                      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-gold"
                          style={{ width: `${Math.round((s.completedCount / s.plannedCount) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="mt-4">
                    <Table
                      columns={[
                        { key: 'title', header: 'Test' },
                        { key: 'weekOf', header: 'Week', render: (r) => r.weekOf || '—' },
                        {
                          key: 'score',
                          header: 'Score',
                          align: 'right',
                          render: (r) => (
                            <span className="font-semibold text-maroon">
                              {r.score}
                              <span className="text-slate-400">/{r.maxScore}</span>
                            </span>
                          ),
                        },
                        { key: 'remark', header: 'Remark', render: (r) => r.remark || '—' },
                      ]}
                      rows={s.marks}
                      rowKey={(r, i) => `${r.title}-${r.weekOf}-${r.score}`}
                      empty={<p className="py-4 text-center text-xs text-slate-400">No marks recorded for this subject yet.</p>}
                    />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
