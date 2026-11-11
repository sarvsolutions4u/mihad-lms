import mongoose from 'mongoose';
import { dbConnect } from '@/lib/db';
import { Course, CourseProgress } from '@/models';
import { requireSession } from '@/lib/auth';
import { ok, fail, handleError } from '@/lib/api';
import { courseContext, courseScope, flatItems } from '@/lib/courses';

export const dynamic = 'force-dynamic';

/**
 * POST /api/courses/<id>/progress — students only
 *   { item, done: true }       mark an item completed
 *   { item, secs }             add practice time (listening / role-play), max 5 min per call
 */
export async function POST(req, { params }) {
  try {
    const { id } = await params;
    const session = await requireSession(['student']);
    await dbConnect();
    if (!mongoose.Types.ObjectId.isValid(String(id))) return fail('Course not found', 404);
    const ctx = await courseContext(session);
    const course = await Course.findOne({ _id: id, ...courseScope(session, ctx) }).select('units._id units.items._id').lean();
    if (!course) return fail('Course not found', 404);
    const b = await req.json();
    const item = flatItems(course).find((i) => String(i._id) === String(b.item));
    if (!item) return fail('Item not found', 404);
    const now = new Date();
    const inc = Math.max(0, Math.min(300, Math.floor(Number(b.secs) || 0)));
    await CourseProgress.updateOne(
      { course: course._id, student: session.uid },
      { $set: { lastItem: item._id, lastAt: now }, ...(inc ? { $inc: { practiceSecs: inc } } : {}) },
      { upsert: true }
    );
    if (b.done) {
      await CourseProgress.updateOne({ course: course._id, student: session.uid, 'done.item': { $ne: item._id } }, { $push: { done: { item: item._id, at: now } } });
    }
    return ok({});
  } catch (err) {
    return handleError(err);
  }
}
