'use client';

import { useEffect, useState } from 'react';
import { list, create, update, remove, fmtDate } from '@/lib/client';
import { useSession } from '@/components/SessionProvider';
import { useLookups } from '@/lib/useLookups';
import {
  PageHeader, Card, Modal, Field, Select, Badge, Alert, Spinner, Empty, Confirm, FileOrLink,
} from '@/components/ui';

const AUDIENCES = [
  { value: 'all', label: 'Everyone' },
  { value: 'teachers', label: 'Teachers only' },
  { value: 'students', label: 'Students only' },
  { value: 'parents', label: 'Parents only' },
];

const ATTACH_TYPES = [
  { value: 'link', label: 'Link' },
  { value: 'pdf', label: 'PDF' },
  { value: 'doc', label: 'Document' },
  { value: 'image', label: 'Picture' },
  { value: 'video', label: 'Video' },
];

const blank = { title: '', body: '', audiences: ['all'], classRoom: '', pinned: false, attachments: [] };

export default function AnnouncementsPage() {
  const { user } = useSession();
  const isAdmin = user?.role === 'admin';
  const { classes, loading: lookLoading } = useLookups();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState(null);
  const [confirm, setConfirm] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const r = await list('announcements', { sort: '-pinned -createdAt', limit: 200 });
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
  }, []);

  async function save(e) {
    e.preventDefault();
    try {
      const { _id, ...body } = form;
      if (!body.classRoom) body.classRoom = null;
      body.attachments = (body.attachments || []).filter((a) => a.url);
      if (_id) await update('announcements', _id, body);
      else await create('announcements', body);
      setForm(null);
      setNotice('Announcement posted');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const audienceLabel = (a = []) =>
    a.includes('all') ? 'Everyone' : a.map((x) => AUDIENCES.find((o) => o.value === x)?.label || x).join(', ');

  if (lookLoading) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Announcements"
        subtitle={isAdmin ? 'Choose exactly who sees each notice — teachers, students, parents, or everyone.' : 'Notices from the office.'}
      >
        {isAdmin && (
          <button className="btn-primary" onClick={() => setForm({ ...blank })}>
            New announcement
          </button>
        )}
      </PageHeader>

      <Alert onClose={() => setError('')}>{error}</Alert>
      <Alert tone="success" onClose={() => setNotice('')}>
        {notice}
      </Alert>

      {loading ? (
        <Spinner />
      ) : !rows.length ? (
        <Card>
          <Empty title="No announcements" hint={isAdmin ? 'Post the first notice for your team.' : undefined} />
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map((a) => (
            <Card key={a._id} bodyClass="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    {a.pinned && <Badge tone="gold">Pinned</Badge>}
                    <Badge tone="maroon">{audienceLabel(a.audiences)}</Badge>
                    {a.classRoom?.name && <Badge>{a.classRoom.name}</Badge>}
                  </div>
                  <h3 className="text-base font-bold text-maroon">{a.title}</h3>
                  {a.body && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{a.body}</p>}
                  <p className="mt-2 text-[11px] text-slate-400">
                    {a.createdBy?.name ? `${a.createdBy.name} · ` : ''}
                    {fmtDate(a.createdAt)}
                  </p>
                </div>

                {isAdmin && (
                  <div className="flex shrink-0 gap-2">
                    <button
                      className="btn-ghost btn-sm"
                      onClick={() =>
                        setForm({ ...a, classRoom: a.classRoom?._id || '', attachments: a.attachments || [] })
                      }
                    >
                      Edit
                    </button>
                    <button
                      className="btn-danger btn-sm"
                      onClick={() => setConfirm({ message: `Delete "${a.title}"?`, run: () => remove('announcements', a._id) })}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>

              {!!a.attachments?.length && (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3.5">
                  {a.attachments.map((at, i) => (
                    <a key={i} href={at.url} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">
                      {at.name || at.type}
                    </a>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?._id ? 'Edit announcement' : 'New announcement'}
        wide
        footer={
          <>
            <button className="btn-ghost" onClick={() => setForm(null)}>
              Cancel
            </button>
            <button className="btn-primary" form="ann-form">
              Post
            </button>
          </>
        }
      >
        {form && (
          <form id="ann-form" onSubmit={save} className="space-y-4">
            <Field label="Title">
              <input className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>

            <Field label="Message">
              <textarea
                className="input min-h-[120px]"
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
            </Field>

            <Field label="Audience" hint="Tick every group that should see this.">
              <div className="grid gap-2 sm:grid-cols-2">
                {AUDIENCES.map((a) => {
                  const checked = form.audiences?.includes(a.value);
                  return (
                    <label
                      key={a.value}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm ${
                        checked ? 'border-maroon bg-maroon-50 text-maroon' : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={!!checked}
                        onChange={() => {
                          let next = form.audiences || [];
                          if (a.value === 'all') next = checked ? [] : ['all'];
                          else {
                            next = next.filter((x) => x !== 'all');
                            next = checked ? next.filter((x) => x !== a.value) : [...next, a.value];
                          }
                          setForm({ ...form, audiences: next });
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-maroon focus:ring-maroon"
                      />
                      {a.label}
                    </label>
                  );
                })}
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Limit to one class" hint="Leave blank to send to the whole centre.">
                <Select
                  value={form.classRoom || ''}
                  onChange={(e) => setForm({ ...form, classRoom: e.target.value })}
                  options={classes.map((c) => ({ value: c._id, label: c.name }))}
                  placeholder="All classes"
                />
              </Field>
              <Field label="Pin to the top">
                <Select
                  value={form.pinned ? 'yes' : 'no'}
                  onChange={(e) => setForm({ ...form, pinned: e.target.value === 'yes' })}
                  options={[
                    { value: 'no', label: 'No' },
                    { value: 'yes', label: 'Yes' },
                  ]}
                  placeholder=""
                />
              </Field>
            </div>

            <div>
              <span className="label">Attachments — text, file, picture or video</span>
              <div className="space-y-3">
                {(form.attachments || []).map((at, i) => (
                  <div key={i} className="rounded-lg border border-slate-200 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <Select
                        value={at.type}
                        onChange={(e) => {
                          const next = [...form.attachments];
                          next[i] = { ...at, type: e.target.value };
                          setForm({ ...form, attachments: next });
                        }}
                        options={ATTACH_TYPES}
                        placeholder=""
                      />
                      <input
                        className="input"
                        placeholder="Label"
                        value={at.name || ''}
                        onChange={(e) => {
                          const next = [...form.attachments];
                          next[i] = { ...at, name: e.target.value };
                          setForm({ ...form, attachments: next });
                        }}
                      />
                      <button
                        type="button"
                        className="btn-danger btn-sm"
                        onClick={() => setForm({ ...form, attachments: form.attachments.filter((_, j) => j !== i) })}
                      >
                        ×
                      </button>
                    </div>
                    <FileOrLink
                      name=""
                      value={at.url}
                      onChange={(url, fileName) => {
                        const next = [...form.attachments];
                        next[i] = { ...at, url, name: at.name || fileName || '' };
                        setForm({ ...form, attachments: next });
                      }}
                    />
                  </div>
                ))}
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => setForm({ ...form, attachments: [...(form.attachments || []), { type: 'link', url: '', name: '' }] })}
                >
                  + Add attachment
                </button>
              </div>
            </div>
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
