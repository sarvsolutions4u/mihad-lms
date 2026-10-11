import { dbConnect } from '@/lib/db';
import { Mark, LessonPlan, Subject } from '@/models';
import { requireSession } from '@/lib/auth';
import { getActorContext } from '@/lib/access';
import { ok, fail, handleError } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Enter a whole class's marks against one lesson plan / exam.
 * body: { lessonPlan, rows: [{ student, score, remark }] }
 */
export async function POST(req) {
  try {
    const session = await requireSession(['admin', 'teacher']);
    const { lessonPlan: lessonPlanId, rows } = await req.json();

    if (!lessonPlanId || !Array.isArray(rows)) return fail('lessonPlan and rows are required', 422);

    await dbConnect();
    const ctx = await getActorContext(session);

    const plan = await LessonPlan.findById(lessonPlanId).lean();
    if (!plan) return fail('Lesson plan not found', 404);
    if (session.role === 'teacher' && String(plan.teacher) !== ctx.uid) {
      return fail('This lesson plan belongs to another teacher', 403);
    }

    const subject = await Subject.findById(plan.subject).select('_id').lean();
    if (!subject) return fail('Subject not found', 404);

    const ops = rows
      .filter((r) => r.student && r.score !== '' && r.score !== null && r.score !== undefined)
      .map((r) => ({
        updateOne: {
          filter: { student: r.student, lessonPlan: lessonPlanId },
          update: {
            $set: {
              student: r.student,
              lessonPlan: lessonPlanId,
              subject: plan.subject,
              classRoom: plan.classRoom,
              examTitle: plan.examTitle || plan.title,
              date: plan.examDate || plan.plannedDate || '',
              score: Number(r.score) || 0,
              maxScore: Number(plan.maxMarks) || 100,
              remark: r.remark || '',
              enteredBy: ctx.uid,
            },
          },
          upsert: true,
        },
      }));

    if (ops.length) await Mark.bulkWrite(ops, { ordered: false });

    // Entering marks implies the exam happened.
    await LessonPlan.updateOne({ _id: lessonPlanId }, { $set: { examDone: true } });

    return ok({ saved: ops.length });
  } catch (err) {
    return handleError(err);
  }
}
