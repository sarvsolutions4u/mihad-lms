'use client';

import { useEffect, useMemo, useState } from 'react';
import { list, create, update, remove } from '@/lib/client';
import { useSession } from '@/components/SessionProvider';
import { useLookups } from '@/lib/useLookups';
import { PageHeader, Card, Modal, Field, Select, Alert, Spinner, Confirm, Empty } from '@/components/ui';
import Icon from '@/components/Icon';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const blank = { classRoom: '', subject: '', teacher: '', day: 'Monday', startTime: '16:00', endTime: '17:00', room: '', onlineClassLink: '' };

export default function TimetablePage() {
  const { user } = useSession();
  const isAdmin = user?.role === 'admin';
  const { classes, subjects, loading: lookLoading } = useLookups();

  const [classId, setClassId] = useState('');
  const [slots, setSlots] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    if (!classId && classes.length) setClassId(classes[0]._id);
  }, [classes, classId]);

  async function load() {
    setLoading(true);
    try {
      const calls = [list('timetable', { classRoom: classId || undefined, sort: 'startTime', limit: 500 })];
      if (isAdmin) calls.push(list('users', { role: 'teacher', sort: 'name', limit: 200 }));
      const res = await Promise.all(calls);
      setSlots(res[0].items);
      if (isAdmin) setTeachers(res[1].items);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (classId || !classes.length) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, classes.length]);

  const byDay = useMemo(() => {
    const map = Object.fromEntries(DAYS.map((d) => [d, []]));
    for (const s of slots) (map[s.day] ||= []).push(s);
    for (const d of DAYS) map[d].sort((a, b) => a.startTime.localeCompare(b.startTime));
    return map;
  }, [slots]);

  const activeDays = DAYS.filter((d) => byDay[d]?.length) ;
  const daysToShow = isAdmin ? DAYS : activeDays.length ? activeDays : DAYS.slice(0, 5);

  const currentClass = classes.find((c) => String(c._id) === String(classId));

  async function save(e) {
    e.preventDefault();
    try {
      const { _id, ...body } = form;
      if (!body.teacher) delete body.teacher;
      if (_id) await update('timetable', _id, body);
      else await create('timetable', body);
      setForm(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (lookLoading) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Class timetable"
        subtitle={isAdmin ? 'Maintained by the administrator. Each slot can carry its own online link.' : 'Your weekly schedule.'}
      >
        {classes.length > 1 && (
          <Select
            className="input"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            options={classes.map((c) => ({ value: c._id, label: c.name }))}
            placeholder="All classes"
          />
        )}
        {isAdmin && (
          <button className="btn-primary" onClick={() => setForm({ ...blank, classRoom: classId })}>
            Add slot
          </button>
        )}
      </PageHeader>

      <Alert onClose={() => setError('')}>{error}</Alert>

      {currentClass?.onlineClassLink && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold-100 bg-gold-50 px-5 py-3.5">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-gold-600">Fixed online class link</p>
            <p className="text-sm text-maroon">{currentClass.name} — the same link every session, no confusion.</p>
          </div>
          <a href={currentClass.onlineClassLink} target="_blank" rel="noreferrer" className="btn-primary btn-sm">
            <Icon name="link" className="h-3.5 w-3.5" />
            Join class
          </a>
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : !slots.length ? (
        <Card>
          <Empty
            title="No timetable entries yet"
            hint={isAdmin ? 'Add the first slot to build the weekly grid.' : 'The office has not published the timetable for this class.'}
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {daysToShow.map((day) => (
            <Card key={day} title={day} bodyClass="">
              {byDay[day]?.length ? (
                <ul className="divide-y divide-slate-100">
                  {byDay[day].map((s) => {
                    const link = s.onlineClassLink || s.subject?.onlineClassLink || currentClass?.onlineClassLink;
                    return (
                      <li key={s._id} className="px-5 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800">{s.subject?.name || '—'}</p>
                            <p className="text-xs text-slate-500">
                              {s.startTime}–{s.endTime}
                              {s.teacher?.name ? ` · ${s.teacher.name}` : ''}
                              {s.room ? ` · ${s.room}` : ''}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {link && (
                              <a href={link} target="_blank" rel="noreferrer" className="btn-ghost btn-sm" title="Join online class">
                                <Icon name="link" className="h-3.5 w-3.5" />
                              </a>
                            )}
                            {isAdmin && (
                              <>
                                <button
                                  className="btn-ghost btn-sm"
                                  onClick={() =>
                                    setForm({
                                      ...s,
                                      classRoom: s.classRoom?._id || s.classRoom,
                                      subject: s.subject?._id || s.subject,
                                      teacher: s.teacher?._id || '',
                                    })
                                  }
                                >
                                  Edit
                                </button>
                                <button
                                  className="btn-danger btn-sm"
                                  onClick={() =>
                                    setConfirm({ message: `Remove ${s.subject?.name} on ${day}?`, run: () => remove('timetable', s._id) })
                                  }
                                >
                                  ×
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="px-5 py-6 text-center text-xs text-slate-400">No classes</p>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?._id ? 'Edit timetable slot' : 'Add timetable slot'}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setForm(null)}>
              Cancel
            </button>
            <button className="btn-primary" form="slot-form">
              Save
            </button>
          </>
        }
      >
        {form && (
          <form id="slot-form" onSubmit={save} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
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
                  required
                  value={form.subject}
                  onChange={(e) => {
                    const sub = subjects.find((s) => String(s._id) === e.target.value);
                    setForm({ ...form, subject: e.target.value, teacher: sub?.teacher?._id || form.teacher });
                  }}
                  options={subjects
                    .filter((s) => String(s.classRoom?._id || s.classRoom) === String(form.classRoom))
                    .map((s) => ({ value: s._id, label: s.name }))}
                  placeholder="Choose…"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Day">
                <Select
                  required
                  value={form.day}
                  onChange={(e) => setForm({ ...form, day: e.target.value })}
                  options={DAYS}
                  placeholder=""
                />
              </Field>
              <Field label="Start">
                <input
                  className="input"
                  type="time"
                  required
                  value={form.startTime}
                  onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                />
              </Field>
              <Field label="End">
                <input
                  className="input"
                  type="time"
                  required
                  value={form.endTime}
                  onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Teacher">
                <Select
                  value={form.teacher || ''}
                  onChange={(e) => setForm({ ...form, teacher: e.target.value })}
                  options={teachers.map((t) => ({ value: t._id, label: t.name }))}
                  placeholder="From the subject"
                />
              </Field>
              <Field label="Room">
                <input className="input" value={form.room || ''} onChange={(e) => setForm({ ...form, room: e.target.value })} />
              </Field>
            </div>

            <Field label="Online link for this slot" hint="Optional — otherwise the class link is used.">
              <input
                className="input"
                value={form.onlineClassLink || ''}
                onChange={(e) => setForm({ ...form, onlineClassLink: e.target.value })}
              />
            </Field>
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
