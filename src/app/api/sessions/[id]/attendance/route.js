import mongoose from 'mongoose';
import { dbConnect } from '@/lib/db';
import { LessonPlan, Attendance, Subject, User, ClassRoom, ATTENDANCE_STATUS } from '@/models';
import { requireSession } from '@/lib/auth';
import { getActorContext } from '@/lib/access';
import { enrolledStudentsFilter } from '@/lib/enrol';
import { pushForward } from '@/lib/schedule';
import { ok, fail, handleError } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** The students a session is for: its named students, or everyone enrolled in the subject. */
async function studentsFor(session, subject) {
  if (session.students?.length) {
    return User.find({ _id: { $in: session.students }, role: 'student' }).select('name admissionNo courses').sort('name').lean();
  }
  return User.find(enrolledStudentsFilter([subject])).select('name admissionNo courses').sort('name').lean();
}

/** GET — the register for one session: students + any attendance already marked. */
export async function GET(req, ctxParams) {
  try {
    const { id } = await ctxParams.params;
    const s = await requireSession(['admin', 'teacher']);
    if (!mongoose.Types.ObjectId.isValid(id)) return fail('Session not found', 404);
    await dbConnect();
    const ctx = await getActorContext(s);
    const session = await LessonPlan.findById(id).lean();
    if (!session) return fail('Session not found', 404);
    if (s.role === 'teacher' && !ctx.subjectIds.includes(String(session.subject))) return fail('Not your subject', 403);
    const subject = await Subject.findById(session.subject).select('classRoom name').lean();
    const cls = await ClassRoom.findById(subject.classRoom).select('programType name').lean();
    const [students, marks] = await Promise.all([studentsFor(session, subject), Attendance.find({ lessonPlan: id }).lean()]);
    return ok({ session, programType: cls?.programType || 'academic', students, marks });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST — save the register for a session.
 * body: { rows: [{ student, status, remark }], covered?: { title, portion }, pushForward?: boolean }
 *
 * Short-term / University & Diploma: when the session has exactly one student
 * and they are marked absent, the session and everything after it moves forward
 * one slot (unless pushForward === false), and the class is not deducted from
 * their course hours.
 */
export async function POST(req, ctxParams) {
  try {
    const { id } = await ctxParams.params;
    const s = await requireSession(['admin', 'teacher']);
    if (!mongoose.Types.ObjectId.isValid(id)) return fail('Session not found', 404);
    const { rows, covered, pushForward: wantPush } = await req.json();
    if (!Array.isArray(rows)) return fail('rows are required', 422);

    await dbConnect();
    const ctx = await getActorContext(s);
    const session = await LessonPlan.findById(id);
    if (!session) return fail('Session not found', 404);
    if (s.role === 'teacher' && !ctx.subjectIds.includes(String(session.subject))) {
      return fail('You can only mark attendance for your own subjects', 403);
    }
    if (session.kind === 'holiday' || session.status === 'cancelled') return fail('No class on this session', 422);
    if (!session.date) return fail('This plan has no date — edit it and choose a date first', 422);

    const subject = await Subject.findById(session.subject).select('classRoom').lean();
    const cls = await ClassRoom.findById(subject.classRoom).select('programType').lean();
    const programType = cls?.programType || 'academic';
    const students = await studentsFor(session, subject);
    const allowed = new Set(students.map((st) => String(st._id)));
    const clean = rows
      .filter((r) => r.student && allowed.has(String(r.student)))
      .map((r) => ({ student: String(r.student), status: ATTENDANCE_STATUS.includes(r.status) ? r.status : 'present', remark: String(r.remark || '').slice(0, 300) }));
    if (!clean.length) return fail('No enrolled students to mark', 422);

    // --- one student, absent, not an academic batch -> push the schedule forward
    const loneAbsent = programType !== 'academic' && students.length === 1 && clean.length === 1 && clean[0].status === 'absent';
    if (loneAbsent && wantPush !== false && session.status === 'scheduled') {
      const student = students[0];
      const course = (student.courses || []).find((c) => String(c.subject) === String(session.subject));
      const result = await pushForward(session.toObject(), { courseSlots: course?.slots?.filter((x) => x.day && x.startTime) });
      await Attendance.updateOne(
        { student: clean[0].student, date: session.date, subject: session.subject },
        {
          $set: {
            student: clean[0].student,
            classRoom: session.classRoom,
            subject: session.subject,
            date: session.date,
            status: 'absent',
            remark: clean[0].remark || 'Absent — schedule moved forward',
            markedBy: s.uid,
            lessonPlan: result.missed._id,
          },
        },
        { upsert: true }
      );
      return ok({ saved: 1, pushed: true, moved: result.moved, newLastDate: result.newLastDate });
    }

    // --- normal register
    await Attendance.bulkWrite(
      clean.map((r) => ({
        updateOne: {
          filter: { student: r.student, date: session.date, subject: session.subject },
          update: {
            $set: {
              student: r.student,
              classRoom: session.classRoom,
              subject: session.subject,
              date: session.date,
              status: r.status,
              remark: r.remark,
              markedBy: s.uid,
              lessonPlan: session._id,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false }
    );

    if (covered?.title) session.title = String(covered.title).slice(0, 200);
    if (covered?.portion !== undefined) session.portion = String(covered.portion || '').slice(0, 2000);
    if (session.status === 'scheduled' || session.status === 'missed') session.status = 'done';
    if (session.kind === 'class' || session.kind === 'revision') {
      session.portionCompleted = true;
      session.completedAt ||= new Date();
    }
    await session.save();

    return ok({ saved: clean.length, pushed: false });
  } catch (err) {
    return handleError(err);
  }
}
