import mongoose from 'mongoose';
import { dbConnect } from '@/lib/db';
import { Attendance, Subject, User, ATTENDANCE_STATUS } from '@/models';
import { requireSession } from '@/lib/auth';
import { getActorContext } from '@/lib/access';
import { enrolledStudentsFilter } from '@/lib/enrol';
import { ok, fail, handleError } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Mark a register in one go.
 * body: { date, subject?, classRoom?, rows: [{ student, status, remark }] }
 *
 *   admin   — any subject, or a whole-day register for a class (no subject)
 *   teacher — only subjects assigned to them, and only enrolled students
 */
export async function POST(req) {
  try {
    const session = await requireSession(['admin', 'teacher']);
    const { classRoom, date, subject, rows } = await req.json();

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('Choose a valid date', 422);
    if (!Array.isArray(rows)) return fail('rows are required', 422);

    await dbConnect();
    const ctx = await getActorContext(session);

    let classId = classRoom;
    let allowed = null; // Set of student ids that may be marked

    if (subject) {
      const subj = await Subject.findById(subject).select('_id classRoom').lean();
      if (!subj) return fail('Subject not found', 404);
      if (session.role === 'teacher' && !ctx.subjectIds.includes(String(subj._id))) {
        return fail('You can only mark attendance for your own subjects', 403);
      }
      classId = subj.classRoom;
      const enrolled = await User.find(enrolledStudentsFilter([subj])).select('_id').lean();
      allowed = new Set(enrolled.map((s) => String(s._id)));
    } else {
      if (session.role === 'teacher') return fail('Choose one of your subjects', 422);
      if (!classId) return fail('Choose a class or a subject', 422);
      const inClass = await User.find({ role: 'student', classRoom: classId }).select('_id').lean();
      allowed = new Set(inClass.map((s) => String(s._id)));
    }

    const ops = rows
      .filter((r) => r.student && mongoose.Types.ObjectId.isValid(r.student) && allowed.has(String(r.student)))
      .map((r) => ({
        updateOne: {
          filter: { student: r.student, date, subject: subject || null },
          update: {
            $set: {
              student: r.student,
              classRoom: classId,
              subject: subject || null,
              date,
              status: ATTENDANCE_STATUS.includes(r.status) ? r.status : 'present',
              remark: String(r.remark || '').slice(0, 300),
              markedBy: session.uid,
            },
          },
          upsert: true,
        },
      }));

    if (!ops.length) return fail('No enrolled students to mark', 422);
    await Attendance.bulkWrite(ops, { ordered: false });

    return ok({ saved: ops.length, skipped: rows.length - ops.length });
  } catch (err) {
    return handleError(err);
  }
}
