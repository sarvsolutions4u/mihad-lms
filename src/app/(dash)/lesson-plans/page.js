'use client';

import { useEffect, useMemo, useState } from 'react';
import { list, update, remove, fmtDate, todayISO, weekStartISO } from '@/lib/client';
import { useSession } from '@/components/SessionProvider';
import { useLookups } from '@/lib/useLookups';
import { PageHeader, Select, Alert, Spinner, Empty, Badge } from '@/components/ui';
import { addDaysISO, programLabel, programTone } from '@/lib/programs';
import { SessionChip, PlanModal, EditSessionModal, SessionRegister, SessionDetail } from '@/components/Sessions';
import MarksModal from '@/components/MarksModal';

const monthStart = (iso) => `${iso.slice(0, 7)}-01`;
const monthEnd = (iso) => {
  const d = new Date(`${monthStart(iso)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
};
const shiftMonth = (iso, n) => {
  const d = new Date(`${monthStart(iso)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};
const dayName = (iso, style = 'short') => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: style, timeZone: 'UTC' });

export default function LessonPlannerPage() {
  const { user } = useSession();
  const uid = String(user?._id || user?.id || '');
  const canEdit = user?.role === 'admin' || user?.role === 'teacher';
  const { classes, subjects, loading: lookLoading } = useLookups();

  const [view, setView] = useState('week');
  const [anchor, setAnchor] = useState(todayISO());
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [sessions, setSessions] = useState([]);
  const [myAtt, setMyAtt] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [planning, setPlanning] = useState(false);
  const [open, setOpen] = useState(null);
  const [editing, setEditing] = useState(null);
  const [registerFor, setRegisterFor] = useState(null);
  const [marksFor, setMarksFor] = useState(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('subject')) setSubjectId(q.get('subject'));
    if (q.get('view') === 'month') setView('month');
    try {
      const v = localStorage.getItem('planner.view');
      if (!q.get('view') && (v === 'week' || v === 'month')) setView(v);
    } catch {}
  }, []);

  const range = useMemo(() => {
    if (view === 'week') {
      const from = weekStartISO(anchor);
      return { from, to: addDaysISO(from, 6) };
    }
    return { from: monthStart(anchor), to: monthEnd(anchor) };
  }, [view, anchor]);

  const mySubjects = useMemo(
    () => subjects.filter((s) => user?.role !== 'teacher' || String(s.teacher?._id || s.teacher) === uid),
    [subjects, user, uid]
  );
  const programOf = (sid) => subjects.find((s) => s._id === sid)?.classRoom?.programType || 'academic';

  async function load() {
    setLoading(true);
    try {
      const date = `${range.from}..${range.to}`;
      const r = await list('lessonplans', {
        date,
        classRoom: classId || undefined,
        subject: subjectId || undefined,
        sort: 'date startTime',
        limit: 1000,
      });
      setSessions(r.items);
      if (!canEdit) {
        const a = await list('attendance', { date, limit: 1000 }).catch(() => ({ items: [] }));
        const learners = new Set(a.items.map((x) => String(x.student?._id || x.student)));
        setMyAtt(learners.size === 1 ? Object.fromEntries(a.items.filter((x) => x.lessonPlan).map((x) => [String(x.lessonPlan), x.status])) : {});
      }
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!lookLoading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to, classId, subjectId, lookLoading]);

  useEffect(() => {
    try {
      localStorage.setItem('planner.view', view);
    } catch {}
  }, [view]);

  const byDate = useMemo(() => {
    const m = {};
    for (const s of sessions) (m[s.date] ||= []).push(s);
    return m;
  }, [sessions]);

  const stats = useMemo(() => {
    const live = sessions.filter((s) => s.status !== 'missed' && s.kind !== 'holiday');
    return {
      planned: live.length,
      done: live.filter((s) => s.status === 'done').length,
      tests: live.filter((s) => s.kind === 'test').length,
    };
  }, [sessions]);

  async function toggle(s, field) {
    try {
      const r = await update('lessonplans', s._id, { [field]: !s[field] });
      const next = { ...s, ...r.item, subject: s.subject, classRoom: s.classRoom, teacher: s.teacher, students: s.students };
      setSessions((xs) => xs.map((x) => (x._id === s._id ? next : x)));
      setOpen(next);
    } catch (e) {
      setError(e.message);
    }
  }

  const step = (n) => setAnchor(view === 'week' ? addDaysISO(anchor, 7 * n) : shiftMonth(anchor, n));
  const label =
    view === 'week'
      ? `${fmtDate(range.from)} – ${fmtDate(range.to)}`
      : new Date(`${range.from}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const today = todayISO();

  if (lookLoading) return <Spinner />;

  const subjectOptions = (canEdit ? mySubjects : subjects)
    .filter((s) => !classId || String(s.classRoom?._id || s.classRoom) === String(classId))
    .map((s) => ({ value: s._id, label: `${s.name}${classId ? '' : ` — ${s.classRoom?.name || ''}`}` }));
  const selectedProgram = subjectId ? programOf(subjectId) : classId ? classes.find((c) => c._id === classId)?.programType : null;

  const days = [];
  for (let d = range.from; d <= range.to; d = addDaysISO(d, 1)) days.push(d);

  return (
    <>
      <PageHeader
        title="Lesson planner"
        subtitle={
          canEdit
            ? 'Plan each class, work session and test by date. Attendance is marked against these sessions.'
            : 'What is planned for each class day — topics, work and tests.'
        }
      >
        {canEdit && (
          <Select
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setSubjectId('');
            }}
            options={classes.map((c) => ({ value: c._id, label: c.name }))}
            placeholder="All batches"
          />
        )}
        <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} options={subjectOptions} placeholder="All subjects" />
        {canEdit && (
          <button className="btn-primary" onClick={() => setPlanning(true)} disabled={!mySubjects.length}>
            Plan sessions
          </button>
        )}
      </PageHeader>

      <Alert onClose={() => setError('')}>{error}</Alert>
      <Alert tone="success" onClose={() => setNotice('')}>
        {notice}
      </Alert>

      <div className="card mb-5 flex flex-wrap items-center gap-3 p-3">
        <div className="flex rounded-lg border border-slate-200 p-0.5">
          {['week', 'month'].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize ${view === v ? 'bg-maroon text-white' : 'text-slate-600'}`}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className="btn-ghost btn-sm" onClick={() => step(-1)} aria-label="Previous">
            ←
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setAnchor(todayISO())}>
            Today
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => step(1)} aria-label="Next">
            →
          </button>
        </div>
        <p className="text-sm font-bold text-maroon">{label}</p>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {selectedProgram && <Badge tone={programTone(selectedProgram)}>{programLabel(selectedProgram)}</Badge>}
          <span>
            {stats.planned} session{stats.planned === 1 ? '' : 's'} · {stats.done} done{stats.tests ? ` · ${stats.tests} test${stats.tests === 1 ? '' : 's'}` : ''}
          </span>
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : view === 'week' ? (
        <>
        {!sessions.length && (
          <p className="mb-3 text-sm text-slate-500 lg:hidden">
            Nothing planned this week.{' '}
            <button type="button" className="font-semibold text-maroon underline" onClick={() => step(1)}>
              Next week →
            </button>
          </p>
        )}
        <div className="grid gap-3 lg:grid-cols-7">
          {days.map((d) => (
            <div
              key={d}
              className={`rounded-xl border p-2 ${d === today ? 'border-maroon/40 bg-maroon-50/30' : 'border-slate-200 bg-white/60'} ${
                !byDate[d]?.length && d !== today ? 'hidden lg:block' : ''
              }`}
            >
              <p className={`mb-2 px-1 text-xs font-bold uppercase tracking-wide ${d === today ? 'text-maroon' : 'text-slate-500'}`}>
                {dayName(d)} <span className="font-semibold normal-case">{fmtDate(d).replace(/ \d{4}$/, '')}</span>
              </p>
              <div className="space-y-2">
                {(byDate[d] || []).map((s) => (
                  <SessionChip key={s._id} s={s} onOpen={setOpen} myStatus={myAtt[s._id]} />
                ))}
                {!byDate[d]?.length && <p className="px-1 pb-1 text-[11px] text-slate-300">—</p>}
              </div>
            </div>
          ))}
        </div>
        </>
      ) : sessions.length ? (
        <div className="space-y-3">
          {days
            .filter((d) => byDate[d]?.length)
            .map((d) => (
              <div key={d} className={`card grid gap-3 p-3 sm:grid-cols-[9rem_1fr] ${d === today ? 'ring-1 ring-maroon/40' : ''}`}>
                <div className="px-1">
                  <p className="text-sm font-bold text-maroon">{fmtDate(d)}</p>
                  <p className="text-xs text-slate-500">{dayName(d, 'long')}</p>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {byDate[d].map((s) => (
                    <SessionChip key={s._id} s={s} onOpen={setOpen} myStatus={myAtt[s._id]} />
                  ))}
                </div>
              </div>
            ))}
        </div>
      ) : (
        <Empty title="Nothing planned this month" hint={canEdit ? 'Use “Plan sessions” to add classes, work and tests.' : undefined} />
      )}

      <PlanModal
        open={planning}
        onClose={() => setPlanning(false)}
        subjects={mySubjects}
        defaultSubject={subjectId}
        programOf={programOf}
        onSaved={(msg) => {
          setPlanning(false);
          setNotice(msg);
          load();
        }}
      />

      {open && (
        <SessionDetail
          session={open}
          canEdit={canEdit && (user?.role === 'admin' || String(open.teacher?._id || open.teacher) === uid || mySubjects.some((s) => s._id === (open.subject?._id || open.subject)))}
          myStatus={myAtt[open._id]}
          onClose={() => setOpen(null)}
          onEdit={() => {
            setEditing(open);
            setOpen(null);
          }}
          onRegister={() => {
            setRegisterFor(open._id);
            setOpen(null);
          }}
          onMarks={() => {
            setMarksFor(open);
            setOpen(null);
          }}
          onToggle={(field) => toggle(open, field)}
          onDelete={async () => {
            try {
              await remove('lessonplans', open._id);
              setOpen(null);
              setNotice('Session deleted');
              load();
            } catch (e) {
              setError(e.message);
            }
          }}
        />
      )}

      <EditSessionModal
        session={editing}
        onClose={() => setEditing(null)}
        onSaved={(msg) => {
          setEditing(null);
          setNotice(msg);
          load();
        }}
        onError={setError}
      />

      {registerFor && (
        <SessionRegister
          sessionId={registerFor}
          onClose={() => {
            setRegisterFor(null);
            load();
          }}
          onSaved={setNotice}
        />
      )}

      <MarksModal
        plan={marksFor}
        canEdit={canEdit}
        onClose={() => setMarksFor(null)}
        onSaved={() => {
          setMarksFor(null);
          setNotice('Marks saved');
        }}
        onError={setError}
      />
    </>
  );
}
