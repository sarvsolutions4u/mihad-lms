'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from '@/components/SessionProvider';
import { Spinner, Empty, Card } from '@/components/ui';
import Icon from '@/components/Icon';
import SubjectPicker from '@/components/course/SubjectPicker';
import { uploadFile } from '@/lib/upload';
import { ITEM_KINDS, parseScript, linesToScript } from '@/lib/courseShared';
import { fmtSize } from '@/lib/fileTypes';

const uid = () => Math.random().toString(36).slice(2, 10);
const BLANK = {
  conversation: { title: 'New conversation', minutes: 3, body: '', lines: [] },
  audio: { title: 'Listening practice', minutes: 3, body: '', audio: '' },
  file: { title: 'Reading', minutes: 5, body: '' },
  notes: { title: 'Useful phrases', minutes: 3, body: '## Useful phrases\n- …' },
  speaking: { title: 'Speaking task', minutes: 2, prompt: 'Record about 1 minute: …', tips: '', maxSecs: 90 },
};

/** Upload one file and hand back { url, name, size }. */
function UploadButton({ label, accept, onDone }) {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <label className={`btn-ghost btn-sm cursor-pointer ${busy ? 'pointer-events-none opacity-60' : ''}`}>
        <Icon name="upload" className="h-3.5 w-3.5" /> {busy || label}
        <input
          type="file"
          accept={accept}
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            setErr('');
            setBusy('Uploading… 0%');
            try {
              const up = await uploadFile(f, { purpose: 'general', onProgress: (p) => setBusy(`Uploading… ${p}%`) });
              onDone({ url: up.url, name: up.fileName || f.name, size: up.size || f.size });
            } catch (x) {
              setErr(x.message);
            } finally {
              setBusy('');
            }
          }}
        />
      </label>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </span>
  );
}

function ConversationEditor({ it, set }) {
  const [script, setScript] = useState(linesToScript(it.lines));
  const speakers = useMemo(() => [...new Set((it.lines || []).map((l) => l.speaker).filter(Boolean))], [it.lines]);
  const withAudio = (it.lines || []).filter((l) => l.audio).length;

  function apply(text) {
    setScript(text);
    const old = it.lines || [];
    const parsed = parseScript(text).map((l, i) => {
      // keep a line's voice audio while its words stay the same
      const same = old[i] && old[i].text === l.text ? old[i] : old.find((o) => o.text === l.text && o.speaker === l.speaker);
      const voice = old.find((o) => o.speaker === l.speaker)?.voice || '';
      return { ...l, voice, audio: same?.audio || '' };
    });
    set({ lines: parsed });
  }
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="label">Short introduction (optional)</span>
        <input className="input" value={it.body || ''} onChange={(e) => set({ body: e.target.value })} />
      </label>
      <label className="block">
        <span className="label">The conversation — one line each, “Name: what they say”</span>
        <textarea className="input min-h-[180px] font-mono text-[13px]" value={script} onChange={(e) => apply(e.target.value)} placeholder={'Priya: Hi! I’m Priya.\nAhmed: Hello Priya, nice to meet you.'} />
      </label>
      {speakers.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <span className="font-semibold">Voices (when there is no recording):</span>
          {speakers.map((sp) => {
            const v = it.lines.find((l) => l.speaker === sp)?.voice || '';
            return (
              <label key={sp} className="flex items-center gap-1">
                {sp}
                <select className="input w-auto py-0.5 text-xs" value={v} onChange={(e) => set({ lines: it.lines.map((l) => (l.speaker === sp ? { ...l, voice: e.target.value } : l)) })}>
                  <option value="">Auto</option>
                  <option value="f">Female</option>
                  <option value="m">Male</option>
                </select>
              </label>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-slate-500">
        {withAudio ? `${withAudio} of ${it.lines.length} lines have built-in voice audio. ` : ''}
        Lines without audio are read by the student’s browser voice. You can also upload a full recording of the conversation below.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <UploadButton label={it.audio ? 'Replace full recording' : 'Upload a full recording (MP3 / M4A)'} accept=".mp3,.m4a,.wav,.aac,.ogg,.webm" onDone={(f) => set({ audio: f.url, audioName: f.name })} />
        {it.audio && (
          <span className="text-xs text-slate-600">
            🎧 {it.audioName || 'Recording'}{' '}
            <button type="button" className="text-red-600" onClick={() => set({ audio: '', audioName: '' })}>
              remove
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

function ItemEditor({ it, set }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <label className="block">
          <span className="label">Title</span>
          <input className="input" value={it.title} onChange={(e) => set({ title: e.target.value })} />
        </label>
        <label className="block">
          <span className="label">Minutes</span>
          <input className="input" type="number" min="0" max="120" value={it.minutes || 0} onChange={(e) => set({ minutes: Number(e.target.value) })} />
        </label>
      </div>
      {it.kind === 'conversation' && <ConversationEditor it={it} set={set} />}
      {it.kind === 'audio' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <UploadButton label={it.audio ? 'Replace audio' : 'Upload audio (MP3 / M4A / WAV)'} accept=".mp3,.m4a,.wav,.aac,.ogg,.webm" onDone={(f) => set({ audio: f.url, audioName: f.name })} />
            {it.audio ? <span className="text-xs text-slate-600">🎧 {it.audioName || 'Audio'}</span> : <span className="text-xs text-amber-700">No audio yet</span>}
          </div>
          <label className="block">
            <span className="label">Transcript or notes (optional)</span>
            <textarea className="input min-h-[120px]" value={it.body || ''} onChange={(e) => set({ body: e.target.value })} />
          </label>
        </>
      )}
      {it.kind === 'file' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <UploadButton label={it.file?.url ? 'Replace file' : 'Upload PDF / Word'} accept=".pdf,.docx,.doc,.pptx" onDone={(f) => set({ file: f })} />
            {it.file?.url ? (
              <span className="text-xs text-slate-600">
                📄 {it.file.name} {it.file.size ? `(${fmtSize(it.file.size)})` : ''}
              </span>
            ) : (
              <span className="text-xs text-amber-700">No file yet</span>
            )}
          </div>
          <label className="block">
            <span className="label">Instructions (optional)</span>
            <textarea className="input min-h-[70px]" value={it.body || ''} onChange={(e) => set({ body: e.target.value })} />
          </label>
        </>
      )}
      {it.kind === 'notes' && (
        <label className="block">
          <span className="label">Notes</span>
          <textarea className="input min-h-[220px] font-mono text-[13px]" value={it.body || ''} onChange={(e) => set({ body: e.target.value })} />
          <span className="mt-1 block text-[11px] text-slate-500">
            Formatting: <code>## Heading</code>, <code>- bullet</code>, <code>1. numbered</code>, <code>**bold**</code>, tables with <code>| a | b |</code>
          </span>
        </label>
      )}
      {it.kind === 'speaking' && (
        <>
          <label className="block">
            <span className="label">What should the student say?</span>
            <textarea className="input min-h-[120px]" value={it.prompt || ''} onChange={(e) => set({ prompt: e.target.value })} />
          </label>
          <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
            <label className="block">
              <span className="label">Tip (optional)</span>
              <input className="input" value={it.tips || ''} onChange={(e) => set({ tips: e.target.value })} />
            </label>
            <label className="block">
              <span className="label">Longest recording</span>
              <select className="input" value={it.maxSecs || 90} onChange={(e) => set({ maxSecs: Number(e.target.value) })}>
                {[30, 60, 90, 120, 180].map((s) => (
                  <option key={s} value={s}>
                    {s < 60 ? `${s} seconds` : `${s / 60} min${s > 60 ? 's' : ''}`}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </>
      )}
    </div>
  );
}

export default function EditCoursePage({ params }) {
  const { id } = use(params);
  const { user } = useSession();
  const router = useRouter();
  const [c, setC] = useState(null);
  const [meta, setMeta] = useState(null);
  const [open, setOpen] = useState(null); // item id being edited
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch(`/api/courses/${id}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) throw new Error(d.error);
        if (!d.canManage) throw new Error('Only this course’s trainers can edit it');
        const co = d.course;
        setMeta({ mySubjects: d.mySubjects, createdBy: co.createdBy });
        setC({
          ...co,
          subjects: co.subjects.map((s) => String(s._id)),
          howToText: (co.howTo || []).join('\n'),
          units: co.units.map((u) => ({ ...u, items: u.items.map((it) => ({ ...it })) })),
        });
      })
      .catch((e) => setErr(e.message));
  }, [id]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (err && !c) return <Empty title={err} />;
  if (!c || !user) return <Spinner />;

  const update = (patch) => {
    setC((x) => ({ ...x, ...patch }));
    setDirty(true);
    setMsg('');
  };
  const setUnit = (ui, patch) => update({ units: c.units.map((u, i) => (i === ui ? { ...u, ...patch } : u)) });
  const setItem = (ui, ii, patch) => setUnit(ui, { items: c.units[ui].items.map((it, j) => (j === ii ? { ...it, ...patch } : it)) });
  const move = (arr, i, d) => {
    const a = [...arr];
    const j = i + d;
    if (j < 0 || j >= a.length) return a;
    [a[i], a[j]] = [a[j], a[i]];
    return a;
  };
  const lockedSubjects = user.role === 'teacher' ? c.subjects.filter((s) => !(meta?.mySubjects || []).includes(s)) : [];

  async function save() {
    setBusy(true);
    setErr('');
    try {
      const body = {
        title: c.title,
        subtitle: c.subtitle,
        description: c.description,
        level: c.level,
        category: c.category,
        published: c.published,
        howTo: c.howToText.split('\n').map((x) => x.trim()).filter(Boolean),
        subjects: c.subjects,
        units: c.units.map((u) => ({ ...u, _id: u._id && !String(u._id).startsWith('new-') ? u._id : undefined, items: u.items.map((it) => ({ ...it, _id: it._id && !String(it._id).startsWith('new-') ? it._id : undefined })) })),
      };
      const r = await fetch(`/api/courses/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || 'Could not save');
      setDirty(false);
      setMsg('Saved');
      // reload to pick up new ids
      const fresh = await (await fetch(`/api/courses/${id}`, { cache: 'no-store' })).json();
      if (fresh.ok) setC((x) => ({ ...x, units: fresh.course.units }));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm('Delete this course for everyone? Students’ progress and recordings in it are deleted too.')) return;
    const r = await fetch(`/api/courses/${id}`, { method: 'DELETE' });
    const d = await r.json();
    if (d.ok) router.push('/courses');
    else setErr(d.error);
  }

  return (
    <div className="mx-auto max-w-4xl pb-24">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/courses/${id}`} className="text-xs font-semibold text-slate-500 hover:text-maroon">
            ← Back to the course
          </Link>
          <h1 className="text-xl font-bold text-maroon">Edit course</h1>
        </div>
        <div className="flex items-center gap-2">
          {msg && <span className="text-sm font-semibold text-emerald-700">{msg}</span>}
          <button className="btn-primary" onClick={save} disabled={busy || !dirty}>
            {busy ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
          </button>
        </div>
      </div>
      {err && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

      <Card title="Course details" className="mb-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="label">Title</span>
            <input className="input" value={c.title} onChange={(e) => update({ title: e.target.value })} />
          </label>
          <label className="block sm:col-span-2">
            <span className="label">One-line summary</span>
            <input className="input" value={c.subtitle || ''} onChange={(e) => update({ subtitle: e.target.value })} />
          </label>
          <label className="block">
            <span className="label">Level</span>
            <input className="input" value={c.level || ''} onChange={(e) => update({ level: e.target.value })} />
          </label>
          <label className="block">
            <span className="label">Category</span>
            <input className="input" value={c.category || ''} onChange={(e) => update({ category: e.target.value })} />
          </label>
          <label className="block sm:col-span-2">
            <span className="label">Introduction (what the course is and how it helps)</span>
            <textarea className="input min-h-[100px]" value={c.description || ''} onChange={(e) => update({ description: e.target.value })} />
          </label>
          <label className="block sm:col-span-2">
            <span className="label">How to use it — one step per line</span>
            <textarea className="input min-h-[90px]" value={c.howToText} onChange={(e) => update({ howToText: e.target.value })} />
          </label>
          <div className="sm:col-span-2">
            <span className="label">Batches (subjects) that get this course</span>
            <SubjectPicker value={c.subjects.filter((s) => !lockedSubjects.includes(s))} locked={lockedSubjects} onChange={(v) => update({ subjects: [...lockedSubjects, ...v] })} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
            <input type="checkbox" checked={c.published} onChange={(e) => update({ published: e.target.checked })} /> Visible to students
          </label>
        </div>
      </Card>

      {c.units.map((u, ui) => (
        <section key={u._id || ui} className="card mb-4">
          <header className="flex flex-wrap items-start gap-2 border-b border-slate-100 px-5 py-3">
            <div className="grid w-full min-w-0 gap-2 sm:w-auto sm:flex-1">
              <input className="input font-bold" value={u.title} onChange={(e) => setUnit(ui, { title: e.target.value })} />
              <input className="input text-sm" placeholder="What this unit covers" value={u.summary || ''} onChange={(e) => setUnit(ui, { summary: e.target.value })} />
            </div>
            <div className="ml-auto flex gap-1">
              <button type="button" className="btn-ghost btn-sm" onClick={() => update({ units: move(c.units, ui, -1) })} aria-label="Move unit up">
                ↑
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => update({ units: move(c.units, ui, 1) })} aria-label="Move unit down">
                ↓
              </button>
              <button
                type="button"
                className="btn-ghost btn-sm text-red-600"
                onClick={() => window.confirm(`Remove “${u.title}” and its ${u.items.length} activities?`) && update({ units: c.units.filter((_, i) => i !== ui) })}
              >
                Remove
              </button>
            </div>
          </header>
          <ul className="divide-y divide-slate-100">
            {u.items.map((it, ii) => {
              const key = it._id || `${ui}-${ii}`;
              const k = ITEM_KINDS[it.kind];
              const isOpen = open === key;
              return (
                <li key={key} className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-maroon-50 text-maroon">
                      <Icon name={k.icon} className="h-3.5 w-3.5" />
                    </span>
                    <button type="button" className="min-w-0 flex-1 basis-[calc(100%-2.75rem)] text-left sm:basis-0" onClick={() => setOpen(isOpen ? null : key)}>
                      <span className="block truncate text-sm font-semibold text-slate-800">{it.title}</span>
                      <span className="text-[11px] text-slate-500">
                        {k.label}
                        {it.kind === 'conversation' ? ` · ${it.lines?.length || 0} lines` : ''}
                        {it.key ? ' · built-in' : ''}
                      </span>
                    </button>
                    <div className="ml-auto flex gap-1.5 sm:gap-2">
                      <button type="button" className="btn-ghost btn-sm" onClick={() => setUnit(ui, { items: move(u.items, ii, -1) })} aria-label="Move up">
                        ↑
                      </button>
                      <button type="button" className="btn-ghost btn-sm" onClick={() => setUnit(ui, { items: move(u.items, ii, 1) })} aria-label="Move down">
                        ↓
                      </button>
                      <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(isOpen ? null : key)}>
                        {isOpen ? 'Close' : 'Edit'}
                      </button>
                      <button
                        type="button"
                        className="btn-ghost btn-sm text-red-600"
                        onClick={() => window.confirm(`Remove “${it.title}”?`) && setUnit(ui, { items: u.items.filter((_, j) => j !== ii) })}
                        aria-label="Remove"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="mt-3 rounded-lg bg-slate-50 p-4">
                      <ItemEditor it={it} set={(patch) => setItem(ui, ii, patch)} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-3">
            <span className="text-xs font-semibold text-slate-500">Add:</span>
            {Object.entries(ITEM_KINDS).map(([kind, k]) => (
              <button
                key={kind}
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => {
                  const fresh = { _id: `new-${uid()}`, kind, ...BLANK[kind] };
                  setUnit(ui, { items: [...u.items, fresh] });
                  setOpen(fresh._id);
                }}
              >
                <Icon name={k.icon} className="h-3.5 w-3.5" /> {k.label}
              </button>
            ))}
          </div>
        </section>
      ))}

      <button type="button" className="btn-ghost" onClick={() => update({ units: [...c.units, { _id: `new-${uid()}`, title: `Unit ${c.units.length + 1}`, summary: '', items: [] }] })}>
        <Icon name="plus" className="h-4 w-4" /> Add a unit
      </button>

      {(user.role === 'admin' || String(meta?.createdBy?._id) === String(user._id || user.uid)) && (
        <div className="mt-10 border-t border-slate-200 pt-4">
          <button type="button" className="text-sm font-semibold text-red-600 hover:underline" onClick={remove}>
            Delete this course
          </button>
        </div>
      )}

      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur lg:pl-72">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
            <span className="text-sm text-slate-600">You have unsaved changes.</span>
            <button className="btn-primary" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
