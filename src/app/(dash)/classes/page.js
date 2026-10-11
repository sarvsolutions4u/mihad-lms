'use client';

import { useEffect, useState } from 'react';
import { list, create, update, remove } from '@/lib/client';
import { PageHeader, Card, Table, Modal, Field, Select, Badge, Alert, Spinner, Confirm, Empty } from '@/components/ui';

const blankClass = { name: '', academicYear: '', onlineClassLink: '', description: '', order: 0 };
const blankSubject = { name: '', code: '', classRoom: '', teacher: '', onlineClassLink: '' };

export default function ClassesPage() {
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [classForm, setClassForm] = useState(null);
  const [subjectForm, setSubjectForm] = useState(null);
  const [confirm, setConfirm] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const [c, s, t] = await Promise.all([
        list('classrooms', { sort: 'order name', limit: 100 }),
        list('subjects', { sort: 'name', limit: 500 }),
        list('users', { role: 'teacher', sort: 'name', limit: 200 }),
      ]);
      setClasses(c.items);
      setSubjects(s.items);
      setTeachers(t.items);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function saveClass(e) {
    e.preventDefault();
    try {
      const { _id, ...body } = classForm;
      body.order = Number(body.order) || 0;
      if (_id) await update('classrooms', _id, body);
      else await create('classrooms', body);
      setClassForm(null);
      setNotice('Class saved');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveSubject(e) {
    e.preventDefault();
    try {
      const { _id, ...body } = subjectForm;
      if (!body.teacher) delete body.teacher;
      if (_id) await update('subjects', _id, body);
      else await create('subjects', body);
      setSubjectForm(null);
      setNotice('Subject saved');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Classes & Subjects"
        subtitle="Set up your three main classes, the subjects under each, and the fixed online class link."
      >
        <button className="btn-ghost" onClick={() => setSubjectForm({ ...blankSubject })}>
          Add subject
        </button>
        <button className="btn-primary" onClick={() => setClassForm({ ...blankClass })}>
          Add class
        </button>
      </PageHeader>

      <Alert onClose={() => setError('')}>{error}</Alert>
      <Alert tone="success" onClose={() => setNotice('')}>
        {notice}
      </Alert>

      {!classes.length ? (
        <Card>
          <Empty
            title="No classes yet"
            hint="Start by adding your batches (e.g. GED Preparation, IGCSE Grade 10, NIOS Senior Secondary) — then add the subjects under each."
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {classes.map((c) => {
            const subs = subjects.filter((s) => String(s.classRoom?._id || s.classRoom) === String(c._id));
            return (
              <Card
                key={c._id}
                title={c.name}
                bodyClass=""
                action={
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{subs.length} subjects</span>
                    <button className="btn-ghost btn-sm" onClick={() => setClassForm(c)}>
                      Edit
                    </button>
                    <button
                      className="btn-danger btn-sm"
                      onClick={() =>
                        setConfirm({
                          message: `Delete "${c.name}"? Subjects and records linked to it will be left orphaned.`,
                          run: () => remove('classrooms', c._id),
                        })
                      }
                    >
                      Delete
                    </button>
                  </div>
                }
              >
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-slate-100 px-5 py-3 text-xs text-slate-500">
                  {c.academicYear && <span>Academic year: {c.academicYear}</span>}
                  {c.onlineClassLink ? (
                    <a
                      href={c.onlineClassLink}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-maroon hover:text-gold-600"
                    >
                      Fixed class link ↗
                    </a>
                  ) : (
                    <span className="text-amber-600">No online class link set</span>
                  )}
                  {c.description && <span>{c.description}</span>}
                </div>

                <div className="px-5 py-4">
                  <Table
                    columns={[
                      { key: 'name', header: 'Subject', render: (r) => <span className="font-medium text-slate-800">{r.name}</span> },
                      { key: 'code', header: 'Code', render: (r) => r.code || '—' },
                      {
                        key: 'teacher',
                        header: 'Teacher',
                        render: (r) => (r.teacher?.name ? r.teacher.name : <Badge tone="amber">Unassigned</Badge>),
                      },
                      {
                        key: 'actions',
                        header: '',
                        align: 'right',
                        render: (r) => (
                          <div className="flex justify-end gap-2">
                            <button className="btn-ghost btn-sm" onClick={() => setSubjectForm({ ...r, classRoom: c._id, teacher: r.teacher?._id || '' })}>
                              Edit
                            </button>
                            <button
                              className="btn-danger btn-sm"
                              onClick={() =>
                                setConfirm({
                                  message: `Delete the subject "${r.name}"?`,
                                  run: () => remove('subjects', r._id),
                                })
                              }
                            >
                              Delete
                            </button>
                          </div>
                        ),
                      },
                    ]}
                    rows={subs}
                    empty={
                      <div className="py-6 text-center">
                        <p className="text-xs text-slate-400">No subjects yet.</p>
                        <button
                          className="btn-ghost btn-sm mt-3"
                          onClick={() => setSubjectForm({ ...blankSubject, classRoom: c._id })}
                        >
                          Add a subject to {c.name}
                        </button>
                      </div>
                    }
                  />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ---- class modal ---- */}
      <Modal
        open={!!classForm}
        onClose={() => setClassForm(null)}
        title={classForm?._id ? 'Edit class' : 'Add class'}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setClassForm(null)}>
              Cancel
            </button>
            <button className="btn-primary" form="class-form">
              Save
            </button>
          </>
        }
      >
        {classForm && (
          <form id="class-form" onSubmit={saveClass} className="space-y-4">
            <Field label="Class name">
              <input
                className="input"
                required
                placeholder="GED Preparation / IGCSE Grade 10 / Spoken English – Evening"
                value={classForm.name}
                onChange={(e) => setClassForm({ ...classForm, name: e.target.value })}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Academic year">
                <input
                  className="input"
                  placeholder="2026–27"
                  value={classForm.academicYear}
                  onChange={(e) => setClassForm({ ...classForm, academicYear: e.target.value })}
                />
              </Field>
              <Field label="Display order">
                <input
                  className="input"
                  type="number"
                  value={classForm.order}
                  onChange={(e) => setClassForm({ ...classForm, order: e.target.value })}
                />
              </Field>
            </div>
            <Field
              label="Fixed online class link"
              hint="Used for every class in this group unless a subject or timetable slot overrides it."
            >
              <input
                className="input"
                placeholder="https://meet.google.com/…"
                value={classForm.onlineClassLink}
                onChange={(e) => setClassForm({ ...classForm, onlineClassLink: e.target.value })}
              />
            </Field>
            <Field label="Description">
              <input
                className="input"
                value={classForm.description}
                onChange={(e) => setClassForm({ ...classForm, description: e.target.value })}
              />
            </Field>
          </form>
        )}
      </Modal>

      {/* ---- subject modal ---- */}
      <Modal
        open={!!subjectForm}
        onClose={() => setSubjectForm(null)}
        title={subjectForm?._id ? 'Edit subject' : 'Add subject'}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setSubjectForm(null)}>
              Cancel
            </button>
            <button className="btn-primary" form="subject-form">
              Save
            </button>
          </>
        }
      >
        {subjectForm && (
          <form id="subject-form" onSubmit={saveSubject} className="space-y-4">
            <Field label="Class">
              <Select
                required
                value={subjectForm.classRoom}
                onChange={(e) => setSubjectForm({ ...subjectForm, classRoom: e.target.value })}
                options={classes.map((c) => ({ value: c._id, label: c.name }))}
                placeholder="Choose a class…"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Subject name">
                <input
                  className="input"
                  required
                  value={subjectForm.name}
                  onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })}
                />
              </Field>
              <Field label="Code">
                <input
                  className="input"
                  value={subjectForm.code}
                  onChange={(e) => setSubjectForm({ ...subjectForm, code: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Assigned teacher">
              <Select
                value={subjectForm.teacher}
                onChange={(e) => setSubjectForm({ ...subjectForm, teacher: e.target.value })}
                options={teachers.map((t) => ({ value: t._id, label: t.name }))}
                placeholder="Not assigned yet"
              />
            </Field>
            <Field label="Online link for this subject" hint="Optional — overrides the class link.">
              <input
                className="input"
                value={subjectForm.onlineClassLink}
                onChange={(e) => setSubjectForm({ ...subjectForm, onlineClassLink: e.target.value })}
              />
            </Field>
          </form>
        )}
      </Modal>

      <Confirm
        open={!!confirm}
        onClose={() => setConfirm(null)}
        message={confirm?.message}
        onConfirm={async () => {
          try {
            await confirm.run();
            setConfirm(null);
            load();
          } catch (e) {
            setError(e.message);
            setConfirm(null);
          }
        }}
      />
    </>
  );
}
