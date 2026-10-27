import { dbConnect } from '@/lib/db';
import { User, Subject, LessonPlan, Mark, Attendance } from '@/models';
import { requireSession } from '@/lib/auth';
import { getActorContext } from '@/lib/access';
import { subjectIdsForStudent } from '@/lib/enrol';
import { ok, fail, handleError } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * The weekly progress report for one student: subject by subject, how much
 * of the plan is covered, whether notes were given, exam results, attendance.
 */
export async function GET(req, ctxParams) {
  try {
    const params = await ctxParams.params;
    const session = await requireSession();
    await dbConnect();
    const ctx = await getActorContext(session);

    const studentId = params.studentId;

    const allowed =
      session.role === 'admin' ||
      ctx.studentIds.includes(String(studentId)) ||
      (session.role === 'teacher' && ctx.studentIds.includes(String(studentId)));
    if (!allowed) return fail('You do not have access to this student', 403);

    const student = await User.findById(studentId)
      .select('name admissionNo classRoom email subjects')
      .populate('classRoom', 'name onlineClassLink')
      .lean();
    if (!student) return fail('Student not found', 404);

    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from') || '';
    const to = searchParams.get('to') || '';

    // only the subjects this student is enrolled in
    const subjectIds = await subjectIdsForStudent(student);
    const subjects = await Subject.find({ _id: { $in: subjectIds } })
      .populate('teacher', 'name')
      .lean();

    const planFilter = { subject: { $in: subjectIds } };
    if (from || to) {
      planFilter.weekOf = {};
      if (from) planFilter.weekOf.$gte = from;
      if (to) planFilter.weekOf.$lte = to;
    }

    const [plans, marks, attendance] = await Promise.all([
      LessonPlan.find(planFilter).sort('weekOf').lean(),
      Mark.find({ student: studentId }).populate('lessonPlan', 'title weekOf').lean(),
      Attendance.find({ student: studentId }).lean(),
    ]);

    const bySubject = subjects.map((s) => {
      const sPlans = plans.filter((p) => String(p.subject) === String(s._id));
      const sMarks = marks.filter((m) => String(m.subject) === String(s._id));
      const scored = sMarks.reduce(
        (acc, m) => ({ score: acc.score + (m.score || 0), max: acc.max + (m.maxScore || 0) }),
        { score: 0, max: 0 }
      );
      const sAtt = attendance.filter((a) => !a.subject || String(a.subject) === String(s._id));
      const present = sAtt.filter((a) => ['present', 'late'].includes(a.status)).length;

      return {
        subject: { _id: s._id, name: s.name, teacher: s.teacher?.name || '—' },
        plannedCount: sPlans.length,
        completedCount: sPlans.filter((p) => p.portionCompleted).length,
        notesGivenCount: sPlans.filter((p) => p.notesGiven).length,
        examCount: sPlans.filter((p) => p.examDone).length,
        marks: sMarks.map((m) => ({
          title: m.examTitle || m.lessonPlan?.title || 'Test',
          weekOf: m.lessonPlan?.weekOf || m.date,
          score: m.score,
          maxScore: m.maxScore,
          remark: m.remark,
        })),
        average: scored.max ? Math.round((scored.score / scored.max) * 100) : null,
        attendance: sAtt.length ? Math.round((present / sAtt.length) * 100) : null,
      };
    });

    const overallPresent = attendance.filter((a) => ['present', 'late'].includes(a.status)).length;

    return ok({
      student,
      bySubject,
      overall: {
        attendance: attendance.length ? Math.round((overallPresent / attendance.length) * 100) : null,
        sessions: attendance.length,
        plansCompleted: plans.filter((p) => p.portionCompleted).length,
        plansTotal: plans.length,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
