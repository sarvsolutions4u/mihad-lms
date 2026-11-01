import mongoose from 'mongoose';
import { dbConnect } from '@/lib/db';
import { LessonPlan, Subject, User, Attendance } from '@/models';
import { requireSession } from '@/lib/auth';
import { getActorContext } from '@/lib/access';
import { ok, fail, handleError, todayISO } from '@/lib/api';
import { slotDates, minutesBetween } from '@/lib/schedule';

export const dynamic = 'force-dynamic';

/**
 * Short-term courses: build a student's one-to-one class slots from their
 * course settings (weekly days + times) until their total hours are covered.
 * Hours already attended and slots already planned are taken into account,
 * so running it again only tops the schedule up.
 * body: { student, subject, from? }
 */
export async function POST(req) {
  try {
    const session = await requireSession(['admin', 'teacher']);
    const { student: studentId, subject: subjectId, from } = await req.json();
    if (![studentId, subjectId].every((v) => mongoose.Types.ObjectId.isValid(String(v || '')))) {
      return fail('Choose the student and the course', 422);
    }
    await dbConnect();
    const ctx = await getActorContext(session);

    const [student, subject] = await Promise.all([
      User.findOne({ _id: studentId, role: 'student' }).select('name courses').lean(),
      Subject.findById(subjectId).select('classRoom teacher name').lean(),
    ]);
    if (!student || !subject) return fail('Student or course not found', 404);
    if (session.role === 'teacher' && !ctx.subjectIds.includes(String(subject._id))) {
      return fail('You can only schedule your own courses', 403);
    }

    const course = (student.courses || []).find((c) => String(c.subject) === String(subjectId));
    if (!course || !course.totalHours) return fail(`Set the total course hours for ${student.name} first (People → Edit)`, 422);
    const slots = (course.slots || []).filter((s) => s.day && s.startTime && s.endTime);
    if (!slots.length) return fail(`Add ${student.name}'s weekly class days and times first (People → Edit)`, 422);

    const today = todayISO();
    const [attended, planned] = await Promise.all([
      Attendance.find({ student: studentId, subject: subjectId, status: { $in: ['present', 'late'] } })
        .populate('lessonPlan', 'durationMins')
        .lean(),
      LessonPlan.find({ subject: subjectId, students: studentId, status: 'scheduled', date: { $gte: today } })
        .sort({ date: -1 })
        .select('date durationMins')
        .lean(),
    ]);
    const coveredMins =
      attended.reduce((s, a) => s + (a.lessonPlan?.durationMins || 60), 0) + planned.reduce((s, p) => s + (p.durationMins || 0), 0);
    let needMins = Math.round(course.totalHours * 60) - coveredMins;
    if (needMins <= 0) return ok({ created: 0, message: 'The schedule already covers all the course hours.' });

    // start from the latest of: today, the course start date, the requested date,
    // and the day after the last slot already planned
    const begin = [from, course.startDate, today, planned.length ? nextDay(planned[0].date) : ''].filter(Boolean).sort().pop();
    const candidates = slotDates(begin, slots, 400);

    const docs = [];
    for (const c of candidates) {
      if (needMins <= 0) break;
      const mins = minutesBetween(c.startTime, c.endTime) || 60;
      docs.push({
        classRoom: subject.classRoom,
        subject: subject._id,
        teacher: subject.teacher || ctx.uid,
        students: [student._id],
        date: c.date,
        startTime: c.startTime,
        endTime: c.endTime,
        kind: 'class',
        title: '',
        status: 'scheduled',
      });
      needMins -= mins;
    }
    if (!docs.length) return ok({ created: 0, message: 'No free slots found in the next year.' });
    await LessonPlan.create(docs);
    return ok({ created: docs.length, first: docs[0].date, last: docs[docs.length - 1].date }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

function nextDay(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
