'use client';

import { useEffect, useMemo, useState } from 'react';
import { list, create, update, remove } from '@/lib/client';
import { useSession } from '@/components/SessionProvider';
import {
  PageHeader, Card, Table, Modal, Field, Select, Badge, Alert, Spinner, Confirm,
} from '@/components/ui';

const ROLE_TABS = [
  { key: 'student', label: 'Students' },
  { key: 'teacher', label: 'Teachers' },
  { key: 'parent', label: 'Parents' },
  { key: 'admin', label: 'Admins' },
];

const blank = (role) => ({
  name: '', email: '', password: '', role, phone: '',
  classRoom: '', admissionNo: '', subjects: [], children: [], active: true,
});

export default function PeoplePage() {
  const { user } = useSession();
  const isAdmin = user?.role === 'admin';

  const [tab, setTab] = useState('student');
  const [rows, setRows] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [students, setStudents] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [form, setForm] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [bulk, setBulk] = useState(null);

  async function load(role = tab, search = q) {
    setLoading(true);
    try {
      const [u, c, s, st] = await Promise.all([
        list('users', { role, q: search, sort: 'name', limit: 500 }),
        list('classrooms', { sort: 'order name', limit: 100 }),
        list('subjects', { sort: 'name', limit: 500 }),
        list('users', { role: 'student', sort: 'name', limit: 1000 }),
      ]);
      setRows(u.items);
      setClasses(c.items);
      setSubjects(s.items);
      setStudents(st.items);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(tab, q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const visibleTabs = useMemo(
    () => (isAdmin ? ROLE_TABS : ROLE_TABS.filter((t) => ['student', 'teacher'].includes(t.key))),
    [isAdmin]
  );

  async function save(e) {
    e.preventDefault();
    try {
      const { _id, ...body } = form;
      if (!body.classRoom) delete body.classRoom;
      if (!body.password) delete body.password;
      if (body.role !== 'student') { delete body.classRoom; delete body.admissionNo; }
      if (body.role !== 'parent') delete body.children;
      if (!['teacher', 'student'].includes(body.role)) delete body.subjects;

      if (_id) await update('users', _id, body);
      else await create('users', body);

      setForm(null);
      setNotice(_id ? 'Account updated' : 'Account created');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (r) => (
        <div>
          <p className="font-semibold text-slate-800">{r.name}</p>
          <p className="text-xs text-slate-500">{r.email}</p>
        </div>
      ),
    },
    ...(tab === 'student'
      ? [
          { key: 'admissionNo', header: 'Admission no', render: (r) => r.admissionNo || '—' },
          { key: 'classRoom', header: 'Class', render: (r) => r.classRoom?.name || <Badge tone="amber">No class</Badge> },
        ]
      : []),
    ...(tab === 'parent'
      ? [{ key: 'children', header: 'Children', render: (r) => r.children?.map((c) => c.name).join(', ') || <Badge tone="amber">None linked</Badge> }]
      : []),
    ...(tab === 'teacher'
      ? [{
          key: 'subjects',
          header: 'Subjects taught',
          render: (r) => {
            const mine = subjects.filter((s) => String(s.teacher?._id || s.teacher) === String(r._id));
            return mine.length ? mine.map((s) => s.name).join(', ') : <Badge tone="amber">None assigned</Badge>;
          },
        }]
      : []),
    { key: 'phone', header: 'Phone', render: (r) => r.phone || '—' },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (r.active === false ? <Badge tone="red">Disabled</Badge> : <Badge tone="green">Active</Badge>),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-2">
          <button
            className="btn-ghost btn-sm"
            onClick={() =>
              setForm({
                ...r,
                password: '',
                classRoom: r.classRoom?._id || r.classRoom || '',
                subjects: (r.subjects || []).map((s) => s._id || s),
                children: (r.children || []).map((c) => c._id || c),
              })
            }
          >
            Edit
          </button>
          {isAdmin && (
            <button
              className="btn-danger btn-sm"
              onClick={() => setConfirm({ message: `Delete ${r.name}'s account?`, run: () => remove('users', r._id) })}
            >
              Delete
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="People" subtitle="Accounts for teachers, students and parents.">
        <button className="btn-ghost" onClick={() => setBulk({ classRoom: '', defaultPassword: 'Student@123', file: null })}>
          Bulk upload students
        </button>
        <button className="btn-primary" onClick={() => setForm(blank(tab === 'admin' && !isAdmin ? 'student' : tab))}>
          Add {tab}
        </button>
      </PageHeader>

      <Alert onClose={() => setError('')}>{error}</Alert>
      <Alert tone="success" onClose={() => setNotice('')}>
        {notice}
      </Alert>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {visibleTabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${
                tab === t.key ? 'bg-maroon text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load(tab, q);
          }}
          className="flex gap-2"
        >
          <input
            className="input w-56"
            placeholder="Search name or email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="btn-ghost">Search</button>
        </form>
      </div>

      <Card bodyClass="px-5 py-4">
        {loading ? <Spinner /> : <Table columns={columns} rows={rows} />}
      </Card>

      {/* ---- person modal ---- */}
      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?._id ? `Edit ${form.name}` : 'Add a person'}
        wide
        footer={
          <>
            <button className="btn-ghost" onClick={() => setForm(null)}>
              Cancel
            </button>
            <button className="btn-primary" form="person-form">
              Save
            </button>
          </>
        }
      >
        {form && (
          <form id="person-form" onSubmit={save} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name">
                <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Email (used to sign in)">
                <input
                  className="input"
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Role">
                <Select
                  required
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  placeholder="Choose…"
                  options={
                    isAdmin
                      ? [
                          { value: 'student', label: 'Student' },
                          { value: 'teacher', label: 'Teacher' },
                          { value: 'parent', label: 'Parent' },
                          { value: 'admin', label: 'Administrator' },
                        ]
                      : [{ value: 'student', label: 'Student' }]
                  }
                />
              </Field>
              <Field label={form._id ? 'New password (leave blank to keep)' : 'Password'}>
                <input
                  className="input"
                  type="text"
                  required={!form._id}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={form._id ? 'Unchanged' : 'At least 6 characters'}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone">
                <input className="input" value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Field>
              <Field label="Account status">
                <Select
                  value={form.active === false ? 'no' : 'yes'}
                  onChange={(e) => setForm({ ...form, active: e.target.value === 'yes' })}
                  placeholder=""
                  options={[
                    { value: 'yes', label: 'Active' },
                    { value: 'no', label: 'Disabled' },
                  ]}
                />
              </Field>
            </div>

            {form.role === 'student' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Class">
                  <Select
                    value={form.classRoom || ''}
                    onChange={(e) => setForm({ ...form, classRoom: e.target.value })}
                    options={classes.map((c) => ({ value: c._id, label: c.name }))}
                    placeholder="Choose a class…"
                  />
                </Field>
                <Field label="Admission number">
                  <input
                    className="input"
                    value={form.admissionNo || ''}
                    onChange={(e) => setForm({ ...form, admissionNo: e.target.value })}
                  />
                </Field>
              </div>
            )}

            {form.role === 'parent' && (
              <Field label="Children" hint="Hold Ctrl / Cmd to select more than one.">
                <select
                  multiple
                  size={Math.min(8, Math.max(4, students.length))}
                  className="input h-auto"
                  value={form.children || []}
                  onChange={(e) =>
                    setForm({ ...form, children: Array.from(e.target.selectedOptions).map((o) => o.value) })
                  }
                >
                  {students.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name}
                      {s.classRoom?.name ? ` — ${s.classRoom.name}` : ''}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {form.role === 'teacher' && (
              <p className="rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-500">
                Assign subjects to this teacher from <strong>Classes &amp; Subjects</strong> — each subject
                carries its own teacher.
              </p>
            )}
          </form>
        )}
      </Modal>

      <BulkUploadModal
        state={bulk}
        setState={setBulk}
        classes={classes}
        onDone={(msg) => {
          setNotice(msg);
          load();
        }}
        onError={setError}
      />

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

/* ------------------------------------------------------------------ */

function BulkUploadModal({ state, setState, classes, onDone, onError }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (!state.file) return onError('Please choose a file');
    setBusy(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', state.file);
      fd.append('classRoom', state.classRoom);
      fd.append('defaultPassword', state.defaultPassword);
      const res = await fetch('/api/users/bulk-upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || data.ok === false) throw new Error(data.error || 'Upload failed');
      setResult(data);
      onDone(`${data.createdCount} student${data.createdCount === 1 ? '' : 's'} imported`);
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={!!state}
      onClose={() => {
        setState(null);
        setResult(null);
      }}
      title="Bulk upload students from Excel"
      wide
      footer={
        <>
          <a href="/api/users/template" className="btn-ghost">
            Download template
          </a>
          <button className="btn-primary" form="bulk-form" disabled={busy}>
            {busy ? 'Importing…' : 'Import'}
          </button>
        </>
      }
    >
      {state && (
        <form id="bulk-form" onSubmit={submit} className="space-y-4">
          <p className="rounded-lg bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
            Columns read from the first sheet: <strong>Name</strong>, <strong>Email</strong>, Password,
            Admission No, Phone, Parent Name, Parent Email, Parent Phone. Name and Email are required;
            everything else is optional. A parent account is created and linked automatically whenever a
            Parent Email is present.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Import into class">
              <Select
                required
                value={state.classRoom}
                onChange={(e) => setState({ ...state, classRoom: e.target.value })}
                options={classes.map((c) => ({ value: c._id, label: c.name }))}
                placeholder="Choose a class…"
              />
            </Field>
            <Field label="Default password" hint="Used when the Password column is blank.">
              <input
                className="input"
                value={state.defaultPassword}
                onChange={(e) => setState({ ...state, defaultPassword: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Excel or CSV file">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => setState({ ...state, file: e.target.files?.[0] || null })}
              className="block w-full text-sm text-slate-500 file:mr-3 file:rounded-md file:border-0
                         file:bg-maroon-50 file:px-4 file:py-2 file:text-sm file:font-semibold
                         file:text-maroon hover:file:bg-maroon-100"
            />
          </Field>

          {result && (
            <div className="space-y-3 rounded-lg border border-slate-200 p-4">
              <p className="text-sm font-semibold text-emerald-700">
                Imported {result.createdCount}; skipped {result.skippedCount}.
              </p>
              {!!result.skipped?.length && (
                <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-slate-500">
                  {result.skipped.map((s, i) => (
                    <li key={i}>
                      Row {s.line}: {s.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </form>
      )}
    </Modal>
  );
}
