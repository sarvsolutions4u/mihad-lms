'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Icon from './Icon';
import { uploadFile } from '@/lib/upload';

export const fmtTime = (s) => {
  const n = Math.max(0, Math.floor(Number(s) || 0));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const sec = String(n % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

/** "12:34" / "1:02:03" / "754" → seconds (or null) */
const parseTime = (v) => {
  const t = String(v || '').trim();
  if (!t) return null;
  if (!/^\d+(:\d{1,2}){0,2}$/.test(t)) return null;
  return t.split(':').reduce((a, x) => a * 60 + Number(x), 0);
};

/**
 * "Raise a doubt" — opened from the file viewer with whatever the student
 * selected (text), snipped (picture) or was watching (video time). It goes to
 * the trainer of the subject that file belongs to, or to the office.
 *
 * ask = { fileId, fileName, page?, seconds?, quote?, snip?: { blob, dataUrl }, askTime? }
 */
export default function DoubtDialog({ ask, onClose }) {
  const [contacts, setContacts] = useState(null);
  const [to, setTo] = useState('');
  const [text, setText] = useState('');
  const [quote, setQuote] = useState(ask.quote || '');
  const [snip, setSnip] = useState(ask.snip || null);
  const [time, setTime] = useState(ask.seconds != null ? fmtTime(ask.seconds) : '');
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(null);

  useEffect(() => {
    let alive = true;
    const q = ask.fileId ? `?file=${ask.fileId}` : ask.link ? `?link=${encodeURIComponent(ask.link)}` : '';
    fetch(`/api/messages/contacts${q}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (!d.ok) throw new Error(d.error);
        setContacts(d);
        const sug = d.suggested;
        if (sug) setTo(`t:${sug.student}:${sug.subject}`);
        else {
          const all = (d.learners || []).flatMap((l) => l.subjects.filter((s) => s.teacher).map((s) => `t:${l.student}:${s.subject}`));
          if (all.length === 1) setTo(all[0]);
        }
      })
      .catch((e) => alive && setErr(e.message || 'Could not load your trainers'));
    return () => {
      alive = false;
    };
  }, [ask.fileId, ask.link]);

  // Escape closes only this dialog, not the viewer underneath
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const options = useMemo(() => {
    if (!contacts?.learners) return [];
    const many = contacts.learners.length > 1;
    const out = [];
    for (const l of contacts.learners) {
      for (const s of l.subjects) {
        out.push({
          value: `t:${l.student}:${s.subject}`,
          label: `${many ? `${l.studentName} — ` : ''}${s.subjectName}${s.classRoomName ? ` (${s.classRoomName})` : ''} — ${s.teacherName || 'no trainer yet'}`,
          disabled: !s.teacher,
          teacherName: s.teacherName,
          subjectName: s.subjectName,
        });
      }
      out.push({ value: `o:${l.student}`, label: `${many ? `${l.studentName} — ` : ''}Al Mihad Office`, teacherName: 'the Al Mihad office' });
    }
    return out;
  }, [contacts]);
  const chosen = options.find((o) => o.value === to);

  async function send(e) {
    e.preventDefault();
    setErr('');
    if (!to) return setErr('Choose who should answer — the trainer of your subject, or the office');
    if (text.trim().length < 3) return setErr('Write your question — what exactly is not clear?');
    let seconds = null;
    if (time) {
      seconds = parseTime(time);
      if (seconds == null) return setErr('Write the video time like 12:30');
    }
    try {
      const ref = { fileId: ask.fileId, link: ask.link, fileName: ask.fileName, page: ask.page, quote: quote || undefined };
      if (seconds != null) ref.seconds = seconds;
      if (snip?.blob) {
        setBusy('Uploading the snip…');
        const up = await uploadFile(new File([snip.blob], `snip${ask.page ? `-page-${ask.page}` : ''}.jpg`, { type: 'image/jpeg' }), { purpose: 'message' });
        ref.image = up.url;
      }
      const attachments = [];
      if (photo) {
        setBusy('Uploading your photo…');
        const up = await uploadFile(photo, { purpose: 'message' });
        attachments.push({ url: up.url, name: up.fileName || photo.name, size: up.size || photo.size });
      }
      setBusy('Sending…');
      const [kind, student, subject] = to.split(':');
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'doubt',
          to: kind === 't' ? { kind: 'trainer', student, subject } : { kind: 'office', student },
          text,
          ref,
          attachments,
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d.error || 'Could not send');
      setSent({ id: d.thread._id, to: chosen?.teacherName || 'your trainer' });
      window.dispatchEvent(new Event('messages:changed'));
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy('');
    }
  }

  const where = [ask.fileName, ask.page ? `page ${ask.page}` : '', ask.seconds != null && !ask.askTime ? `at ${fmtTime(ask.seconds)}` : ''].filter(Boolean).join(' · ');

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Raise a doubt">
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <header className="flex items-center gap-2 border-b border-slate-200 px-5 py-3.5">
          <Icon name="help" className="h-5 w-5 text-maroon" />
          <h3 className="flex-1 text-base font-bold text-maroon">{sent ? 'Doubt sent' : 'Raise a doubt'}</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-xl text-slate-400 hover:bg-slate-100" aria-label="Close">
            ×
          </button>
        </header>

        {sent ? (
          <div className="space-y-4 px-5 py-6 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-700">
              <Icon name="check" className="h-6 w-6" />
            </div>
            <p className="text-sm text-slate-700">
              Your doubt has gone to <b>{sent.to}</b>. You’ll see the answer under <b>Messages &amp; Doubts</b>.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <button className="btn-ghost" onClick={onClose}>
                Back to the notes
              </button>
              <Link className="btn-primary" href={`/messages?t=${sent.id}`}>
                Open the conversation
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={send} className="space-y-4 px-5 py-4">
            {where && (
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <Icon name="file" className="h-3.5 w-3.5" /> {where}
              </p>
            )}
            {quote && (
              <div className="relative rounded-lg border-l-4 border-gold bg-gold-50/60 py-2 pl-3 pr-8 text-sm text-slate-700">
                <p className="max-h-32 overflow-y-auto whitespace-pre-wrap">“{quote}”</p>
                <button type="button" onClick={() => setQuote('')} className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded text-slate-400 hover:bg-white" aria-label="Remove the selected text">
                  ×
                </button>
              </div>
            )}
            {snip && (
              <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={snip.dataUrl} alt="The part you snipped" className="mx-auto max-h-56 object-contain" />
                <button type="button" onClick={() => setSnip(null)} className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-slate-500 shadow" aria-label="Remove the snip">
                  ×
                </button>
              </div>
            )}

            <label className="block">
              <span className="label">Send to</span>
              {!contacts && !err ? (
                <p className="text-xs text-slate-500">Loading your trainers…</p>
              ) : (
                <select className="input" value={to} onChange={(e) => setTo(e.target.value)} required>
                  <option value="">Choose the subject…</option>
                  {options.map((o) => (
                    <option key={o.value} value={o.value} disabled={o.disabled}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
              {contacts?.suggested && to === `t:${contacts.suggested.student}:${contacts.suggested.subject}` && (
                <span className="mt-1 block text-[11px] text-emerald-700">Picked automatically — this file is from {chosen?.subjectName}.</span>
              )}
            </label>

            {ask.askTime && (
              <label className="block">
                <span className="label">Time in the video (optional)</span>
                <input className="input" value={time} onChange={(e) => setTime(e.target.value)} placeholder="e.g. 12:30" inputMode="numeric" />
              </label>
            )}

            <label className="block">
              <span className="label">Your question</span>
              <textarea
                className="input min-h-[110px]"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={quote || snip ? 'What is not clear about this part?' : 'Describe your doubt…'}
                maxLength={4000}
                autoFocus
              />
            </label>

            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
              <Icon name="paperclip" className="h-4 w-4" />
              {photo ? photo.name : 'Add a photo of your working (optional)'}
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
              {photo && (
                <button type="button" className="text-slate-400 hover:text-red-600" onClick={() => setPhoto(null)}>
                  remove
                </button>
              )}
            </label>

            {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button type="button" className="btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button className="btn-primary" disabled={!!busy}>
                <Icon name="send" className="h-4 w-4" /> {busy || 'Send doubt'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
