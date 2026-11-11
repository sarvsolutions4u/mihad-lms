'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from '@/components/SessionProvider';
import { Spinner, Empty, Tabs, Badge } from '@/components/ui';
import Icon from '@/components/Icon';
import Markdown from '@/components/course/Markdown';
import { ReviewCard, FeedbackView } from '@/components/course/Players';
import { ITEM_KINDS } from '@/lib/courseShared';

async function getJson(url) {
  const r = await fetch(url, { cache: 'no-store' });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.ok === false) throw new Error(d.error || 'Something went wrong');
  return d;
}

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { timeZone: 'Asia/Dubai', day: '2-digit', month: 'short' }) : '—');

export default function CoursePage({ params }) {
  const { id } = use(params);
  const { user } = useSession();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('contents');
  const [attempts, setAttempts] = useState(null);
  const [students, setStudents] = useState(null);
  const staff = ['admin', 'teacher'].includes(user?.role);

  const load = useCallback(() => {
    getJson(`/api/courses/${id}`)
      .then(setData)
      .catch((e) => setErr(e.message));
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!data?.canManage) return;
    if (tab === 'review') getJson(`/api/courses/${id}/attempts`).then((d) => setAttempts(d.attempts)).catch((e) => setErr(e.message));
    if (tab === 'students') getJson(`/api/courses/${id}/students`).then(setStudents).catch((e) => setErr(e.message));
  }, [tab, id, data?.canManage]);

  if (err && !data) return <Empty title={err} />;
  if (!data || !user) return <Spinner />;
  const { course, progress } = data;
  const all = course.units.flatMap((u) => u.items);
  const done = new Set(progress?.done || []);
  const nextItem =
    (progress?.lastItem && all.slice(all.findIndex((i) => i._id === progress.lastItem) + 1).find((i) => !done.has(i._id))) ||
    all.find((i) => !done.has(i._id)) ||
    all[0];
  const minutes = all.reduce((a, i) => a + (i.minutes || 0), 0);
  const recordings = (data.attempts || []).length;

  return (
    <>
      <Link href="/courses" className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-maroon">
        ← All courses
      </Link>

      <section className="card mb-5 overflow-hidden">
        <div className="bg-gradient-to-br from-maroon to-maroon-900 px-6 py-6 text-white">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              {course.category && <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">{course.category}</p>}
              <h1 className="mt-1 text-2xl font-bold">{course.title}</h1>
              {course.subtitle && <p className="mt-1 text-sm text-maroon-100/90">{course.subtitle}</p>}
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/80">
                {course.level && <span className="rounded-full bg-white/15 px-2.5 py-1">{course.level}</span>}
                <span className="rounded-full bg-white/15 px-2.5 py-1">
                  {course.units.length} units · {all.length} activities
                </span>
                {minutes > 0 && <span className="rounded-full bg-white/15 px-2.5 py-1">about {Math.round(minutes / 5) * 5} minutes</span>}
                {!course.published && <span className="rounded-full bg-amber-400/90 px-2.5 py-1 text-amber-950">Hidden from students</span>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {!staff && nextItem && (
                <Link href={`/courses/${id}/${nextItem._id}`} className="btn bg-gold font-bold text-maroon-900 hover:bg-gold-400">
                  <Icon name="play" className="h-4 w-4" /> {done.size ? 'Continue' : 'Start the course'}
                </Link>
              )}
              {data.canManage && (
                <Link href={`/courses/${id}/edit`} className="btn border border-white/40 text-white hover:bg-white/10">
                  Edit course
                </Link>
              )}
              {staff && (
                <Link href={`/courses/${id}/guide`} className="btn border border-white/40 text-white hover:bg-white/10">
                  <Icon name="file" className="h-4 w-4" /> Trainer guide
                </Link>
              )}
            </div>
          </div>
          {progress && (
            <div className="mt-5">
              <div className="mb-1 flex justify-between text-xs text-white/80">
                <span>
                  Your progress: {done.size} of {all.length} activities
                  {progress.practiceSecs ? ` · ${Math.round(progress.practiceSecs / 60)} min of practice` : ''}
                </span>
                <span className="font-bold text-gold">{progress.percent}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-white/20">
                <div className="h-full rounded-full bg-gold" style={{ width: `${progress.percent}%` }} />
              </div>
            </div>
          )}
        </div>
        <div className="grid gap-5 px-6 py-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">About this course</p>
            <Markdown text={course.description || 'No description yet.'} />
          </div>
          <div>
            {course.howTo?.length > 0 && (
              <>
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">How to use it</p>
                <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
                  {course.howTo.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ol>
              </>
            )}
            {staff && (
              <p className="mt-3 text-xs text-slate-500">
                For:{' '}
                {course.subjects.length
                  ? course.subjects.map((s) => `${s.classRoom?.name || ''} · ${s.name}${s.teacher?.name ? ` (${s.teacher.name})` : ''}`).join(', ')
                  : 'no batch linked yet — Edit course to link one'}
              </p>
            )}
          </div>
        </div>
      </section>

      <Tabs
        tabs={[
          { key: 'contents', label: 'Contents' },
          ...(staff
            ? data.canManage
              ? [
                  { key: 'review', label: 'Speaking to review', count: data.toReview },
                  { key: 'students', label: 'Student progress' },
                ]
              : []
            : [{ key: 'practice', label: 'My speaking practice', count: recordings || null }]),
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'contents' && (
        <div className="space-y-4">
          {course.units.map((u, ui) => {
            const unitDone = u.items.filter((i) => done.has(i._id)).length;
            return (
              <section key={u._id} className="card">
                <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
                  <div>
                    <h2 className="text-sm font-bold text-maroon">{u.title}</h2>
                    {u.summary && <p className="text-xs text-slate-500">{u.summary}</p>}
                  </div>
                  {progress && (
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${unitDone === u.items.length && u.items.length ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {unitDone}/{u.items.length}
                    </span>
                  )}
                </header>
                {u.items.length ? (
                  <ul className="divide-y divide-slate-100">
                    {u.items.map((it) => {
                      const k = ITEM_KINDS[it.kind] || ITEM_KINDS.notes;
                      const isDone = done.has(it._id);
                      return (
                        <li key={it._id}>
                          <Link href={`/courses/${id}/${it._id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${isDone ? 'bg-emerald-100 text-emerald-700' : it.kind === 'speaking' ? 'bg-gold-50 text-gold-600' : 'bg-maroon-50 text-maroon'}`}>
                              <Icon name={isDone ? 'check' : k.icon} className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-slate-800">{it.title}</span>
                              <span className="text-xs text-slate-500">
                                {k.label}
                                {it.minutes ? ` · ${it.minutes} min` : ''}
                              </span>
                            </span>
                            <span className="text-slate-300">›</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="px-5 py-4 text-sm text-slate-500">Nothing in this unit yet.</p>
                )}
              </section>
            );
          })}
          {!course.units.length && (
            <div className="card">
              <Empty title="This course is empty" hint={data.canManage ? 'Press Edit course to add units and activities.' : undefined} />
            </div>
          )}
        </div>
      )}

      {tab === 'practice' &&
        (!recordings ? (
          <div className="card">
            <Empty title="No recordings yet" hint="Each unit ends with a short speaking task — record it and your trainer will reply." />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {data.attempts.map((a) => (
              <div key={a._id} className="card p-4">
                <p className="mb-2 text-sm font-bold text-slate-800">
                  <Link href={`/courses/${id}/${a.item}`} className="hover:text-maroon">
                    {a.itemTitle}
                  </Link>
                </p>
                <FeedbackView a={a} />
              </div>
            ))}
          </div>
        ))}

      {tab === 'review' &&
        (!attempts ? (
          <Spinner />
        ) : !attempts.length ? (
          <div className="card">
            <Empty title="No speaking practice yet" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {attempts.map((a) => (
              <ReviewCard key={a._id} a={a} onDone={load} />
            ))}
          </div>
        ))}

      {tab === 'students' &&
        (!students ? (
          <Spinner />
        ) : !students.students.length ? (
          <div className="card">
            <Empty title="No students yet" hint="Link the course to a batch (Edit course) — its students appear here." />
          </div>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm sm:min-w-[720px]">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2.5">Student</th>
                  <th className="px-3 py-2.5">Progress</th>
                  <th className="hidden sm:table-cell px-3 py-2.5 text-right">Practice</th>
                  <th className="px-3 py-2.5 text-right">Rec<span className="hidden sm:inline">ordings</span></th>
                  <th className="hidden sm:table-cell px-3 py-2.5 text-right">Avg rating</th>
                  <th className="hidden sm:table-cell px-5 py-2.5 text-right">Last active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.students.map((s) => (
                  <tr key={s._id}>
                    <td className="px-5 py-2.5">
                      <Link href={`/students/${s._id}`} className="font-semibold text-slate-800 hover:text-maroon">
                        {s.name}
                      </Link>
                      <p className="text-xs text-slate-400">{s.classRoom}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-16 overflow-hidden rounded-full bg-slate-100 sm:w-28">
                          <div className="h-full rounded-full bg-gold" style={{ width: `${s.percent}%` }} />
                        </div>
                        <span className="text-xs text-slate-600">
                          {s.done}/{students.items}
                        </span>
                      </div>
                    </td>
                    <td className="hidden sm:table-cell px-3 py-2.5 text-right">{s.practiceMins ? `${s.practiceMins} min` : '—'}</td>
                    <td className="px-3 py-2.5 text-right">
                      {s.recordings || '—'}
                      {s.recordings > s.reviewed && <Badge tone="amber">{s.recordings - s.reviewed} new</Badge>}
                    </td>
                    <td className="hidden sm:table-cell px-3 py-2.5 text-right">{s.avgRating ? `${s.avgRating} ★` : '—'}</td>
                    <td className="hidden sm:table-cell px-5 py-2.5 text-right text-xs text-slate-500">{fmtDate(s.lastAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </>
  );
}
