'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, list, create, update, remove, fmtDate, todayISO } from '@/lib/client';
import { KINDS, kindOf, WEEKDAYS, addDaysISO, datesOnDays, fmtRange, programLabel } from '@/lib/programs';
import { Modal, Field, Select, Badge, Alert, Spinner, Empty, FileList, FileLink, Confirm } from '@/components/ui';
import { STATUSES } from '@/components/AttendanceRegister';

const STATUS_LABEL = { scheduled: 'Planned', done: 'Done', missed: 'Missed', cancelled: 'No class' };
const STATUS_TONE = { scheduled: 'slate', done: 'green', missed: 'red', cancelled: 'slate' };

/* ------------------------------------------------------------------ */
/* One session, compact                                                 */
/* ------------------------------------------------------------------ */

export function SessionChip({ s, onOpen, showSubject = true, myStatus }) {
  const k = kindOf(s.kind);
  return (
    <button
      type="button"
      onClick={() => onOpen?.(s)}
      className={`w-full rounded-lg border px-3 py-2 text-left transition-colors hover:border-maroon/40 hover:bg-maroon-50/40 ${
        s.status === 'cancelled' || s.status === 'missed' ? 'border-dashed border-slate-300 bg-slate-50' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={k.tone}>{k.label}</Badge>
        {s.startTime && <span className="text-[11px] font-semibold text-slate-500">{fmtRange(s.startTime, s.endTime)}</span>}
        {s.status !== 'scheduled' && s.kind !== 'holiday' && <Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge>}
        {myStatus && (
          <Badge tone={STATUSES.find((x) => x.value === myStatus)?.tone}>{myStatus}</Badge>
        )}
      </div>
      <p className={`mt-1 text-sm font-semibold ${s.status === 'missed' ? 'text-slate-500' : 'text-slate-800'}`}>{s.title}</p>
      {showSubject && (
        <p className="truncate text-[11px] text-slate-500">
          {s.subject?.name}
          {s.classRoom?.name ? ` · ${s.classRoom.name}` : ''}
          {s.students?.length ? ` · ${s.students.map((x) => x.name || '1 student').join(', ')}` : ''}
        </p>
      )}
      {s.pushedFrom && s.status === 'scheduled' && <p className="text-[10px] text-amber-700">Moved from {fmtDate(s.pushedFrom)}</p>}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Plan several sessions at once                                        */
/* ------------------------------------------------------------------ */

export function PlanModal({ open, onClose, subjects, defaultSubject, onSaved, programOf }) {
  const tomorrow = addDaysISO(todayISO(), 1);
  const [subject, setSubject] = useState('');
  const [student, setStudent] = useState('');
  const [students, setStudents] = useState([]);
  const [mode, setMode] = useState('repeat');
  const [one, setOne] = useState(tomorrow);
  const [days, setDays] = useState(['Monday', 'Wednesday']);
  const [from, setFrom] = useState(tomorrow);
  const [to, setTo] = useState(addDaysISO(tomorrow, 27));
  const [startTime, setStart] = useState('');
  const [endTime, setEnd] = useState('');
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) {
      setSubject(defaultSubject || subjects[0]?._id || '');
      setRows([]);
      setErr('');
      setStudent('');
    }
  }, [open, defaultSubject, subjects]);

  const program = programOf(subject);
  const shortTerm = program === 'short_term';

  useEffect(() => {
    if (!subject || !shortTerm) return setStudents([]);
    list('users', { role: 'student', enrolledIn: subject, sort: 'name', limit: 500 })
      .then((r) => setStudents(r.items))
      .catch(() => setStudents([]));
  }, [subject, shortTerm]);

  const dates = mode === 'one' ? (one ? [one] : []) : datesOnDays(from, to, days);

  function buildRows() {
    setErr('');
    if (!dates.length) return setErr('No dates — pick the days and the date range.');
    if (dates.length > 400) return setErr('Too many dates — plan up to 400 at a time.');
    setRows(dates.map((d, i) => rows.find((r) => r.date === d) || { date: d, kind: 'class', title: '', portion: '', maxMarks: '', _k: `${d}-${i}` }));
  }

  async function save() {
    setErr('');
    if (!subject) return setErr('Choose a subject');
    const sessions = (rows.length ? rows : dates.map((d) => ({ date: d, kind: 'class', title: '', portion: '' }))).map((r) => ({
      ...r,
      startTime,
      endTime,
    }));
    if (!sessions.length) return setErr('No sessions to save');
    if (!shortTerm && sessions.some((r) => r.kind !== 'holiday' && !String(r.title || '').trim())) {
      return setErr('Enter the topic / work for every session (or set it to “No class”).');
    }
    setBusy(true);
    try {
      const r = await api.post('/api/sessions', { subject, students: student ? [student] : [], sessions });
      onSaved(`${r.created} session${r.created === 1 ? '' : 's'} planned (${fmtDate(r.first)} – ${fmtDate(r.last)})`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const setRow = (i, patch) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Plan sessions"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : `Save ${rows.length || dates.length || ''} session${(rows.length || dates.length) === 1 ? '' : 's'}`}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Subject / course">
            <Select
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                setRows([]);
              }}
              options={subjects.map((s) => ({ value: s._id, label: `${s.name} — ${s.classRoom?.name || ''}` }))}
              placeholder="Choose…"
            />
          </Field>
          {shortTerm && (
            <Field label="For" hint="One-to-one classes only show for that student.">
              <Select
                value={student}
                onChange={(e) => setStudent(e.target.value)}
                options={students.map((s) => ({ value: s._id, label: s.name }))}
                placeholder="The whole batch"
              />
            </Field>
          )}
        </div>
        {subject && <p className="-mt-2 text-xs text-slate-500">Programme: {programLabel(program)}</p>}

        <div className="flex gap-1.5">
          {[
            { k: 'repeat', l: 'Repeat on days' },
            { k: 'one', l: 'One date' },
          ].map((m) => (
            <button
              key={m.k}
              type="button"
              onClick={() => {
                setMode(m.k);
                setRows([]);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${mode === m.k ? 'bg-maroon text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
            >
              {m.l}
            </button>
          ))}
        </div>

        {mode === 'one' ? (
          <Field label="Date">
            <input className="input sm:w-56" type="date" min={todayISO()} max={addDaysISO(todayISO(), 366)} value={one} onChange={(e) => setOne(e.target.value)} />
          </Field>
        ) : (
          <div className="space-y-3">
            <div>
              <span className="label">Days</span>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d]);
                      setRows([]);
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${days.includes(d) ? 'bg-maroon text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
                  >
                    {d.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="From">
                <input className="input" type="date" min={todayISO()} value={from} onChange={(e) => { setFrom(e.target.value); setRows([]); }} />
              </Field>
              <Field label="Until">
                <input className="input" type="date" min={from} max={addDaysISO(todayISO(), 366)} value={to} onChange={(e) => { setTo(e.target.value); setRows([]); }} />
              </Field>
              <div className="flex gap-1.5 pb-0.5">
                {[
                  ['1 week', 6],
                  ['1 month', 30],
                  ['3 months', 91],
                  ['1 year', 364],
                ].map(([l, n]) => (
                  <button key={l} type="button" className="btn-ghost btn-sm" onClick={() => { setTo(addDaysISO(from, n)); setRows([]); }}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-slate-500">{dates.length} date{dates.length === 1 ? '' : 's'} selected.</p>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <Field label={`Start time${shortTerm ? '' : ' (optional)'}`}>
            <input className="input w-32" type="time" value={startTime} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label={`End time${shortTerm ? '' : ' (optional)'}`}>
            <input className="input w-32" type="time" value={endTime} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>

        {shortTerm ? (
          <p className="rounded-lg bg-gold-50 px-4 py-3 text-xs text-slate-700">
            Short-term courses: these are class <strong>time slots</strong>. Leave topics blank — record what was covered when you mark attendance after each class.
          </p>
        ) : (
          <div>
            <button type="button" className="btn-gold btn-sm" onClick={buildRows}>
              {rows.length ? 'Refresh the list' : 'Next: enter topics for each date →'}
            </button>
          </div>
        )}

        {!!rows.length && (
          <div className="max-h-[45vh] space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-2">
            {rows.map((r, i) => (
              <div key={r._k || r.date} className="grid gap-2 rounded-lg bg-slate-50 p-2 sm:grid-cols-[8rem_7rem_1fr]">
                <div>
                  <p className="text-xs font-bold text-maroon">{fmtDate(r.date)}</p>
                  <p className="text-[11px] text-slate-500">{new Date(`${r.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long' })}</p>
                </div>
                <select className="input py-1.5 text-xs" value={r.kind} onChange={(e) => setRow(i, { kind: e.target.value })}>
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
                {r.kind === 'holiday' ? (
                  <input className="input py-1.5 text-xs" placeholder="Reason (optional) — e.g. Public holiday" value={r.title} onChange={(e) => setRow(i, { title: e.target.value })} />
                ) : (
                  <div className="grid gap-1.5">
                    <input
                      className="input py-1.5 text-xs"
                      placeholder={kindOf(r.kind).hint}
                      value={r.title}
                      onChange={(e) => setRow(i, { title: e.target.value })}
                    />
                    <input
                      className="input py-1.5 text-xs"
                      placeholder="What students will do (optional)"
                      value={r.portion}
                      onChange={(e) => setRow(i, { portion: e.target.value })}
                    />
                    {r.kind === 'test' && (
                      <input className="input w-32 py-1.5 text-xs" type="number" min="0" placeholder="Max marks" value={r.maxMarks} onChange={(e) => setRow(i, { maxMarks: e.target.value })} />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {err && <Alert onClose={() => setErr('')}>{err}</Alert>}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Edit one session                                                     */
/* ------------------------------------------------------------------ */

export function EditSessionModal({ session, onClose, onSaved, onError }) {
  const [f, setF] = useState(null);
  useEffect(() => {
    if (session) setF({ ...session, attachments: session.attachments || [] });
  }, [session]);
  if (!session || !f) return null;

  async function save(e) {
    e.preventDefault();
    try {
      const body = {
        date: f.date,
        startTime: f.startTime,
        endTime: f.endTime,
        kind: f.kind,
        title: f.title,
        portion: f.portion,
        teacherRemark: f.teacherRemark,
        maxMarks: Number(f.maxMarks) || 0,
        attachments: f.attachments,
        status: f.kind === 'holiday' ? 'cancelled' : f.status === 'cancelled' ? 'scheduled' : f.status,
      };
      await update('lessonplans', f._id, body);
      onSaved('Session updated');
    } catch (err) {
      onError(err.message);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title="Edit session"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" form="session-form">
            Save
          </button>
        </>
      }
    >
      <form id="session-form" onSubmit={save} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Date">
            <input className="input" type="date" required value={f.date || ''} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
          <Field label="Start">
            <input className="input" type="time" value={f.startTime || ''} onChange={(e) => setF({ ...f, startTime: e.target.value })} />
          </Field>
          <Field label="End">
            <input className="input" type="time" value={f.endTime || ''} onChange={(e) => setF({ ...f, endTime: e.target.value })} />
          </Field>
          <Field label="Type">
            <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} options={KINDS.map((k) => ({ value: k.value, label: k.label }))} placeholder="" />
          </Field>
        </div>
        <Field label={kindOf(f.kind).hint}>
          <input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </Field>
        <Field label="What students will do / did">
          <textarea className="input min-h-[80px]" value={f.portion || ''} onChange={(e) => setF({ ...f, portion: e.target.value })} />
        </Field>
        {f.kind === 'test' && (
          <Field label="Maximum marks">
            <input className="input w-32" type="number" min="0" value={f.maxMarks || ''} onChange={(e) => setF({ ...f, maxMarks: e.target.value })} />
          </Field>
        )}
        <Field label="Remark for students and parents">
          <input className="input" value={f.teacherRemark || ''} onChange={(e) => setF({ ...f, teacherRemark: e.target.value })} />
        </Field>
        <FileList name="Notes, slides or worksheets (optional)" value={f.attachments} onChange={(attachments) => setF({ ...f, attachments })} />
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Mark the register for one session                                    */
/* ------------------------------------------------------------------ */

export function SessionRegister({ sessionId, onSaved, onClose }) {
  const [data, setData] = useState(null);
  const [marks, setMarks] = useState({});
  const [covered, setCovered] = useState({ title: '', portion: '' });
  const [push, setPush] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState('');

  useEffect(() => {
    if (!sessionId) return;
    setData(null);
    setResult('');
    api
      .get(`/api/sessions/${sessionId}/attendance`)
      .then((d) => {
        setData(d);
        const existing = Object.fromEntries(d.marks.map((m) => [String(m.student), { status: m.status, remark: m.remark || '' }]));
        setMarks(Object.fromEntries(d.students.map((s) => [String(s._id), existing[String(s._id)] || { status: 'present', remark: '' }])));
        const blankTitle = ['Class', 'Work session', 'Revision', 'Test'].includes(d.session.title);
        setCovered({ title: blankTitle ? '' : d.session.title, portion: d.session.portion || '' });
      })
      .catch((e) => setErr(e.message));
  }, [sessionId]);

  if (!sessionId) return null;
  const s = data?.session;
  const lone = data && data.programType !== 'academic' && data.students.length === 1;
  const loneAbsent = lone && marks[String(data.students[0]._id)]?.status === 'absent';

  async function save() {
    setBusy(true);
    setErr('');
    try {
      const r = await api.post(`/api/sessions/${sessionId}/attendance`, {
        rows: data.students.map((st) => ({ student: st._id, ...marks[String(st._id)] })),
        covered: covered.title ? covered : undefined,
        pushForward: lone ? push : false,
      });
      const msg = r.pushed
        ? `Marked absent. This class and the next ${r.moved - 1} were moved forward one slot — the course now ends ${fmtDate(r.newLastDate)}. No hours deducted.`
        : `Attendance saved for ${r.saved} student${r.saved === 1 ? '' : 's'}.`;
      setResult(msg);
      onSaved?.(msg);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={s ? `Attendance — ${fmtDate(s.date)}${s.startTime ? ` · ${fmtRange(s.startTime, s.endTime)}` : ''}` : 'Attendance'}
      footer={
        result ? (
          <button className="btn-primary" onClick={onClose}>
            Done
          </button>
        ) : (
          <>
            <button className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-primary" onClick={save} disabled={busy || !data}>
              {busy ? 'Saving…' : 'Save attendance'}
            </button>
          </>
        )
      }
    >
      {err && <Alert onClose={() => setErr('')}>{err}</Alert>}
      {result ? (
        <Alert tone="success">{result}</Alert>
      ) : !data ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm">
            <Badge tone={kindOf(s.kind).tone}>{kindOf(s.kind).label}</Badge> <span className="font-semibold text-slate-800">{s.title}</span>
            {s.portion && <p className="mt-1 text-xs text-slate-600">{s.portion}</p>}
            <p className="mt-1 text-[11px] text-slate-400">{programLabel(data.programType)}</p>
          </div>

          {!data.students.length ? (
            <Empty title="No students in this session" />
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {data.students.map((st) => {
                const id = String(st._id);
                const m = marks[id] || { status: 'present', remark: '' };
                return (
                  <li key={id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <Link href={`/students/${id}`} className="text-sm font-semibold text-slate-800 hover:text-maroon hover:underline">
                        {st.name}
                      </Link>
                      <p className="text-xs text-slate-400">{st.admissionNo || ''}</p>
                    </div>
                    <div className="flex gap-1">
                      {STATUSES.map((x) => (
                        <button
                          key={x.value}
                          type="button"
                          onClick={() => setMarks({ ...marks, [id]: { ...m, status: x.value } })}
                          className={`h-9 min-w-[2.25rem] rounded-lg px-2 text-xs font-bold sm:min-w-[4.25rem] ${m.status === x.value ? x.on : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                        >
                          <span className="sm:hidden">{x.short}</span>
                          <span className="hidden sm:inline">{x.label}</span>
                        </button>
                      ))}
                    </div>
                    <input className="input py-1.5 text-xs sm:w-36" placeholder="Remark" value={m.remark} onChange={(e) => setMarks({ ...marks, [id]: { ...m, remark: e.target.value } })} />
                  </li>
                );
              })}
            </ul>
          )}

          {loneAbsent ? (
            <label className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <input type="checkbox" className="mt-0.5" checked={push} onChange={(e) => setPush(e.target.checked)} />
              <span>
                <strong>Move the schedule forward.</strong> The only student is absent, so this class and every planned class after it shift one slot later.
                No hours are deducted.
              </span>
            </label>
          ) : (
            <div className="grid gap-3 rounded-lg border border-slate-200 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {data.programType === 'short_term' ? 'What was covered in this class' : 'Topic covered (update if it changed)'}
              </p>
              <input className="input" placeholder="Topic" value={covered.title} onChange={(e) => setCovered({ ...covered, title: e.target.value })} />
              <textarea
                className="input min-h-[60px]"
                placeholder="Details / what students did (optional)"
                value={covered.portion}
                onChange={(e) => setCovered({ ...covered, portion: e.target.value })}
              />
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Pick a session on a date, then mark it (attendance page, subject page) */
/* ------------------------------------------------------------------ */

export function SessionAttendance({ subjectId, programType }) {
  const [date, setDate] = useState(todayISO());
  const [sessions, setSessions] = useState(null);
  const [registerFor, setRegisterFor] = useState(null);
  const [adding, setAdding] = useState(false);
  const [times, setTimes] = useState({ startTime: '', endTime: '' });
  const [notice, setNotice] = useState('');
  const [err, setErr] = useState('');
  const [recent, setRecent] = useState([]);

  async function load() {
    try {
      const [day, past] = await Promise.all([
        list('lessonplans', { subject: subjectId, date, sort: 'startTime', limit: 50 }),
        list('lessonplans', { subject: subjectId, date: `${addDaysISO(todayISO(), -60)}..${todayISO()}`, sort: '-date', limit: 40 }),
      ]);
      setSessions(day.items);
      setRecent(past.items.filter((x) => x.status === 'done' || x.status === 'missed'));
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    setSessions(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, date]);

  async function addClass() {
    setErr('');
    try {
      await api.post('/api/sessions', { subject: subjectId, sessions: [{ date, kind: 'class', title: '', ...times }] });
      setAdding(false);
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        {err && <Alert onClose={() => setErr('')}>{err}</Alert>}
        {notice && (
          <Alert tone="success" onClose={() => setNotice('')}>
            {notice}
          </Alert>
        )}
        <div className="card flex flex-wrap items-end gap-3 p-4">
          <Field label="Date">
            <input className="input py-1.5" type="date" max={addDaysISO(todayISO(), 1)} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <div className="flex gap-1.5 pb-0.5">
            <button type="button" className="btn-ghost btn-sm" onClick={() => setDate(addDaysISO(date, -1))}>
              ← Day before
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setDate(todayISO())}>
              Today
            </button>
          </div>
        </div>

        {!sessions ? (
          <Spinner />
        ) : sessions.length ? (
          <div className="space-y-2">
            {sessions.map((s) => (
              <div key={s._id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <SessionChip s={s} showSubject={false} />
                </div>
                {s.kind !== 'holiday' && s.status !== 'cancelled' && (
                  <button className={s.status === 'scheduled' ? 'btn-primary' : 'btn-ghost'} onClick={() => setRegisterFor(s._id)}>
                    {s.status === 'scheduled' ? 'Mark attendance' : 'View / edit register'}
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="card p-5 text-center">
            <p className="text-sm font-semibold text-slate-700">No session planned for {fmtDate(date)}.</p>
            <p className="mt-1 text-xs text-slate-500">Attendance follows the lesson planner. If a class happened anyway, add it here.</p>
            {adding ? (
              <div className="mt-3 flex flex-wrap items-end justify-center gap-2">
                <Field label="Start (optional)">
                  <input className="input w-32" type="time" value={times.startTime} onChange={(e) => setTimes({ ...times, startTime: e.target.value })} />
                </Field>
                <Field label="End (optional)">
                  <input className="input w-32" type="time" value={times.endTime} onChange={(e) => setTimes({ ...times, endTime: e.target.value })} />
                </Field>
                <button className="btn-primary" onClick={addClass}>
                  Add class
                </button>
              </div>
            ) : (
              <button className="btn-gold mt-3" onClick={() => setAdding(true)}>
                Add a class on this date
              </button>
            )}
          </div>
        )}
        {programType && programType !== 'academic' && (
          <p className="text-xs text-slate-500">
            {programLabel(programType)}: when the only student in a class is absent, the schedule moves forward one slot automatically.
          </p>
        )}
      </div>

      <div className="card">
        <header className="border-b border-slate-200/80 px-5 py-3.5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-maroon">Recent sessions</h2>
        </header>
        {recent.length ? (
          <ul className="divide-y divide-slate-100">
            {recent.map((r) => (
              <li key={r._id}>
                <button type="button" onClick={() => setDate(r.date)} className="flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left hover:bg-slate-50">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-700">{fmtDate(r.date)}</span>
                    <span className="block truncate text-xs text-slate-500">{r.title}</span>
                  </span>
                  <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="No sessions marked yet" />
        )}
      </div>

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
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Session details (click on a session)                                 */
/* ------------------------------------------------------------------ */

export function SessionDetail({ session: s, canEdit, onClose, onEdit, onDelete, onRegister, onMarks, onToggle, myStatus }) {
  const [confirm, setConfirm] = useState(false);
  if (!s) return null;
  const k = kindOf(s.kind);
  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={`${fmtDate(s.date)}${s.startTime ? ` · ${fmtRange(s.startTime, s.endTime)}` : ''}`}
      footer={
        canEdit ? (
          <div className="flex w-full flex-wrap justify-between gap-2">
            <button className="btn-danger" onClick={() => setConfirm(true)}>
              Delete
            </button>
            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost" onClick={onEdit}>
                Edit
              </button>
              {s.kind === 'test' && (
                <button className="btn-ghost" onClick={onMarks}>
                  Enter marks
                </button>
              )}
              {s.kind !== 'holiday' && s.status !== 'cancelled' && (
                <button className="btn-primary" onClick={onRegister}>
                  {s.status === 'scheduled' ? 'Mark attendance' : 'Attendance'}
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            {s.kind === 'test' && s.examDone && (
              <button className="btn-ghost" onClick={onMarks}>
                View marks
              </button>
            )}
            <button className="btn-ghost" onClick={onClose}>
              Close
            </button>
          </>
        )
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={k.tone}>{k.label}</Badge>
          <Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge>
          {myStatus && <Badge tone={STATUSES.find((x) => x.value === myStatus)?.tone}>You: {myStatus}</Badge>}
          <span className="text-xs text-slate-500">
            {s.subject?.name}
            {s.classRoom?.name ? ` · ${s.classRoom.name}` : ''}
            {s.teacher?.name ? ` · ${s.teacher.name}` : ''}
          </span>
        </div>
        <h3 className="text-lg font-bold text-maroon">{s.title}</h3>
        {s.portion && <p className="whitespace-pre-line text-sm text-slate-700">{s.portion}</p>}
        {s.teacherRemark && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{s.teacherRemark}</p>}
        {s.pushedFrom && <p className="text-xs text-amber-700">Originally planned for {fmtDate(s.pushedFrom)} — moved forward after an absence.</p>}
        {!!s.attachments?.length && (
          <div className="flex flex-wrap gap-2">
            {s.attachments.map((a, i) => (
              <FileLink key={i} url={a.url} name={a.name} size={a.size} />
            ))}
          </div>
        )}
        {canEdit && s.kind !== 'holiday' && (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            {[
              ['portionCompleted', 'Portion completed'],
              ['notesGiven', 'Notes given'],
              ...(s.kind === 'test' ? [['examDone', 'Test done']] : []),
            ].map(([field, label]) => (
              <label key={field} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium ${s[field] ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-600'}`}>
                <input type="checkbox" checked={!!s[field]} onChange={() => onToggle(field)} />
                {label}
              </label>
            ))}
          </div>
        )}
      </div>
      <Confirm
        open={confirm}
        onClose={() => setConfirm(false)}
        message={`Delete this ${k.label.toLowerCase()} on ${fmtDate(s.date)}?`}
        onConfirm={async () => {
          await onDelete();
          setConfirm(false);
        }}
      />
    </Modal>
  );
}

export { remove as removeSession, create as createRecord };
