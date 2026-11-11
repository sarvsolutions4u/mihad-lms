import mongoose from 'mongoose';
import { dbConnect } from '@/lib/db';
import { Course, SpeakingAttempt } from '@/models';
import { requireSession } from '@/lib/auth';
import { ok, fail, handleError } from '@/lib/api';
import { courseContext, canManage } from '@/lib/courses';
import { FEEDBACK_TAGS as TAGS } from '@/lib/courseShared';

export const dynamic = 'force-dynamic';


/**
 * PATCH /api/courses/attempts/<id>
 *   trainer / admin: { rating 1–5, tags: [...], feedback } → reviewed
 *   student (own):   { seen: true }
 */
export async function PATCH(req, { params }) {
  try {
    const { aid } = await params;
    const session = await requireSession(['admin', 'teacher', 'student']);
    await dbConnect();
    if (!mongoose.Types.ObjectId.isValid(String(aid))) return fail('Recording not found', 404);
    const a = await SpeakingAttempt.findById(aid).lean();
    if (!a) return fail('Recording not found', 404);
    const b = await req.json();

    if (session.role === 'student') {
      if (String(a.student) !== String(session.uid)) return fail('Recording not found', 404);
      await SpeakingAttempt.updateOne({ _id: a._id }, { $set: { seen: true } });
      return ok({});
    }

    const ctx = await courseContext(session);
    const course = await Course.findById(a.course).select('subjects createdBy').lean();
    if (!course || !canManage(session, ctx, course)) return fail('Recording not found', 404);
    const rating = Math.round(Number(b.rating));
    if (!(rating >= 1 && rating <= 5)) return fail('Give a rating from 1 to 5 stars', 422);
    const tags = (Array.isArray(b.tags) ? b.tags : []).filter((t) => TAGS.includes(t));
    await SpeakingAttempt.updateOne(
      { _id: a._id },
      { $set: { rating, tags, feedback: String(b.feedback || '').slice(0, 2000), status: 'reviewed', reviewedBy: session.uid, reviewedAt: new Date(), seen: false } }
    );
    return ok({});
  } catch (err) {
    return handleError(err);
  }
}
