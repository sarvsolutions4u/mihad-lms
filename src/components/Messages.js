'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Icon from './Icon';
import { Badge, Spinner, Modal, FileLink, MediaViewer } from './ui';
import { FileViewerModal } from './FileViewer';
import { uploadFile } from '@/lib/upload';
import { fmtTime } from './DoubtDialog';

const TZ = 'Asia/Dubai';
export const LEARNERS = ['student', 'parent'];

export function fmtWhenShort(d) {
  if (!d) return '';
  const dt = new Date(d);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  const day = dt.toLocaleDateString('en-CA', { timeZone: TZ });
  if (day === today) return dt.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
  return dt.toLocaleDateString('en-GB', { timeZone: TZ, day: '2-digit', month: 'short' });
}
const fmtFull = (d) =>
  new Date(d).toLocaleString('en-GB', { timeZone: TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/** "Aisha Rahman ↔ Meera Nair" from the reader's point of view. */
export function sidesOf(t, me) {
  const learner = t.learner
    ? `${t.learner.name}${t.learner.role === 'parent' && t.student?.name ? ` (parent of ${t.student.name})` : ''}`
    : '';
  const staff = t.teacher && !(t.toOffice && t.learner) ? t.teacher.name : 'Al Mihad Office';
  if (!t.learner) return { other: me?.role === 'teacher' ? 'Al Mihad Office' : t.teacher?.name || 'Trainer', line: `${t.teacher?.name || 'Trainer'} ↔ Al Mihad Office` };
  if (LEARNERS.includes(me?.role)) return { other: staff, line: staff };
  if (me?.role === 'teacher') return { other: learner, line: learner };
  return { other: `${learner} ↔ ${staff}`, line: `${learner} ↔ ${staff}` };
}

/** One row in the inbox. */
export function ThreadRow({ t, me, active, onClick }) {
  const { other } = sidesOf(t, me);
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${active ? 'bg-maroon-50' : 'hover:bg-slate-50'}`}
      >
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${t.unread ? 'bg-red-600' : 'bg-transparent'}`} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className={`min-w-0 flex-1 truncate text-sm ${t.unread ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'}`}>{other}</span>
            <span className="shrink-0 text-[11px] text-slate-400">{fmtWhenShort(t.lastMessageAt)}</span>
          </span>
          <span className="mt-0.5 flex items-center gap-1.5">
            {t.kind === 'doubt' && <span className="rounded bg-gold-50 px-1.5 text-[10px] font-bold uppercase text-gold-600">Doubt</span>}
            {t.status === 'resolved' && <span className="rounded bg-emerald-50 px-1.5 text-[10px] font-bold uppercase text-emerald-700">Answered</span>}
            <span className="truncate text-xs font-medium text-slate-600">{t.title}</span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-slate-400">
            {t.subject?.name ? `${t.subject.name} · ` : ''}
            {t.lastText}
          </span>
        </span>
      </button>
    </li>
  );
}

/** The part of the notes a doubt is about. */
function RefCard({ r, onOpenFile, onOpenLink }) {
  if (!r) return null;
  const where = [r.page ? `page ${r.page}` : '', r.seconds != null ? `at ${fmtTime(r.seconds)}` : ''].filter(Boolean).join(' · ');
  return (
    <div className="mb-2 space-y-2 rounded-lg border border-gold/40 bg-gold-50 p-2.5 text-slate-800">
      {(r.fileId || r.link) && (
        <button
          type="button"
          onClick={() => (r.fileId ? onOpenFile(`/api/files/${r.fileId}`, r.fileName, r.page) : onOpenLink(r.link, r.fileName))}
          className="flex items-center gap-1.5 text-left text-xs font-semibold text-maroon hover:underline"
        >
          <Icon name={r.link ? 'video' : 'file'} className="h-3.5 w-3.5 shrink-0" />
          <span className="break-all">{r.fileName || 'Course file'}</span>
          {where && <span className="font-normal text-slate-500">· {where}</span>}
        </button>
      )}
      {r.quote && <blockquote className="whitespace-pre-wrap border-l-4 border-gold pl-2.5 text-sm italic text-slate-700">“{r.quote}”</blockquote>}
      {r.image && (
        <button type="button" onClick={() => onOpenFile(r.image, 'Snip')} className="block overflow-hidden rounded border border-slate-200 bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={r.image} alt="Snipped part of the notes" className="max-h-60 max-w-full object-contain" />
        </button>
      )}
    </div>
  );
}

/** A conversation with its messages and the reply box. */
export function ThreadView({ id, me, onBack, onChanged }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState('');
  const [viewer, setViewer] = useState(null);
  const [linkViewer, setLinkViewer] = useState(null);
  const endRef = useRef(null);
  const lastCount = useRef(0);

  const load = useCallback(
    async (quiet) => {
      try {
        const r = await fetch(`/api/messages/${id}`, { cache: 'no-store' });
        const d = await r.json();
        if (!r.ok || !d.ok) throw new Error(d.error || 'Could not open this conversation');
        setData(d);
        if (!quiet) window.dispatchEvent(new Event('messages:changed'));
      } catch (e) {
        setErr(e.message);
      }
    },
    [id]
  );

  useEffect(() => {
    setData(null);
    setErr('');
    lastCount.current = 0;
    load();
    const t = setInterval(() => document.visibilityState === 'visible' && load(true), 15000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const n = data?.messages?.length || 0;
    if (n !== lastCount.current) {
      lastCount.current = n;
      endRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [data]);

  async function send(e) {
    e?.preventDefault();
    if (!text.trim() && !files.length) return;
    setErr('');
    try {
      const attachments = [];
      for (const f of files) {
        setBusy(`Uploading ${f.name}…`);
        const up = await uploadFile(f, { purpose: 'message' });
        attachments.push({ url: up.url, name: up.fileName || f.name, size: up.size || f.size });
      }
      setBusy('Sending…');
      const r = await fetch(`/api/messages/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, attachments }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || 'Could not send');
      setText('');
      setFiles([]);
      await load(true);
      onChanged?.();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy('');
    }
  }

  async function setStatus(status) {
    const r = await fetch(`/api/messages/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (r.ok) {
      await load(true);
      onChanged?.();
    }
  }

  if (err && !data) return <p className="p-6 text-sm text-red-700">{err}</p>;
  if (!data) return <Spinner />;
  const t = data.thread;
  const { line } = sidesOf(t, me);
  const watching = me?.role === 'admin' && !t.toOffice;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-start gap-2 border-b border-slate-200 px-4 py-3">
        {onBack && (
          <button type="button" onClick={onBack} className="-ml-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Back to the list">
            ←
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-800">{t.title}</p>
          <p className="truncate text-xs text-slate-500">
            {line}
            {t.subject?.name ? ` · ${t.subject.name}` : ''}
            {t.classRoom?.name ? ` · ${t.classRoom.name}` : ''}
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Badge tone={t.kind === 'doubt' ? 'gold' : 'slate'}>{t.kind === 'doubt' ? 'Doubt' : 'Message'}</Badge>
            <Badge tone={t.status === 'resolved' ? 'green' : 'amber'}>{t.status === 'resolved' ? 'Answered' : 'Open'}</Badge>
          </div>
        </div>
        {t.status === 'open' ? (
          <button type="button" className="btn-ghost btn-sm shrink-0" onClick={() => setStatus('resolved')}>
            <Icon name="check" className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Mark answered</span>
            <span className="sm:hidden">Done</span>
          </button>
        ) : (
          <button type="button" className="btn-ghost btn-sm shrink-0" onClick={() => setStatus('open')}>
            Re-open
          </button>
        )}
      </header>

      {watching && (
        <p className="border-b border-sky-100 bg-sky-50 px-4 py-1.5 text-[11px] text-sky-800">
          You are reading this as admin. Any reply you send shows as the Al Mihad Office.
        </p>
      )}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4">
        {data.messages.map((m) => {
          const staffMsg = !LEARNERS.includes(m.from.role);
          return (
            <div key={m._id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 shadow-sm sm:max-w-[75%] ${m.mine ? 'rounded-br-sm bg-maroon text-white' : 'rounded-bl-sm bg-white text-slate-800'}`}>
                <p className={`mb-1 text-[11px] font-semibold ${m.mine ? 'text-white/70' : staffMsg ? 'text-maroon' : 'text-slate-500'}`}>
                  {m.mine ? 'You' : m.from.name}
                  {!m.mine && m.from.role && m.from.role !== 'admin' && <span className="font-normal capitalize"> · {m.from.role === 'teacher' ? 'trainer' : m.from.role}</span>}
                  <span className="font-normal"> · {fmtFull(m.createdAt)}</span>
                </p>
                {m.ref && (
                  <div className={m.mine ? 'text-slate-800' : ''}>
                    <RefCard r={m.ref} onOpenFile={(url, name, page) => setViewer({ url, name, page })} onOpenLink={(url, name) => setLinkViewer({ url, name })} />
                  </div>
                )}
                {m.text && <p className="whitespace-pre-wrap break-words text-sm">{m.text}</p>}
                {m.attachments?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.attachments.map((a) => (
                      <FileLink key={a.url} url={a.url} name={a.name} size={a.size} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="border-t border-slate-200 bg-white p-3">
        {err && <p className="mb-2 rounded bg-red-50 px-3 py-1.5 text-xs text-red-700">{err}</p>}
        {files.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {files.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs">
                {f.name}
                <button type="button" className="text-slate-400 hover:text-red-600" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <label className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-50" title="Attach a file">
            <Icon name="paperclip" className="h-4 w-4" />
            <input
              type="file"
              className="hidden"
              multiple
              onChange={(e) => {
                setFiles((x) => [...x, ...Array.from(e.target.files || [])].slice(0, 5));
                e.target.value = '';
              }}
            />
          </label>
          <textarea
            className="input max-h-40 min-h-[42px] flex-1 resize-y py-2"
            rows={1}
            placeholder={t.kind === 'doubt' && !LEARNERS.includes(me?.role) ? 'Write your answer…' : 'Write a message…'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(e);
            }}
            maxLength={4000}
          />
          <button className="btn-primary h-10 shrink-0" disabled={!!busy || (!text.trim() && !files.length)} aria-label="Send">
            <Icon name="send" className="h-4 w-4" />
            <span className="hidden sm:inline">{busy || 'Send'}</span>
          </button>
        </div>
      </form>

      {viewer && <FileViewerModal url={viewer.url} name={viewer.name} initialPage={viewer.page} onClose={() => setViewer(null)} />}
      {linkViewer && <MediaViewer url={linkViewer.url} title={linkViewer.name} video onClose={() => setLinkViewer(null)} />}
    </div>
  );
}

/** Start a new conversation. */
export function NewMessageDialog({ me, onClose, onCreated }) {
  const [contacts, setContacts] = useState(null);
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [q, setQ] = useState('');
  const [people, setPeople] = useState([]);
  const [person, setPerson] = useState(null);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const role = me?.role;

  useEffect(() => {
    if (role === 'admin') return;
    fetch('/api/messages/contacts', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => (d.ok ? setContacts(d) : setErr(d.error)))
      .catch(() => setErr('Could not load contacts'));
  }, [role]);

  useEffect(() => {
    if (role !== 'admin') return;
    const t = setTimeout(() => {
      fetch(`/api/messages/contacts?q=${encodeURIComponent(q)}`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => d.ok && setPeople(d.people))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q, role]);

  function target() {
    if (LEARNERS.includes(role)) {
      const [k, student, subj] = to.split(':');
      if (k === 't') return { kind: 'trainer', student, subject: subj };
      if (k === 'o') return { kind: 'office', student };
      return null;
    }
    if (role === 'teacher') {
      if (to === 'office') return { kind: 'office' };
      if (to && subject) return { kind: 'student', subject, student: to };
      return null;
    }
    if (!person) return null;
    return person.role === 'teacher' ? { kind: 'teacher', teacher: person._id } : person.role === 'parent' ? { kind: 'parent', parent: person._id } : { kind: 'student', student: person._id };
  }

  async function submit() {
    setErr('');
    const t = target();
    if (!t) return setErr('Choose who to send this to');
    if (text.trim().length < 2) return setErr('Write your message');
    try {
      const attachments = [];
      if (file) {
        setBusy('Uploading…');
        const up = await uploadFile(file, { purpose: 'message' });
        attachments.push({ url: up.url, name: up.fileName || file.name, size: up.size || file.size });
      }
      setBusy('Sending…');
      const r = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'message', to: t, title, text, attachments }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || 'Could not send');
      onCreated(d.thread._id);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  }

  const teacherSubject = contacts?.subjects?.find((s) => s.subject === subject);

  return (
    <Modal
      open
      onClose={onClose}
      title="New message"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={!!busy}>
            <Icon name="send" className="h-4 w-4" /> {busy || 'Send'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {LEARNERS.includes(role) && (
          <label className="block">
            <span className="label">To</span>
            {!contacts ? (
              <p className="text-xs text-slate-500">Loading…</p>
            ) : (
              <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>
                <option value="">Choose…</option>
                {contacts.learners.map((l) => (
                  <optgroup key={l.student} label={contacts.learners.length > 1 ? l.studentName : 'Your trainers'}>
                    {l.subjects.map((s) => (
                      <option key={s.subject} value={`t:${l.student}:${s.subject}`} disabled={!s.teacher}>
                        {s.subjectName} — {s.teacherName || 'no trainer yet'}
                      </option>
                    ))}
                    <option value={`o:${l.student}`}>Al Mihad Office</option>
                  </optgroup>
                ))}
              </select>
            )}
          </label>
        )}

        {role === 'teacher' && (
          <>
            <label className="block">
              <span className="label">To</span>
              <select
                className="input"
                value={to === 'office' ? 'office' : subject ? `s:${subject}` : ''}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'office') {
                    setTo('office');
                    setSubject('');
                  } else {
                    setTo('');
                    setSubject(v.replace(/^s:/, ''));
                  }
                }}
              >
                <option value="">Choose…</option>
                <option value="office">Al Mihad Office</option>
                {contacts?.subjects?.map((s) => (
                  <option key={s.subject} value={`s:${s.subject}`}>
                    A student in {s.subjectName}
                    {s.classRoomName ? ` (${s.classRoomName})` : ''}
                  </option>
                ))}
              </select>
            </label>
            {teacherSubject && (
              <label className="block">
                <span className="label">Student</span>
                <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>
                  <option value="">Choose the student…</option>
                  {teacherSubject.students.map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.name}
                      {u.admissionNo ? ` (${u.admissionNo})` : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}

        {role === 'admin' && (
          <div>
            <span className="label">To</span>
            {person ? (
              <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <span>
                  <b>{person.name}</b> <span className="capitalize text-slate-500">· {person.role === 'teacher' ? 'trainer' : person.role}</span>
                  {person.classRoom?.name ? <span className="text-slate-500"> · {person.classRoom.name}</span> : null}
                </span>
                <button type="button" className="text-xs font-semibold text-maroon" onClick={() => setPerson(null)}>
                  Change
                </button>
              </div>
            ) : (
              <>
                <input className="input" placeholder="Search a student, parent or trainer" value={q} onChange={(e) => setQ(e.target.value)} />
                <ul className="mt-1 max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                  {people.map((p) => (
                    <li key={p._id}>
                      <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => setPerson(p)}>
                        {p.name} <span className="capitalize text-xs text-slate-500">· {p.role === 'teacher' ? 'trainer' : p.role}</span>
                        {p.classRoom?.name ? <span className="text-xs text-slate-500"> · {p.classRoom.name}</span> : null}
                      </button>
                    </li>
                  ))}
                  {!people.length && <li className="px-3 py-2 text-xs text-slate-500">No one found</li>}
                </ul>
              </>
            )}
          </div>
        )}

        <label className="block">
          <span className="label">Subject line (optional)</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        </label>
        <label className="block">
          <span className="label">Message</span>
          <textarea className="input min-h-[120px]" value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} />
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
          <Icon name="paperclip" className="h-4 w-4" /> {file ? file.name : 'Attach a file (optional)'}
          <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>
        {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
        {LEARNERS.includes(role) && (
          <p className="text-[11px] text-slate-500">
            Tip: to ask about a page of your notes, open the notes and select the text or use <b>Snip &amp; ask</b> — the trainer sees exactly what you mean. <Link href="/resources" className="font-semibold text-maroon">Go to Resources</Link>
          </p>
        )}
      </div>
    </Modal>
  );
}

/** Dashboard card: open doubts (trainers & office) or the student's own recent doubts. */
export function DoubtsCard({ me }) {
  const [rows, setRows] = useState(null);
  const learner = LEARNERS.includes(me?.role);
  useEffect(() => {
    if (!me) return;
    const p = learner ? 'kind=doubt' : 'kind=doubt&status=open';
    fetch(`/api/messages?${p}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => d.ok && setRows(d))
      .catch(() => {});
  }, [me, learner]);
  if (!rows || (!learner && !rows.threads.length) || (learner && !rows.threads.length)) return null;
  const items = rows.threads.slice(0, 4);
  return (
    <section className="card mb-6 border-gold/50">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200/80 px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-maroon">
          <Icon name="help" className="h-4 w-4" />
          {learner ? 'My doubts' : `Doubts waiting for an answer (${rows.openDoubts})`}
        </h2>
        <Link href="/messages" className="text-xs font-semibold text-maroon hover:text-gold-600">
          Open →
        </Link>
      </header>
      <ul className="divide-y divide-slate-100">
        {items.map((t) => (
          <ThreadRow key={t._id} t={t} me={me} onClick={() => (window.location.href = `/messages?t=${t._id}`)} />
        ))}
      </ul>
    </section>
  );
}
