'use client';

import { useEffect, useState } from 'react';
import { list, create, update, remove, fmtDate } from '@/lib/client';
import { useSession } from '@/components/SessionProvider';
import { useLookups } from '@/lib/useLookups';
import {
  PageHeader, Card, Modal, Field, Select, Badge, Alert, Spinner, Empty, Confirm, FileOrLink, FileLink,
} from '@/components/ui';
import Link from 'next/link';

const TYPES = [
  { value: 'note', label: 'Notes' },
  { value: 'pdf', label: 'PDF' },
  { value: 'doc', label: 'Document' },
  { value: 'ppt', label: 'Presentation' },
  { value: 'paper', label: 'Question paper' },
  { value: 'video', label: 'Video' },
  { value: 'link', label: 'Link' },
  { value: 'image', label: 'Image' },
  { value: 'other', label: 'Other' },
];

const blank = { classRoom: '', subject: '', type: 'note', title: '', description: '', url: '', fileName: '' };

export default function ResourcesPage() {
  const { user } = useSession();
  const canEdit = user?.role === 'admin' || user?.role === 'teacher';
  const { classes, subjects, loading: lookLoading } = useLookups();

  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [type, setType] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [fromUrl, setFromUrl] = useState(null);

  // /resources?subject=<id>&new=1 — opened from a subject page
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setFromUrl({ subject: p.get('subject') || '', isNew: p.get('new') === '1' });
  }, []);

  useEffect(() => {
    if (!fromUrl || lookLoading || !fromUrl.subject) return;
    const subj = subjects.find((s) => s._id === fromUrl.subject);
    const cls = subj?.classRoom?._id || subj?.classRoom || '';
    setClassId(cls);
    setSubjectId(fromUrl.subject);
    if (fromUrl.isNew && canEdit) setForm({ ...blank, classRoom: cls, subject: fromUrl.subject });
    setFromUrl({ subject: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromUrl, lookLoading]);

  async function load() {
    setLoading(true);
    try {
      const r = await list('resources', {
        classRoom: classId || undefined,
        subject: subjectId || undefined,
        type: type || undefined,
        sort: '-createdAt',
        limit: 300,
      });
      setRows(r.items);
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
  }, [classId, subjectId, type]);

  async function save(e) {
    e.preventDefault();
    try {
      const { _id, ...body } = form;
      if (!body.subject) delete body.subject;
      if (_id) await update('resources', _id, body);
      else await create('resources', body);
      setForm(null);
      setNotice('Resource saved');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (lookLoading) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Resources"
        subtitle="Notes, PDFs, documents, presentations, videos and links — organised by subject."
      >
        {canEdit && (
          <button className="btn-primary" onClick={() => setForm({ ...blank, classRoom: classId, subject: subjectId })}>
            Add resource
          </button>
        )}
      </PageHeader>

      <Alert onClose={() => setError('')}>{error}</Alert>
      <Alert tone="success" onClose={() => setNotice('')}>
        {notice}
      </Alert>

      <Card className="mb-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Class">
            <Select
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                setSubjectId('');
              }}
              options={classes.map((c) => ({ value: c._id, label: c.name }))}
              placeholder="All classes"
            />
          </Field>
          <Field label="Subject">
            <Select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              options={subjects
                .filter((s) => !classId || String(s.classRoom?._id || s.classRoom) === String(classId))
                .map((s) => ({ value: s._id, label: s.name }))}
              placeholder="All subjects"
            />
          </Field>
          <Field label="Type">
            <Select value={type} onChange={(e) => setType(e.target.value)} options={TYPES} placeholder="All types" />
          </Field>
        </div>
      </Card>

      {loading ? (
        <Spinner />
      ) : !rows.length ? (
        <Card>
          <Empty title="No resources yet" hint={canEdit ? 'Upload a file or paste a link to share it with the class.' : undefined} />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <Card key={r._id} bodyClass="p-5">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge tone="maroon">{TYPES.find((t) => t.value === r.type)?.label || r.type}</Badge>
                {r.subject?._id && (
                  <Link href={`/subjects/${r.subject._id}`} className="chip bg-slate-100 text-slate-700 hover:bg-maroon-50 hover:text-maroon">
                    {r.subject.name}
                  </Link>
                )}
                {r.classRoom?.name && <Badge>{r.classRoom.name}</Badge>}
              </div>
              <h3 className="text-sm font-bold text-maroon">{r.title}</h3>
              {r.description && <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{r.description}</p>}
              <p className="mt-2 text-[11px] text-slate-400">
                {r.uploadedBy?.name ? `${r.uploadedBy.name} · ` : ''}
                {fmtDate(r.createdAt)}
              </p>

              <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3.5">
                {r.url && <FileLink url={r.url} name={r.fileName || (TYPES.find((t) => t.value === r.type)?.label || 'Open')} />}
                {canEdit && (
                  <div className="ml-auto flex gap-2">
                    <button
                      className="btn-ghost btn-sm"
                      onClick={() =>
                        setForm({ ...r, classRoom: r.classRoom?._id || r.classRoom, subject: r.subject?._id || '' })
                      }
                    >
                      Edit
                    </button>
                    <button
                      className="btn-danger btn-sm"
                      onClick={() => setConfirm({ message: `Delete "${r.title}"?`, run: () => remove('resources', r._id) })}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?._id ? 'Edit resource' : 'Add resource'}
        wide
        footer={
          <>
            <button className="btn-ghost" onClick={() => setForm(null)}>
              Cancel
            </button>
            <button className="btn-primary" form="resource-form">
              Save
            </button>
          </>
        }
      >
        {form && (
          <form id="resource-form" onSubmit={save} className="space-y-4">
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
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  options={subjects
                    .filter((s) => String(s.classRoom?._id || s.classRoom) === String(form.classRoom))
                    .map((s) => ({ value: s._id, label: s.name }))}
                  placeholder="Whole class"
                />
              </Field>
              <Field label="Type">
                <Select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  options={TYPES}
                  placeholder=""
                />
              </Field>
            </div>

            <Field label="Title">
              <input className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>

            <Field label="Description">
              <textarea
                className="input min-h-[80px]"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>

            <FileOrLink
              name="File or link"
              fileName={form.fileName}
              value={form.url}
              onChange={(url, fileName) => setForm({ ...form, url, fileName: fileName || '' })}
            />
          </form>
        )}
      </Modal>

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
