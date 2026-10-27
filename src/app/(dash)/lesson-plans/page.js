'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, list, create, update, remove, fmtDate, todayISO, weekStartISO } from '@/lib/client';
import { useSession } from '@/components/SessionProvider';
import { useLookups } from '@/lib/useLookups';
import Link from 'next/link';
import {
  PageHeader, Card, Modal, Field, Select, Badge, Alert, Spinner, Empty, Confirm, Table, FileList, FileLink,
} from '@/components/ui';

const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const blank = (weekOf) => ({
  classRoom: '', subject: '', weekOf, title: '', portion: '', plannedDate: '',
  examTitle: '', examDate: '', maxMarks: 0, teacherRemark: '', attachments: [],
});

export default function LessonPlansPage() {
  const { user } = useSession();
  const canEdit = user?.role === 'admin' || user?.role === 'teacher';
  const { classes, subjects, loading: lookLoading } = useLookups();

  const [weekOf, setWeekOf] = useState(weekStartISO(todayISO()));
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');

  useEffect(() => {
    const sid = new URLSearchParams(window.location.search).get('subject');
    if (sid) setSubjectId(sid);
  }, []);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [marksFor, setMarksFor] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const r = await list('lessonplans', {
        weekOf,
        classRoom: classId || undefined,
        subject: subjectId || undefined,
        sort: 'plannedDate title',
        limit: 300,
      });
      setPlans(r.items);
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
  }, [weekOf, classId, subjectId]);

  const progress = useMemo(() => {
    const total = plans.length;
    const done = plans.filter((p) => p.portionCompleted).length;
    return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
  }, [plans]);

  async function toggle(plan, field) {
    try {
      const updated = await update('lessonplans', plan._id, { [field]: !plan[field] });
      setPlans((ps) => ps.map((p) => (p._id === plan._id ? { ...p, ...updated.item } : p)));
    } catch (e) {
      setError(e.message);
    }
  }

  async function save(e) {
    e.preventDefault();
    try {
      const { _id, ...body } = form;
      body.maxMarks = Number(body.maxMarks) || 0;
      if (_id) await update('lessonplans', _id, body);
      else await create('lessonplans', body);
      setForm(null);
      setNotice('Lesson plan saved');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (lookLoading) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Lesson plans"
        subtitle="The weekly plan, and what has actually been covered. Students and parents see the same view."
      >
        <Select
          value={classId}
          onChange={(e) => {
            setClassId(e.target.value);
            setSubjectId('');
          }}
          options={classes.map((c) => ({ value: c._id, label: c.name }))}
          placeholder="All classes"
        />
        <Select
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          options={subjects
            .filter((s) => !classId || String(s.classRoom?._id || s.classRoom) === String(classId))
            .filter((s) => user?.role !== 'teacher' || String(s.teacher?._id || s.teacher) === String(user?._id || user?.id))
            .map((s) => ({ value: s._id, label: `${s.name}${classId ? '' : ` — ${s.classRoom?.name || ''}`}` }))}
          placeholder="All subjects"
        />
        {canEdit && (
          <button
            className="btn-primary"
            onClick={() => {
              const subj = subjects.find((s) => s._id === subjectId);
              setForm({ ...blank(weekOf), classRoom: classId || subj?.classRoom?._id || subj?.classRoom || '', subject: subjectId });
            }}
          >
            Add plan
          </button>
        )}
      </PageHeader>

      <Alert onClose={() => setError('')}>{error}</Alert>
      <Alert tone="success" onClose={() => setNotice('')}>
        {notice}
      </Alert>

      {/* week strip */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3.5 shadow-card">
        <div className="flex items-center gap-2">
          <button className="btn-ghost btn-sm" onClick={() => setWeekOf(addDays(weekOf, -7))}>
            ← Previous
          </button>
          <button className="btn-ghost btn-sm" onClick={() => setWeekOf(weekStartISO(todayISO()))}>
            This week
          </button>
          <button className="btn-ghost btn-sm" onClick={() => setWeekOf(addDays(weekOf, 7))}>
            Next →
          </button>
        </div>
        <p className="text-sm font-semibold text-maroon">
          Week of {fmtDate(weekOf)} – {fmtDate(addDays(weekOf, 6))}
        </p>
        <div className="flex items-center gap-3">
          <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-gold" style={{ width: `${progress.pct}%` }} />
          </div>
          <span className="text-xs font-semibold text-slate-500">
            {progress.done}/{progress.total} portions completed
          </span>
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : !plans.length ? (
        <Card>
          <Empty
            title="No lesson plans for this week"
            hint={canEdit ? 'Add your plan, then tick each item off as the week goes on.' : 'Your teacher has not uploaded the plan for this week yet.'}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {plans.map((p) => (
            <Card key={p._id} bodyClass="p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-maroon">{p.title}</h3>
                    {p.subject?._id ? (
                      <Link href={`/subjects/${p.subject._id}`} className="chip bg-maroon-50 text-maroon hover:underline">
                        {p.subject.name}
                      </Link>
                    ) : (
                      <Badge tone="maroon">{p.subject?.name}</Badge>
                    )}
                    <Badge>{p.classRoom?.name}</Badge>
                    {p.plannedDate && <Badge tone="slate">{fmtDate(p.plannedDate)}</Badge>}
                  </div>
                  {p.portion && <p className="mt-2 text-sm leading-relaxed text-slate-600">{p.portion}</p>}
                  <p className="mt-2 text-xs text-slate-400">
                    {p.teacher?.name ? `Teacher: ${p.teacher.name}` : ''}
                    {p.examTitle ? ` · Exam: ${p.examTitle}${p.maxMarks ? ` (out of ${p.maxMarks})` : ''}` : ''}
                  </p>
                  {p.teacherRemark && (
                    <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{p.teacherRemark}</p>
                  )}
                  {!!p.attachments?.length && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {p.attachments.map((a, i) => (
                        <FileLink key={i} url={a.url} name={a.name} size={a.size} />
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 flex-col gap-3 lg:w-72">
                  <div className="space-y-2">
                    <Tick
                      label="Portion completed"
                      checked={p.portionCompleted}
                      disabled={!canEdit}
                      onChange={() => toggle(p, 'portionCompleted')}
                    />
                    <Tick
                      label="Notes given"
                      checked={p.notesGiven}
                      disabled={!canEdit}
                      onChange={() => toggle(p, 'notesGiven')}
                    />
                    <Tick
                      label="Exam done"
                      checked={p.examDone}
                      disabled={!canEdit}
                      onChange={() => toggle(p, 'examDone')}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {canEdit ? (
                      <>
                        <button className="btn-gold btn-sm flex-1" onClick={() => setMarksFor(p)}>
                          Enter marks
                        </button>
                        <button
                          className="btn-ghost btn-sm"
                          onClick={() =>
                            setForm({
                              ...p,
                              classRoom: p.classRoom?._id || p.classRoom,
                              subject: p.subject?._id || p.subject,
                              attachments: p.attachments || [],
                            })
                          }
                        >
                          Edit
                        </button>
                        <button
                          className="btn-danger btn-sm"
                          onClick={() => setConfirm({ message: `Delete "${p.title}"?`, run: () => remove('lessonplans', p._id) })}
                        >
                          Delete
                        </button>
                      </>
                    ) : (
                      <button className="btn-ghost btn-sm w-full" onClick={() => setMarksFor(p)}>
                        View marks
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ---- plan form ---- */}
      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?._id ? 'Edit lesson plan' : 'Add lesson plan'}
        wide
        footer={
          <>
            <button className="btn-ghost" onClick={() => setForm(null)}>
              Cancel
            </button>
            <button className="btn-primary" form="plan-form">
              Save
            </button>
          </>
        }
      >
        {form && (
          <form id="plan-form" onSubmit={save} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Class">
                <Select
                  required
                  value={form.classRoom}
                  onChange={(e) => setForm({ ...form, classRoom: e.target.value, subject: '' })}
                  options={classes.map((c) => ({ value: c._id, label: c.name }))}
                  placeholder="Choose…"
                />
              </Field>
              <Field label="Subject">
                <Select
                  required
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  options={subjects
                    .filter((s) => String(s.classRoom?._id || s.classRoom) === String(form.classRoom))
                    .map((s) => ({ value: s._id, label: s.name }))}
                  placeholder="Choose…"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Week beginning (Monday)">
                <input
                  className="input"
                  type="date"
                  required
                  value={form.weekOf}
                  onChange={(e) => setForm({ ...form, weekOf: weekStartISO(e.target.value) })}
                />
              </Field>
              <Field label="Planned date">
                <input
                  className="input"
                  type="date"
                  value={form.plannedDate || ''}
                  onChange={(e) => setForm({ ...form, plannedDate: e.target.value })}
                />
              </Field>
            </div>

            <Field label="Title">
              <input
                className="input"
                required
                placeholder="Chapter 4 — Quadratic equations"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </Field>

            <Field label="Portion to be covered">
              <textarea
                className="input min-h-[90px]"
                value={form.portion}
                onChange={(e) => setForm({ ...form, portion: e.target.value })}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Exam / test title">
                <input
                  className="input"
                  value={form.examTitle}
                  onChange={(e) => setForm({ ...form, examTitle: e.target.value })}
                />
              </Field>
              <Field label="Exam date">
                <input
                  className="input"
                  type="date"
                  value={form.examDate || ''}
                  onChange={(e) => setForm({ ...form, examDate: e.target.value })}
                />
              </Field>
              <Field label="Maximum marks">
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={form.maxMarks}
                  onChange={(e) => setForm({ ...form, maxMarks: e.target.value })}
                />
              </Field>
            </div>

            <Field label="Remark for students and parents">
              <input
                className="input"
                value={form.teacherRemark}
                onChange={(e) => setForm({ ...form, teacherRemark: e.target.value })}
              />
            </Field>

            <FileList
              name="Plan documents, notes or slides (optional)"
              value={form.attachments || []}
              onChange={(attachments) => setForm({ ...form, attachments })}
            />
          </form>
        )}
      </Modal>

      <MarksModal
        plan={marksFor}
        canEdit={canEdit}
        onClose={() => setMarksFor(null)}
        onSaved={() => {
          setNotice('Marks saved');
          setMarksFor(null);
          load();
        }}
        onError={setError}
      />

      <Confirm
        open={!!confirm}
        onClose={() => setConfirm(null)}
        message={confirm?.message}
        onConfirm={async () => {
          await confirm.run();
          setConfirm(null);
          load();
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */

function Tick({ label, checked, onChange, disabled }) {
  return (
    <label
      className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
        checked ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600'
      } ${disabled ? 'cursor-default' : 'cursor-pointer hover:border-slate-300'}`}
    >
      <input
        type="checkbox"
        checked={!!checked}
        disabled={disabled}
        onChange={onChange}
        className="h-4 w-4 rounded border-slate-300 text-maroon focus:ring-maroon"
      />
      <span className="font-medium">{label}</span>
    </label>
  );
}

function MarksModal({ plan, canEdit, onClose, onSaved, onError }) {
  const [students, setStudents] = useState([]);
  const [scores, setScores] = useState({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!plan) return;
    setLoading(true);
    Promise.all([
      list('users', { role: 'student', enrolledIn: plan.subject?._id || plan.subject, sort: 'name', limit: 1000 }),
      list('marks', { lessonPlan: plan._id, limit: 500 }),
    ])
      .then(([s, m]) => {
        setStudents(s.items);
        const existing = {};
        for (const row of m.items) {
          existing[String(row.student?._id || row.student)] = { score: row.score, remark: row.remark || '' };
        }
        setScores(
          Object.fromEntries(s.items.map((st) => [String(st._id), existing[String(st._id)] || { score: '', remark: '' }]))
        );
      })
      .catch((e) => onError(e.message))
      .finally(() => setLoading(false));
  }, [plan, onError]);

  async function save() {
    setBusy(true);
    try {
      await api.post('/api/marks/bulk', {
        lessonPlan: plan._id,
        rows: students.map((s) => ({ student: s._id, ...scores[String(s._id)] })),
      });
      onSaved();
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={!!plan}
      onClose={onClose}
      wide
      title={plan ? `${plan.examTitle || plan.title} — marks` : ''}
      footer={
        canEdit ? (
          <>
            <button className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-primary" onClick={save} disabled={busy || loading}>
              {busy ? 'Saving…' : 'Save marks'}
            </button>
          </>
        ) : (
          <button className="btn-ghost" onClick={onClose}>
            Close
          </button>
        )
      }
    >
      {loading ? (
        <Spinner />
      ) : !students.length ? (
        <Empty title="No students in this class" />
      ) : canEdit ? (
        <div className="space-y-2">
          <p className="mb-3 text-xs text-slate-500">
            Out of {plan?.maxMarks || 100}. Leave a box blank to skip that student.
          </p>
          {students.map((s) => {
            const v = scores[String(s._id)] || { score: '', remark: '' };
            return (
              <div key={s._id} className="grid grid-cols-12 items-center gap-2">
                <p className="col-span-5 truncate text-sm text-slate-700">{s.name}</p>
                <input
                  className="input col-span-2 py-1.5 text-center text-sm"
                  type="number"
                  min="0"
                  max={plan?.maxMarks || undefined}
                  value={v.score}
                  onChange={(e) => setScores({ ...scores, [String(s._id)]: { ...v, score: e.target.value } })}
                />
                <input
                  className="input col-span-5 py-1.5 text-xs"
                  placeholder="Remark"
                  value={v.remark}
                  onChange={(e) => setScores({ ...scores, [String(s._id)]: { ...v, remark: e.target.value } })}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <Table
          columns={[
            { key: 'name', header: 'Student', render: (r) => r.name },
            {
              key: 'score',
              header: 'Score',
              align: 'right',
              render: (r) => {
                const v = scores[String(r._id)];
                return v?.score === '' || v?.score === undefined ? '—' : `${v.score} / ${plan?.maxMarks || 100}`;
              },
            },
          ]}
          rows={students}
        />
      )}
    </Modal>
  );
}
