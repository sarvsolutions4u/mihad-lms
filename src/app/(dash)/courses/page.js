'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from '@/components/SessionProvider';
import { PageHeader, Spinner, Empty, Modal, Tabs, Badge } from '@/components/ui';
import Icon from '@/components/Icon';
import SubjectPicker from '@/components/course/SubjectPicker';
import { ReviewCard, FeedbackView } from '@/components/course/Players';

async function getJson(url, opts) {
  const r = await fetch(url, { cache: 'no-store', ...opts });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.ok === false) throw new Error(d.error || 'Something went wrong');
  return d;
}

function Progress({ percent }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${percent}%` }} />
    </div>
  );
}

function CourseCard({ c, staff }) {
  const batches = (c.subjects || []).map((s) => `${s.classRoom?.name || ''}${s.name ? ` · ${s.name}` : ''}`);
  return (
    <div className="card flex flex-col p-5">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-maroon text-white">
          <Icon name="courses" className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <Link href={`/courses/${c._id}`} className="text-base font-bold text-slate-800 hover:text-maroon">
            {c.title}
          </Link>
          {c.subtitle && <p className="text-xs text-slate-500">{c.subtitle}</p>}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {c.level && <Badge tone="gold">{c.level}</Badge>}
            {!c.published && <Badge tone="slate">Hidden from students</Badge>}
            {staff && c.toReview > 0 && <Badge tone="amber">{c.toReview} to review</Badge>}
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        {c.units} units · {c.items} activities{c.minutes ? ` · about ${Math.round(c.minutes / 5) * 5} min` : ''}
      </p>
      {staff ? (
        <p className="mt-1 text-xs text-slate-500">{batches.length ? `For: ${batches.join(', ')}` : 'Not linked to a batch yet'}</p>
      ) : (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs text-slate-500">
            <span>
              {c.done} of {c.items} done
            </span>
            <span className="font-semibold text-maroon">{c.percent}%</span>
          </div>
          <Progress percent={c.percent} />
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/courses/${c._id}`} className="btn-primary btn-sm">
          {staff ? 'Open' : c.done ? 'Continue' : 'Start'}
        </Link>
        {staff && c.canManage && (
          <Link href={`/courses/${c._id}/edit`} className="btn-ghost btn-sm">
            Edit
          </Link>
        )}
      </div>
    </div>
  );
}

function NewCourseModal({ onClose, onCreated, role }) {
  const [mode, setMode] = useState('library');
  const [library, setLibrary] = useState(null);
  const [pick, setPick] = useState('');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [level, setLevel] = useState('');
  const [subjects, setSubjects] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    getJson('/api/courses/library')
      .then((d) => {
        setLibrary(d.library);
        if (d.library[0]) setPick(d.library[0].key);
      })
      .catch((e) => setErr(e.message));
  }, []);
  async function create() {
    setErr('');
    setBusy(true);
    try {
      const body = mode === 'library' ? { library: pick, subjects } : { title, subtitle, level, subjects };
      const d = await getJson('/api/courses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      onCreated(d.course._id, mode === 'new');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Add a course"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={create} disabled={busy || (mode === 'library' ? !pick : !title.trim())}>
            {busy ? 'Creating…' : mode === 'library' ? 'Add this course' : 'Create and start editing'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-1 rounded-lg border border-slate-200 p-0.5">
          {[
            ['library', 'Ready-made course'],
            ['new', 'Start a blank course'],
          ].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setMode(k)} className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold ${mode === k ? 'bg-maroon text-white' : 'text-slate-600'}`}>
              {l}
            </button>
          ))}
        </div>
        {mode === 'library' ? (
          !library ? (
            <Spinner />
          ) : (
            <div className="space-y-2">
              {library.map((c) => (
                <label key={c.key} className={`block cursor-pointer rounded-xl border p-4 ${pick === c.key ? 'border-maroon bg-maroon-50' : 'border-slate-200'}`}>
                  <div className="flex items-start gap-3">
                    <input type="radio" name="lib" checked={pick === c.key} onChange={() => setPick(c.key)} className="mt-1" />
                    <div>
                      <p className="font-bold text-slate-800">{c.title}</p>
                      <p className="text-xs text-slate-500">
                        {c.subtitle} · {c.level} · {c.items} activities{c.withAudio ? ' · with voice audio' : ''}
                      </p>
                      <ul className="mt-1.5 list-disc pl-5 text-xs text-slate-600">
                        {c.units.map((u) => (
                          <li key={u.title}>{u.title}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </label>
              ))}
              <p className="text-[11px] text-slate-500">A copy is added to the portal — you can then edit it, add your own audio and files, or add more units.</p>
            </div>
          )
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="label">Course title</span>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Business English — Emails & Calls" />
            </label>
            <label className="block">
              <span className="label">Short description</span>
              <input className="input" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
            </label>
            <label className="block">
              <span className="label">Level</span>
              <input className="input" value={level} onChange={(e) => setLevel(e.target.value)} placeholder="e.g. Intermediate" />
            </label>
          </div>
        )}
        <div>
          <span className="label">Which batches is it for?</span>
          <SubjectPicker value={subjects} onChange={setSubjects} />
          <p className="mt-1 text-[11px] text-slate-500">
            Students in the ticked subjects see the course; the subject’s trainer reviews their speaking practice.
            {role === 'admin' ? ' You can also link batches later.' : ''}
          </p>
        </div>
        {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      </div>
    </Modal>
  );
}

export default function CoursesPage() {
  const { user } = useSession();
  const router = useRouter();
  const staff = ['admin', 'teacher'].includes(user?.role);
  const [courses, setCourses] = useState(null);
  const [tab, setTab] = useState('courses');
  const [attempts, setAttempts] = useState(null);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    getJson('/api/courses')
      .then((d) => setCourses(d.courses))
      .catch((e) => setErr(e.message));
  }, []);
  const loadAttempts = useCallback(() => {
    getJson(`/api/courses/attempts${staff ? '?status=submitted' : ''}`)
      .then((d) => setAttempts(d.attempts))
      .catch((e) => setErr(e.message));
  }, [staff]);

  useEffect(() => {
    if (!user) return;
    load();
    loadAttempts();
  }, [user, load, loadAttempts]);

  if (!user) return <Spinner />;
  const toReview = staff ? attempts?.length || 0 : null;
  const newFeedback = !staff ? (attempts || []).filter((a) => a.status === 'reviewed' && !a.seen).length : 0;

  return (
    <>
      <PageHeader
        title="Courses"
        subtitle={staff ? 'Practice courses for your batches — conversations, listening, notes and short speaking tasks.' : 'Practise between your classes: listen, role-play, and record short speaking tasks for your trainer.'}
      >
        {staff && (
          <button className="btn-primary" onClick={() => setAdding(true)}>
            <Icon name="plus" className="h-4 w-4" /> Add a course
          </button>
        )}
      </PageHeader>
      {err && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

      <Tabs
        tabs={
          staff
            ? [
                { key: 'courses', label: 'Courses' },
                { key: 'review', label: 'Speaking to review', count: toReview },
              ]
            : [
                { key: 'courses', label: 'My courses' },
                { key: 'review', label: 'My speaking feedback', count: newFeedback || null },
              ]
        }
        value={tab}
        onChange={setTab}
      />

      {tab === 'courses' &&
        (!courses ? (
          <Spinner />
        ) : !courses.length ? (
          <div className="card">
            <Empty
              title={staff ? 'No courses yet' : 'No practice courses for you yet'}
              hint={staff ? 'Press “Add a course” to add the ready-made Spoken English course or start your own.' : 'Your trainer will add one soon.'}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {courses.map((c) => (
              <CourseCard key={c._id} c={c} staff={staff} />
            ))}
          </div>
        ))}

      {tab === 'review' &&
        (!attempts ? (
          <Spinner />
        ) : !attempts.length ? (
          <div className="card">
            <Empty title={staff ? 'Nothing waiting — all speaking practice is reviewed' : 'No recordings yet'} hint={staff ? undefined : 'Open a course and try a speaking task.'} />
          </div>
        ) : staff ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {attempts.map((a) => (
              <ReviewCard key={a._id} a={a} showCourse onDone={() => setTimeout(loadAttempts, 800)} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {attempts.map((a) => (
              <div key={a._id} className="card p-4">
                <p className="mb-2 text-sm font-bold text-slate-800">
                  <Link href={`/courses/${a.course?._id}/${a.item}`} className="hover:text-maroon">
                    {a.course?.title} — {a.itemTitle}
                  </Link>
                  {a.status === 'reviewed' && !a.seen && <span className="ml-2 rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold text-maroon-900">NEW</span>}
                </p>
                <FeedbackView a={a} />
              </div>
            ))}
          </div>
        ))}

      {adding && (
        <NewCourseModal
          role={user.role}
          onClose={() => setAdding(false)}
          onCreated={(id, blank) => {
            setAdding(false);
            router.push(blank ? `/courses/${id}/edit` : `/courses/${id}`);
          }}
        />
      )}
    </>
  );
}
