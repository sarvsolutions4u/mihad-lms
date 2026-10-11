'use client';

import { useEffect, useState } from 'react';
import { list, create, update, remove, fmtDate, todayISO } from '@/lib/client';
import { useSession } from '@/components/SessionProvider';
import { useLookups } from '@/lib/useLookups';
import {
  PageHeader, Card, Modal, Field, Select, Badge, Alert, Spinner, Empty, Confirm, FileOrLink,
} from '@/components/ui';

const blank = { classRoom: '', subject: '', type: 'assignment', title: '', description: '', deadline: '', maxMarks: 0, attachmentUrl: '', attachmentName: '' };

export default function AssignmentsPage() {
  const { user } = useSession();
  const canEdit = user?.role === 'admin' || user?.role === 'teacher';
  const isStudent = user?.role === 'student';
  const { classes, subjects, loading: lookLoading } = useLookups();

  const [tab, setTab] = useState('');
  const [classId, setClassId] = useState('');
  const [rows, setRows] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [submitFor, setSubmitFor] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const calls = [
        list('tasks', { type: tab || undefined, classRoom: classId || undefined, sort: 'deadline', limit: 300 }),
      ];
      if (isStudent) calls.push(list('submissions', { limit: 300 }));
      const res = await Promise.all(calls);
      setRows(res[0].items);
      if (isStudent) setSubmissions(res[1].items);
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
  }, [tab, classId]);

  async function save(e) {
    e.preventDefault();
    try {
      const { _id, ...body } = form;
      body.maxMarks = Number(body.maxMarks) || 0;
      if (_id) await update('tasks', _id, body);
      else await create('tasks', body);
      setForm(null);
      setNotice('Saved');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const today = todayISO();
  const mySubmission = (taskId) => submissions.find((s) => String(s.task?._id || s.task) === String(taskId));

  if (lookLoading) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Assignments & worksheets"
        subtitle={canEdit ? 'Give each item a description and a deadline — students see both.' : 'Everything set for your class, with its deadline.'}
      >
        <Select
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          options={classes.map((c) => ({ value: c._id, label: c.name }))}
          placeholder="All classes"
        />
        {canEdit && (
          <button className="btn-primary" onClick={() => setForm({ ...blank, classRoom: classId })}>
            Add item
          </button>
        )}
      </PageHeader>

      <Alert onClose={() => setError('')}>{error}</Alert>
      <Alert tone="success" onClose={() => setNotice('')}>
        {notice}
      </Alert>

      <div className="mb-4 flex gap-1.5">
        {[
          { key: '', label: 'All' },
          { key: 'assignment', label: 'Assignments' },
          { key: 'worksheet', label: 'Worksheets' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${
              tab === t.key ? 'bg-maroon text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : !rows.length ? (
        <Card>
          <Empty title="Nothing here yet" hint={canEdit ? 'Add the first assignment or worksheet.' : undefined} />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((t) => {
            const overdue = t.deadline && t.deadline < today;
            const sub = isStudent ? mySubmission(t._id) : null;
            return (
              <Card key={t._id} bodyClass="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <Badge tone={t.type === 'worksheet' ? 'maroon' : 'gold'}>{t.type}</Badge>
                      <Badge>{t.subject?.name}</Badge>
                      <Badge>{t.classRoom?.name}</Badge>
                    </div>
                    <h3 className="text-base font-bold text-maroon">{t.title}</h3>
                    {t.description && <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{t.description}</p>}
                  </div>
                  {t.deadline && (
                    <div className={`shrink-0 rounded-lg px-3 py-2 text-center ${overdue ? 'bg-red-50' : 'bg-slate-50'}`}>
                      <p className={`text-[10px] font-bold uppercase ${overdue ? 'text-red-600' : 'text-slate-400'}`}>
                        {overdue ? 'Closed' : 'Due'}
                      </p>
                      <p className="text-xs font-semibold text-maroon">{fmtDate(t.deadline)}</p>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3.5">
                  {t.attachmentUrl && (
                    <a href={t.attachmentUrl} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">
                      Open {t.attachmentName || 'attachment'}
                    </a>
                  )}
                  {t.maxMarks > 0 && <span className="text-xs text-slate-400">Out of {t.maxMarks}</span>}

                  {isStudent && (
                    <button className={sub ? 'btn-ghost btn-sm' : 'btn-gold btn-sm'} onClick={() => setSubmitFor({ task: t, existing: sub })}>
                      {sub ? 'Update submission' : 'Submit work'}
                    </button>
                  )}
                  {sub && <Badge tone="green">Submitted {fmtDate(sub.submittedAt)}</Badge>}

                  {canEdit && (
                    <div className="ml-auto flex gap-2">
                      <button
                        className="btn-ghost btn-sm"
                        onClick={() =>
                          setForm({ ...t, classRoom: t.classRoom?._id || t.classRoom, subject: t.subject?._id || t.subject })
                        }
                      >
                        Edit
                      </button>
                      <button
                        className="btn-danger btn-sm"
                        onClick={() => setConfirm({ message: `Delete "${t.title}"?`, run: () => remove('tasks', t._id) })}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ---- task form ---- */}
      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?._id ? 'Edit item' : 'Add assignment or worksheet'}
        wide
        footer={
          <>
            <button className="btn-ghost" onClick={() => setForm(null)}>
              Cancel
            </button>
            <button className="btn-primary" form="task-form">
              Save
            </button>
          </>
        }
      >
        {form && (
          <form id="task-form" onSubmit={save} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
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
              <Field label="Type">
                <Select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  options={[
                    { value: 'assignment', label: 'Assignment' },
                    { value: 'worksheet', label: 'Worksheet' },
                  ]}
                  placeholder=""
                />
              </Field>
            </div>

            <Field label="Title">
              <input className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>

            <Field label="Description / instructions">
              <textarea
                className="input min-h-[100px]"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Deadline">
                <input
                  className="input"
                  type="date"
                  value={form.deadline || ''}
                  onChange={(e) => setForm({ ...form, deadline: e.target.value })}
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

            <FileOrLink
              name="Attachment (pdf, doc, ppt, image or link)"
              value={form.attachmentUrl}
              onChange={(url, fileName) => setForm({ ...form, attachmentUrl: url, attachmentName: fileName || form.attachmentName })}
            />
          </form>
        )}
      </Modal>

      <SubmitModal
        state={submitFor}
        onClose={() => setSubmitFor(null)}
        onSaved={() => {
          setSubmitFor(null);
          setNotice('Submission saved');
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

function SubmitModal({ state, onClose, onSaved, onError }) {
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setUrl(state?.existing?.url || '');
    setNote(state?.existing?.note || '');
  }, [state]);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      if (state.existing) await update('submissions', state.existing._id, { url, note, submittedAt: new Date() });
      else await create('submissions', { task: state.task._id, url, note });
      onSaved();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={!!state}
      onClose={onClose}
      title={state ? `Submit — ${state.task.title}` : ''}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" form="submit-form" disabled={busy}>
            {busy ? 'Saving…' : 'Submit'}
          </button>
        </>
      }
    >
      {state && (
        <form id="submit-form" onSubmit={save} className="space-y-4">
          <FileOrLink name="Your work (file or link)" value={url} onChange={(u) => setUrl(u)} />
          <Field label="Note for your teacher">
            <textarea className="input min-h-[80px]" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </form>
      )}
    </Modal>
  );
}
