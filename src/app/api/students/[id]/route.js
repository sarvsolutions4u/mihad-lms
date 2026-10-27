import mongoose from 'mongoose';
import { dbConnect } from '@/lib/db';
import { User, Subject, Attendance, Mark, Submission, Fee } from '@/models';
import { requireSession } from '@/lib/auth';
import { getActorContext } from '@/lib/access';
import { subjectIdsForStudent } from '@/lib/enrol';
import { ok, fail, handleError } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * One student's full picture.
 *   admin   — everything, including fees and parent contacts
 *   teacher — students enrolled in their subjects (no fees)
 *   parent  — their own children (with fees)
 *   student — themselves (no fees)
 */
export async function GET(req, ctxParams) {
  try {
    const { id } = await ctxParams.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return fail('Student not found', 404);

    const session = await requireSession();
    await dbConnect();
    const ctx = await getActorContext(session);

    const allowed =
      session.role === 'admin' ||
      (session.role === 'teacher' && ctx.studentIds.includes(id)) ||
      (session.role === 'parent' && ctx.studentIds.includes(id)) ||
      (session.role === 'student' && ctx.uid === id);
    if (!allowed) return fail('You do not have access to this student', 403);

    const student = await User.findOne({ _id: id, role: 'student' })
      .select('name email phone admissionNo classRoom subjects active createdAt lastLoginAt')
      .populate('classRoom', 'name onlineClassLink')
      .lean();
    if (!student) return fail('Student not found', 404);

    const subjectIds = await subjectIdsForStudent(student);
    const subjects = await Subject.find({ _id: { $in: subjectIds } })
      .populate('classRoom', 'name')
      .populate('teacher', 'name')
      .sort('name')
      .lean();

    const showFees = session.role === 'admin' || session.role === 'parent';
    const showParents = session.role !== 'student';

    const [attendance, marks, submissions, fees, parents] = await Promise.all([
      Attendance.find({ student: id }).sort({ date: -1 }).limit(200).populate('subject', 'name').lean(),
      Mark.find({ student: id }).sort({ date: -1, createdAt: -1 }).populate('subject', 'name').lean(),
      Submission.find({ student: id })
        .sort('-submittedAt')
        .populate({ path: 'task', select: 'title type deadline maxMarks subject', populate: { path: 'subject', select: 'name' } })
        .lean(),
      showFees ? Fee.find({ student: id }).sort('dueDate').lean() : Promise.resolve(null),
      showParents ? User.find({ role: 'parent', children: id }).select('name email phone').lean() : Promise.resolve(null),
    ]);

    // attendance rate overall and per subject
    const bySubject = {};
    let present = 0;
    for (const a of attendance) {
      const key = a.subject?._id ? String(a.subject._id) : 'day';
      bySubject[key] ||= { name: a.subject?.name || 'Whole day', total: 0, present: 0 };
      bySubject[key].total += 1;
      if (['present', 'late'].includes(a.status)) {
        bySubject[key].present += 1;
        present += 1;
      }
    }

    return ok({
      student: { ...student, enrolment: student.subjects?.length ? 'chosen' : 'batch' },
      subjects,
      attendance,
      attendanceSummary: {
        total: attendance.length,
        present,
        pct: attendance.length ? Math.round((present / attendance.length) * 100) : null,
        bySubject: Object.entries(bySubject).map(([k, v]) => ({ subject: k, ...v, pct: Math.round((v.present / v.total) * 100) })),
      },
      marks,
      submissions,
      fees,
      parents,
      canManage: session.role === 'admin',
    });
  } catch (err) {
    return handleError(err);
  }
}
