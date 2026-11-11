'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { Spinner, Empty } from '@/components/ui';
import Icon from '@/components/Icon';
import Markdown from '@/components/course/Markdown';
import { ITEM_KINDS, FEEDBACK_TAGS } from '@/lib/courseShared';

/** Trainer guide — the whole course on paper: print it or save it as a PDF. */
export default function CourseGuidePage({ params }) {
  const { id } = use(params);
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    fetch(`/api/courses/${id}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((x) => (x.ok ? setD(x) : setErr(x.error)))
      .catch(() => setErr('Could not load the course'));
  }, [id]);
  if (err) return <Empty title={err} />;
  if (!d) return <Spinner />;
  const c = d.course;
  const all = c.units.flatMap((u) => u.items);
  const minutes = all.reduce((a, i) => a + (i.minutes || 0), 0);
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <div className="guide mx-auto max-w-3xl">
      <style>{`
        @media print {
          aside, header.lg\\:hidden, .no-print { display: none !important; }
          main { padding: 0 !important; }
          body { background: #fff !important; }
          .guide { max-width: none; }
          .guide section { break-inside: avoid-page; }
          .guide .unit { break-before: page; }
          @page { margin: 16mm 14mm; }
        }
      `}</style>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href={`/courses/${id}`} className="text-xs font-semibold text-slate-500 hover:text-maroon">
          ← Back to the course
        </Link>
        <button className="btn-primary" onClick={() => window.print()}>
          <Icon name="download" className="h-4 w-4" /> Print / save as PDF
        </button>
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm print:p-0 print:shadow-none">
        <div className="border-b-4 border-gold pb-4">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold-600">Al Mihad Training Centre · Trainer guide</p>
          <h1 className="mt-1 text-2xl font-bold text-maroon">{c.title}</h1>
          {c.subtitle && <p className="text-sm text-slate-600">{c.subtitle}</p>}
          <p className="mt-2 text-xs text-slate-500">
            {c.level ? `${c.level} · ` : ''}
            {c.units.length} units · {all.length} activities{minutes ? ` · about ${minutes} minutes of student practice` : ''} · printed {today}
          </p>
          {c.subjects?.length > 0 && <p className="mt-1 text-xs text-slate-500">Batches: {c.subjects.map((s) => `${s.classRoom?.name || ''} · ${s.name}${s.teacher?.name ? ` (${s.teacher.name})` : ''}`).join('; ')}</p>}
        </div>

        <section className="mt-5">
          <h2 className="text-base font-bold text-maroon">1. About the course</h2>
          <Markdown text={c.description} />
          {c.howTo?.length > 0 && (
            <>
              <p className="mt-2 text-sm font-semibold text-slate-700">How students use it</p>
              <ol className="list-decimal pl-5 text-sm text-slate-700">
                {c.howTo.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ol>
            </>
          )}
        </section>

        <section className="mt-5">
          <h2 className="text-base font-bold text-maroon">2. The trainer’s role</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>This is a supporting course — the main teaching happens in class. Use it for practice between classes and refer to the units in class.</li>
            <li>
              Check <b>Courses → Speaking to review</b> at least every two days. Each recording is about 1 minute; give <b>1–5 stars</b>, tick a few tips and write one or two lines: one thing done well, and one thing to improve with the correct sentence.
            </li>
            <li>Tips available: {FEEDBACK_TAGS.join(', ')}.</li>
            <li>Each student can send up to 3 recordings per speaking task. Check <b>Student progress</b> weekly and encourage students who have not started.</li>
            <li>Doubts students raise from the notes arrive in <b>Messages &amp; Doubts</b>.</li>
          </ul>
        </section>

        <section className="mt-5">
          <h2 className="text-base font-bold text-maroon">3. Course outline</h2>
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="border border-slate-200 px-2 py-1.5">Unit</th>
                <th className="border border-slate-200 px-2 py-1.5">Activities</th>
              </tr>
            </thead>
            <tbody>
              {c.units.map((u) => (
                <tr key={u._id}>
                  <td className="border border-slate-200 px-2 py-1.5 align-top">
                    <b>{u.title}</b>
                    {u.summary && <div className="text-xs text-slate-500">{u.summary}</div>}
                  </td>
                  <td className="border border-slate-200 px-2 py-1.5 align-top text-slate-700">
                    {u.items.map((it) => (
                      <div key={it._id}>
                        {ITEM_KINDS[it.kind]?.label}: {it.title}
                        {it.minutes ? ` (${it.minutes} min)` : ''}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {c.units.map((u, ui) => (
          <section key={u._id} className="unit mt-8">
            <h2 className="border-b border-slate-200 pb-1 text-lg font-bold text-maroon">
              {ui + 4}. {u.title}
            </h2>
            {u.summary && <p className="mt-1 text-sm text-slate-600">{u.summary}</p>}
            {u.items.map((it) => (
              <div key={it._id} className="mt-4">
                <h3 className="text-sm font-bold text-slate-800">
                  {ITEM_KINDS[it.kind]?.label}: {it.title}
                </h3>
                {it.kind === 'conversation' && (
                  <>
                    {it.body && <p className="text-xs italic text-slate-500">{it.body}</p>}
                    <table className="mt-1 w-full text-sm">
                      <tbody>
                        {it.lines.map((l, i) => (
                          <tr key={i}>
                            <td className="w-28 py-0.5 pr-2 align-top font-semibold text-slate-600">{l.speaker}</td>
                            <td className="py-0.5 text-slate-800">{l.text}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {it.audio && <p className="text-xs text-slate-500">Includes the trainer’s full recording: {it.audioName}</p>}
                  </>
                )}
                {it.kind === 'notes' && <Markdown text={it.body} />}
                {it.kind === 'audio' && (
                  <>
                    <p className="text-xs text-slate-500">Audio: {it.audioName || 'uploaded recording'}</p>
                    {it.body && <Markdown text={it.body} />}
                  </>
                )}
                {it.kind === 'file' && <p className="text-xs text-slate-500">File: {it.file?.name || '—'}</p>}
                {it.kind === 'speaking' && (
                  <div className="mt-1 rounded border border-gold/60 bg-gold-50/50 p-2">
                    <Markdown text={it.prompt} />
                    {it.tips && <p className="text-xs text-slate-600">Tip: {it.tips}</p>}
                    <p className="text-xs text-slate-500">Recording up to {Math.round((it.maxSecs || 90) / 6) / 10} min · reviewed by the trainer.</p>
                  </div>
                )}
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
