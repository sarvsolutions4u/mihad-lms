import mongoose from 'mongoose';
import { LessonPlan, Attendance, Subject } from '@/models';

/**
 * Sessions (stored as LessonPlan documents) are the schedule: each one is a
 * dated class / work / test / revision / holiday for a subject, optionally for
 * named students only (one-to-one short-term courses).
 */

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const dayOf = (iso) => DAY_NAMES[new Date(`${iso}T00:00:00Z`).getUTCDay()];
export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const minutesBetween = (a, b) => {
  const m = (t) => (/^\d{1,2}:\d{2}$/.test(t || '') ? Number(t.split(':')[0]) * 60 + Number(t.split(':')[1]) : null);
  const x = m(a);
  const y = m(b);
  return x !== null && y !== null && y > x ? y - x : 0;
};

const oid = (v) => new mongoose.Types.ObjectId(String(v));

/** Sessions that belong to the same series as `session` (same subject, same student list). */
export function seriesFilter(session) {
  const ids = (session.students || []).map((s) => oid(s._id || s));
  return ids.length
    ? { subject: session.subject, students: { $all: ids, $size: ids.length } }
    : { subject: session.subject, $or: [{ students: { $size: 0 } }, { students: { $exists: false } }] };
}

/**
 * Dates from `from` (inclusive) that fall on the given weekdays, `count` of them.
 * slots: [{ day, startTime, endTime }]
 */
export function slotDates(from, slots, count, maxDays = 400) {
  const out = [];
  const byDay = new Map(slots.filter((s) => s.day).map((s) => [s.day, s]));
  if (!byDay.size) return out;
  for (let i = 0; i < maxDays && out.length < count; i += 1) {
    const d = addDays(from, i);
    const slot = byDay.get(dayOf(d));
    if (slot) out.push({ date: d, startTime: slot.startTime || '', endTime: slot.endTime || '' });
  }
  return out;
}

/** The next free slot after the series' last session, following its weekly pattern. */
async function nextSlotAfter(last, series, courseSlots) {
  if (courseSlots?.length) {
    const [next] = slotDates(addDays(last.date, 1), courseSlots, 1);
    if (next) return next;
  }
  // weekly pattern of the series: weekdays + times used in the last 8 weeks
  const recent = await LessonPlan.find({ ...series, date: { $gte: addDays(last.date, -56), $lte: last.date }, status: { $ne: 'cancelled' } })
    .select('date startTime endTime')
    .lean();
  const pattern = new Map();
  for (const s of recent) if (s.date) pattern.set(dayOf(s.date), { day: dayOf(s.date), startTime: s.startTime, endTime: s.endTime });
  const [next] = slotDates(addDays(last.date, 1), [...pattern.values()], 1);
  return next || { date: addDays(last.date, 7), startTime: last.startTime, endTime: last.endTime };
}

/**
 * The only student missed `session`: move it and every later planned session of
 * the series forward by one slot, and leave a "missed" marker on the original date
 * (so attendance has something to point to and hours aren't deducted).
 * Returns { missed, moved, newLastDate }.
 */
export async function pushForward(session, { courseSlots } = {}) {
  const series = seriesFilter(session);
  const upcoming = await LessonPlan.find({
    $and: [
      series,
      { status: 'scheduled' },
      { $or: [{ date: { $gt: session.date } }, { date: session.date, startTime: { $gte: session.startTime || '' } }] },
    ],
  })
    .sort({ date: 1, startTime: 1 })
    .lean();
  const chain = upcoming.some((s) => String(s._id) === String(session._id)) ? upcoming : [session, ...upcoming];

  const slots = chain.map((s) => ({ date: s.date, startTime: s.startTime, endTime: s.endTime }));
  slots.push(await nextSlotAfter(chain[chain.length - 1], series, courseSlots));

  // move from the end backwards so dates never collide
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const s = chain[i];
    await LessonPlan.updateOne(
      { _id: s._id },
      {
        $set: {
          date: slots[i + 1].date,
          plannedDate: slots[i + 1].date,
          weekOf: mondayOf(slots[i + 1].date),
          startTime: slots[i + 1].startTime || s.startTime,
          endTime: slots[i + 1].endTime || s.endTime,
          durationMins: minutesBetween(slots[i + 1].startTime || s.startTime, slots[i + 1].endTime || s.endTime),
          pushedFrom: s.pushedFrom || s.date,
        },
      }
    );
  }

  const missed = await LessonPlan.create({
    classRoom: session.classRoom,
    subject: session.subject,
    teacher: session.teacher,
    students: session.students || [],
    date: session.date,
    startTime: session.startTime,
    endTime: session.endTime,
    kind: 'class',
    title: 'Missed — student absent',
    portion: `Planned "${session.title}" moved to ${slots[1].date}.`,
    status: 'missed',
  });
  return { missed, moved: chain.length, newLastDate: slots[slots.length - 1].date };
}

function mondayOf(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return d.toISOString().slice(0, 10);
}

/**
 * Hours used / left for a student's short-term courses.
 * Only sessions the student attended (present / late) are deducted.
 */
export async function courseProgress(student, today) {
  const courses = (student.courses || []).filter((c) => c.subject);
  if (!courses.length) return [];
  const subjectIds = courses.map((c) => c.subject._id || c.subject);
  const [subjects, att, upcoming] = await Promise.all([
    Subject.find({ _id: { $in: subjectIds } }).select('name').lean(),
    Attendance.find({ student: student._id, subject: { $in: subjectIds } }).populate('lessonPlan', 'durationMins startTime endTime').lean(),
    LessonPlan.find({
      subject: { $in: subjectIds },
      status: 'scheduled',
      date: { $gte: today },
      $or: [{ students: student._id }, { students: { $size: 0 } }],
    })
      .sort({ date: 1, startTime: 1 })
      .select('subject date startTime endTime durationMins')
      .lean(),
  ]);
  const nameOf = Object.fromEntries(subjects.map((s) => [String(s._id), s.name]));

  return courses.map((c) => {
    const sid = String(c.subject._id || c.subject);
    const mine = att.filter((a) => String(a.subject) === sid);
    const attended = mine.filter((a) => ['present', 'late'].includes(a.status));
    const usedMins = attended.reduce((sum, a) => sum + (a.lessonPlan?.durationMins || 60), 0);
    const totalMins = Math.round((c.totalHours || 0) * 60);
    const next = upcoming.filter((u) => String(u.subject) === sid);
    return {
      subject: sid,
      subjectName: nameOf[sid] || 'Course',
      totalHours: c.totalHours || 0,
      usedHours: Math.round((usedMins / 60) * 10) / 10,
      leftHours: Math.max(0, Math.round(((totalMins - usedMins) / 60) * 10) / 10),
      pct: totalMins ? Math.min(100, Math.round((usedMins / totalMins) * 100)) : 0,
      attended: attended.length,
      missed: mine.filter((a) => a.status === 'absent').length,
      nextSession: next[0] || null,
      lastPlanned: next[next.length - 1]?.date || '',
      slots: c.slots || [],
      startDate: c.startDate || '',
    };
  });
}
