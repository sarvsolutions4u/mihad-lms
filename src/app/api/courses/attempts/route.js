import { dbConnect } from '@/lib/db';
import { Course, SpeakingAttempt } from '@/models';
import { requireSession } from '@/lib/auth';
import { ok, handleError } from '@/lib/api';
import { courseContext, courseScope, canManage } from '@/lib/courses';

export const dynamic = 'force-dynamic';

/**
 * GET /api/courses/attempts?status=submitted|reviewed
 *   trainers / admin: recordings across all the courses they manage (the review list)
 *   students: their own recordings and feedback across courses
 */
export async function GET(req) {
  try {
    const session = await requireSession(['admin', 'teacher', 'student']);
    await dbConnect();
    const ctx = await courseContext(session);
    const filter = {};
    if (session.role === 'student') filter.student = session.uid;
    else {
      const courses = await Course.find(courseScope(session, ctx)).select('subjects createdBy').lean();
      filter.course = { $in: courses.filter((c) => canManage(session, ctx, c)).map((c) => c._id) };
    }
    const st = new URL(req.url).searchParams.get('status');
    if (['submitted', 'reviewed'].includes(st)) filter.status = st;
    const attempts = await SpeakingAttempt.find(filter)
      .sort({ createdAt: st === 'submitted' ? 1 : -1 })
      .limit(200)
      .populate('course', 'title')
      .populate({ path: 'student', select: 'name admissionNo classRoom', populate: { path: 'classRoom', select: 'name' } })
      .populate('reviewedBy', 'name')
      .lean();
    return ok({ attempts });
  } catch (err) {
    return handleError(err);
  }
}
