import { dbConnect } from '@/lib/db';
import { Course, SpeakingAttempt } from '@/models';
import { requireSession } from '@/lib/auth';
import { ok, handleError } from '@/lib/api';
import { courseContext, courseScope, canManage } from '@/lib/courses';

export const dynamic = 'force-dynamic';

/** GET — menu badge: new feedback (students) or recordings waiting for review (trainers / admin). */
export async function GET() {
  try {
    const session = await requireSession();
    if (!['admin', 'teacher', 'student'].includes(session.role)) return ok({ count: 0 });
    await dbConnect();
    if (session.role === 'student') {
      return ok({ count: await SpeakingAttempt.countDocuments({ student: session.uid, status: 'reviewed', seen: false }), kind: 'feedback' });
    }
    const ctx = await courseContext(session);
    const courses = await Course.find(courseScope(session, ctx)).select('subjects createdBy').lean();
    const ids = courses.filter((c) => canManage(session, ctx, c)).map((c) => c._id);
    return ok({ count: await SpeakingAttempt.countDocuments({ course: { $in: ids }, status: 'submitted' }), kind: 'review' });
  } catch (err) {
    return handleError(err);
  }
}
